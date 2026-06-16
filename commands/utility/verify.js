const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const { Application, Verification, InviteTracker } = require("../../dbObjects.js");
const {
  rateLimitedOperation,
  checkManagerPermission,
  isInReviewChannel,
  validateRoles,
  VerificationStatus,
  processLogMessages,
  cleanupVerificationData,
  sendWelcomeMessage,
  sendVerifyDM,
  applyRoles,
  createNoApplicationEmbed,
  getMessageIds
} = require("../../js/verificationHandler.js");
const { getLatestSubmissionByUser } = require("../../js/DBFunctions.js");
const { sendWebhookMessage } = require("../../js/messageHelper.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("verifies (multiple) people")
    .setContexts(0)
    .addStringOption((option) =>
      option
        .setName("users")
        .setDescription("The users to verify (mention them or provide their IDs)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("application")
        .setDescription("The application to use for verification (required if multiple exist)")
        .setAutocomplete(true)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const applications = await Application.findAll({ where: { server_id: interaction.guild.id } });

    const focusedValue = interaction.options.getFocused().toLowerCase();
    const filtered = applications
      .map((app) => app.name)
      .filter((name) => name.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    await interaction.respond(filtered.map((name) => ({ name, value: name })));
  },

  async execute({ interaction, client }) {
    // Fetch all applications for this guild
    const applications = await Application.findAll({ where: { server_id: interaction.guild.id } });

    if (!applications || applications.length === 0) {
      return interaction.reply({
        content: "No applications configured for this server. Please set up an application using `/setup`.",
        flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });
      }
    } else {
      return interaction.reply({
        content: `Multiple applications exist for this server. Please specify which one to use with the \`application\` option.\nAvailable: ${applications.map((a) => a.name).join(", ")}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Check manager permissions
    const permCheck = await checkManagerPermission(interaction, application);
    console.log(permCheck)

    if (!permCheck.allowed) {
      return interaction.reply({
        content: permCheck.message,
        flags: MessageFlags.Ephemeral
      });
    }
    if (application.reviewchannel && !isInReviewChannel(interaction, application.reviewchannel)) {
      return interaction.reply({
        content: `Please use this command in <#${application.reviewchannel}> or its threads, or set up a manager role in \`/setup\` to use this command everywhere.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Validate roles
    const roleErrors = await validateRoles(
      interaction,
      application.verifiedrole,
      application.unverifiedrole
    );
    if (roleErrors.length > 0) {
      return interaction.reply({
        content: roleErrors[0],
        flags: MessageFlags.Ephemeral
      });
    }

    // Check bot permissions
    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({
        content: "I do not have the required permissions to manage roles",
        flags: MessageFlags.Ephemeral
      });
    }

    // Parse user IDs
    const usersString = interaction.options.getString("users");
    const userMentions = usersString.match(/<@!?(\d+)>/g) || [];
    const userIds = usersString.match(/\b\d{17,19}\b/g) || [];

    const allUserIds = [
      ...new Set([
        ...(userMentions ? userMentions.map((mention) => mention.replace(/[<@!>]/g, "")) : []),
        ...userIds
      ]),
    ];

    if (allUserIds.length === 0) {
      return interaction.reply({
        content: "No valid user mentions or IDs found.",
        flags: MessageFlags.Ephemeral
      });
    }

    const users = allUserIds
      .map((id) => interaction.guild.members.cache.get(id))
      .filter((user) => user);

    if (users.length === 0) {
      return interaction.reply({
        content: "No valid users found in the guild.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (users.some((user) => user.user.bot)) {
      return interaction.reply({
        content: "You cannot verify a bot.",
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.reply(`Verifying ${users.length} user(s)...`);

    const results         = { success: [], notFound: [] };
    const verifiedRoles   = application.verifiedrole;
    const unverifiedRoles = application.unverifiedrole;
    const welcomeMessage  = application.verificationwelcomemessage;
    const welcomeChannel  = application.verificationwelcomechannel;

    for (const userID of allUserIds) {
      try {
        const user = await interaction.guild.members.fetch(userID);
        if (!user) throw new Error("User not found");

        //get branchroles
        const submissionData = await getLatestSubmissionByUser(userID, application.id);
        console.log("Submission data:", submissionData);
        const branchRoles = new Set();
        const regexErrors = []

        if (submissionData && Array.isArray(submissionData.responses)) {
          const questionsMap = new Map(application.questions.filter(q => q && q.id).map(q => [q.id, q]));

          for (const response of submissionData.responses) {
            const question = questionsMap.get(response.questionId);
            if (!question) continue;

            if (response?.mcqIndex?.length > 0) {
              response.mcqIndex.forEach(
                (index) => {
                  const selectedOption = question.mcq?.[index];

                  if (selectedOption?.roles) { 
                    selectedOption.roles.forEach(role => branchRoles.add(role)); 
                  }
                }
              )
            }
            else if (question.regexBranches && response.content) {
              for (const regex of question.regexBranches) {
                try {
                  const regpattern = new RegExp(regex.pattern, 'i');
                  if (regpattern.test(response.content)) 
                  { regex.roles.forEach(role => branchRoles.add(role)); }
                } 
                catch { 
                  regexErrors.push(`${response.questionId}: ${regex.pattern}`);
                }
              }
            }
          }

          if (regexErrors.length > 0) {
            await interaction.followUp({
              content: `The following regex patterns are invalid and their roles were not applied:\n${regexErrors.join("\n")}`,
              flags: MessageFlags.Ephemeral
            });
          }
        }

        console.log("Branch roles to apply:", Array.from(branchRoles));

        // Apply roles
        const rolesToApply = [ ...new Set([...verifiedRoles, ...branchRoles]) ];

        await applyRoles(user, rolesToApply, unverifiedRoles, interaction);

        results.success.push(userID);

        // Get verification data
        const verification = await Verification.findOne({ where: { userId: userID } });
        const messageids = getMessageIds(verification, interaction.guild.id, application.id);
        const invitetracker = await InviteTracker.findOne({
          where: { unique_id: `${userID}_${interaction.guild.id}` }
        });

        // Process log messages
        await processLogMessages({
          interaction,
          client,
          application,
          messageids,
          user,
          status: VerificationStatus.VERIFIED,
          useRateLimiting: true
        });

        const payload = {
          content: `<@${userID}> `,
          embeds: [
            createNoApplicationEmbed(user, interaction, invitetracker, VerificationStatus.VERIFIED)
          ]
        };

        // If no messages and separate log channel, send "no application" embed
        if (
          application.verifylogs &&
          application.reviewchannel !== application.verifylogs &&
          (!messageids || messageids.length === 0)
        ) {
          const logChannel = interaction.guild.channels.cache.get(application.verifylogs);
          if (logChannel) {
            await rateLimitedOperation(
              async () => { await sendWebhookMessage(logChannel, application, payload); }
            );
          }
        } 
        else if ( !application.verifylogs && (!messageids || messageids.length === 0) )
        {
          await rateLimitedOperation(
            async () => { await sendWebhookMessage(interaction.channel, application, payload); }
          );
        }

        // Cleanup verification data
        if (messageids && messageids.length > 0) 
        { await cleanupVerificationData(verification, interaction.guild.id, userID, application.id); }

        // Send welcome message
        if (welcomeChannel && welcomeMessage) {
          try { 
            await sendWelcomeMessage(interaction, user, welcomeChannel, welcomeMessage, null, verifiedRoles, application); 
          } catch (error) { 
            console.error("Error sending welcome message:", error); 
          }
        }

        // Send verification DM
        await sendVerifyDM(user, application, interaction, verifiedRoles);
      } catch (error) {
        console.error("Could not verify user: " + error);
        results.notFound.push(userID);
      }
    }

    let replyMessage = "";

    if (results.success.length > 0) { 
      replyMessage += `**Successfully verified:** ${results.success.map((id) => `<@${id}>`).join(", ")}`; 
    }

    if (results.notFound.length > 0) { 
      replyMessage += `\n**Users not found:** ${results.notFound.map((id) => `<@${id}>`).join(", ")}`; 
    }

    await interaction.editReply(replyMessage);
  }
};
