const { MessageFlags, EmbedBuilder } = require("discord.js");
const { Application, Verification } = require("../dbObjects.js");
const {
  checkManagerPermission,
  handleV2Edit,
  VerificationStatus,
  processLogMessages,
  cleanupVerificationData,
  sendDenyDM,
} = require("../js/verificationHandler.js");

module.exports = async ({ interaction, client, userid, context, appName }) => {
  await interaction.deferUpdate();

  // Check if another user is handling this verification
  const originaluserid = context[1]?.toString();
  if (originaluserid && originaluserid !== interaction.user.id) {
    return await interaction.followUp({
      content: "This verification is already handled by another user!",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!userid) {
    throw new Error("Could not fetch user ID from the embed");
  }

  const application = await Application.findOne({
    where: { server_id: interaction.guild.id, name: appName },
  });

  // Check manager permissions
  const permCheck = await checkManagerPermission(interaction, application);
  if (!permCheck.allowed) {
    return await interaction.followUp({
      content: permCheck.message,
      flags: MessageFlags.Ephemeral,
    });
  }

  const user = await client.users.fetch(userid);

  // Get verification data
  const verification = await Verification.findOne({ where: { userId: userid } });
  const messageids = verification?.guildVerifications?.[interaction.guild.id];

  // Try to get member for processLogMessages
  let member;
  try {
    member = await interaction.guild.members.fetch(userid);
  } catch {
    member = { user, id: userid };
  }

  // Process log messages
  await processLogMessages({
    interaction,
    client,
    application,
    messageids,
    user: member,
    status: VerificationStatus.DENIED,
    useRateLimiting: false,
  });

  // If no separate log channel, edit the current message
  if (!application.verifylogs || application.reviewchannel === application.verifylogs) {
    if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
      const deniedContainer = handleV2Edit(interaction, interaction.message, VerificationStatus.DENIED);
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [deniedContainer],
      });

      if (interaction.message.thread) {
        await interaction.message.thread.setArchived(true);
      }
    } else {
      const originalEmbed = interaction.message.embeds[0];
      let fields = originalEmbed.fields || [];

      if (fields.length > 0 && fields[fields.length - 1].name.includes("Are you sure")) {
        fields.pop();
      }

      const embed = new EmbedBuilder(originalEmbed)
        .setColor("#EB2121")
        .setTitle(originalEmbed.title + " (DENIED)")
        .setFields(fields)
        .setFooter({
          text: `Denied by ${interaction.user.username} | ${originalEmbed?.footer?.text || userid}`,
        });

      await interaction.editReply({ embeds: [embed], components: [] });
    }
  }

  // Cleanup verification data
  if (messageids && messageids.length > 0) {
    await cleanupVerificationData(verification, interaction.guild.id);
  }

  // Send denial DM
  const dmResult = await sendDenyDM(user, interaction.guild.name);

  if (dmResult.dmDisabled) {
    await interaction.followUp({
      content: `✅ User denied successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
      flags: MessageFlags.Ephemeral,
    });
  }
};
