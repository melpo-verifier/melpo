const {
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");
const { Application, Verification, InviteTracker } = require("../../dbObjects.js");
const {
  rateLimitedOperation,
  checkManagerPermission,
  isInReviewChannel,
  VerificationStatus,
  processLogMessages,
  cleanupVerificationData,
  sendDenyDM,
  createNoApplicationEmbed,
} = require("../../js/verificationHandler.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("deny")
    .setDescription("denies (multiple) people")
    .setContexts(0)
    .addStringOption((option) =>
      option
        .setName("users")
        .setDescription("The users to deny (mention them or provide their IDs)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("application")
        .setDescription("The application to use for denial (required if multiple exist)")
        .setAutocomplete(true)
        .setRequired(false),
    ),

  async autocomplete(interaction) {
    const applications = await Application.findAll({
      where: { server_id: interaction.guild.id },
    });

    const focusedValue = interaction.options.getFocused().toLowerCase();
    const filtered = applications
      .map((app) => app.name)
      .filter((name) => name.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    await interaction.respond(filtered.map((name) => ({ name, value: name })));
  },

  async execute({ interaction, client }) {
    // Fetch all applications for this guild
    const applications = await Application.findAll({
      where: { server_id: interaction.guild.id },
    });

    if (!applications || applications.length === 0) {
      return interaction.reply({
        content: "No applications configured for this server. Please set up an application using `/setup`.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Determine which application to use
    let application;
    const appNameOption = interaction.options.getString("application");

    if (applications.length === 1) {
      application = applications[0];
    } else if (appNameOption) {
      application = applications.find((app) => app.name === appNameOption);
      if (!application) {
        return interaction.reply({
          content: `Application "${appNameOption}" not found. Available applications: ${applications.map((a) => a.name).join(", ")}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      return interaction.reply({
        content: `Multiple applications exist for this server. Please specify which one to use with the \`application\` option.\nAvailable: ${applications.map((a) => a.name).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check manager permissions
    const permCheck = await checkManagerPermission(interaction, application);
    if (!permCheck.allowed) {
      return interaction.reply({
        content: permCheck.message,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (application.reviewchannel && !isInReviewChannel(interaction, application.reviewchannel)) {
      return interaction.reply({
        content: `Please use this command in <#${application.reviewchannel}> or its threads, or set up a manager role in \`/setup\` to use this command everywhere.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!application?.verifiedrole || application.verifiedrole.length === 0) {
      return interaction.reply({
        content: "Please set a verified role in the server configuration by using the `/setup` command",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Parse user IDs
    const usersString = interaction.options.getString("users");
    const userMentions = usersString.match(/<@!?(\d+)>/g) || [];
    const userIds = usersString.match(/\b\d{17,19}\b/g) || [];

    const allUserIds = [
      ...new Set([
        ...(userMentions ? userMentions.map((mention) => mention.replace(/[<@!>]/g, "")) : []),
        ...userIds,
      ]),
    ];

    if (allUserIds.length === 0) {
      return interaction.reply({
        content: "No valid user mentions or IDs found.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const users = [];
    for (const id of allUserIds) {
      try {
        const user = await interaction.guild.members.fetch(id);
        if (user) users.push(user);
      } catch {
        // User not found, will be handled in results
      }
    }

    if (users.length === 0) {
      return interaction.reply({
        content: "No valid users found in the guild.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (users.some((user) => user.user.bot)) {
      return interaction.reply({
        content: "You cannot deny a bot.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply(`Denying ${users.length} user(s)...`);

    const results = { success: [], notFound: [] };

    for (const userID of allUserIds) {
      try {
        const user = await interaction.guild.members.fetch(userID);
        if (!user) throw new Error("User not found");

        // Get verification data
        const verification = await Verification.findOne({ where: { userId: userID } });
        const messageids = verification?.guildVerifications?.[interaction.guild.id] || [];
        const invitetracker = await InviteTracker.findOne({
          where: { unique_id: `${userID}_${interaction.guild.id}` },
        });

        // Process log messages
        await processLogMessages({
          interaction,
          client,
          application,
          messageids,
          user,
          status: VerificationStatus.DENIED,
          useRateLimiting: true,
        });

        // If no messages and separate log channel, send "no application" embed
        if (
          application.verifylogs &&
          application.reviewchannel !== application.verifylogs &&
          (!messageids || messageids.length === 0)
        ) {
          const logChannel = interaction.guild.channels.cache.get(application.verifylogs);
          if (logChannel) {
            const embed = createNoApplicationEmbed(user, interaction, invitetracker, VerificationStatus.DENIED);
            await rateLimitedOperation(async () => {
              await logChannel.send({ content: `<@${userID}>`, embeds: [embed] });
            });
          }
        } else if (
          !application.verifylogs &&
          (!messageids || messageids.length === 0)
        ) {
          // No log channel, no messages - create embed in current channel
          const embed = createNoApplicationEmbed(user, interaction, invitetracker, VerificationStatus.DENIED);
          await rateLimitedOperation(async () => {
            await interaction.channel.send({ embeds: [embed] });
          });
        }

        // Cleanup verification data
        if (messageids && messageids.length > 0) {
          await cleanupVerificationData(verification, interaction.guild.id);
        }

        // Send denial DM
        await sendDenyDM(user.user, interaction.guild.name);

        results.success.push(userID);
      } catch (error) {
        console.error(`Error processing user ${userID}: ${error.message}`);
        results.notFound.push(userID);
      }
    }

    let replyMessage = "";
    if (results.success.length > 0) {
      replyMessage += `**Successfully denied:** ${results.success.map((id) => `<@${id}>`).join(", ")}`;
    }
    if (results.notFound.length > 0) {
      replyMessage += `\n**Users not found:** ${results.notFound.map((id) => `<@${id}>`).join(", ")}`;
    }

    await interaction.editReply(replyMessage);
  },
};
