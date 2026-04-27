const { MessageFlags } = require("discord.js");
const { Verification } = require("../dbObjects.js");
const {
  handleV2Edit,
  VerificationStatus,
  relinkAttachments,
  processLogMessages,
  cleanupVerificationData,
  sendDenyDM,
  getMessageIds,
} = require("../js/verificationHandler.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, userid, applicationId }) => {
  if (userid && userid.includes(" | ")) {
    await interaction.reply({
      content: `Oop! It seems this user has already been handled by someone else!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const user = await client.users.fetch(userid);

  await interaction.deferUpdate();

  const verification = await Verification.findOne({
    where: { userId: userid },
  });
  const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);
  if (error) {
    return interaction.followUp({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  const messageids = getMessageIds(verification, interaction.guild.id, applicationId);
  const reason = interaction.fields.getTextInputValue("denyInput");

  let member;
  try {
    member = await interaction.guild.members.fetch(userid);
  } catch {
    member = { user, id: userid };
  }

  // Process log messages
  try {
    await processLogMessages({
      interaction,
      client,
      application,
      messageids,
      user: member,
      status: VerificationStatus.DENIED,
      reason,
      useRateLimiting: false,
    });
  } catch (logError) {
    if (logError.code === 50001 || logError.code === 50013) {
      console.warn(`Missing permissions for log messages in guild ${interaction.guild.id}`);
      await interaction.followUp({
        content: "Warning: Could not process log messages due to missing permissions.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    } else {
      throw logError;
    }
  }

  // If no separate log channel, edit the current message
  if (!application.verifylogs || application.reviewchannel === application.verifylogs) {
    if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
      const { container, files } = relinkAttachments(interaction.message);

      const tempMsg = { ...interaction.message, components: [container] };
      const deniedContainer = handleV2Edit(
        interaction, 
        tempMsg, 
        VerificationStatus.DENIED,
        reason
      );

      const editPayload = {
        flags: [MessageFlags.IsComponentsV2],
        components: [deniedContainer],
      };
      if (files) editPayload.files = files;
      await interaction.editReply(editPayload);

      if (interaction.message.thread) {
        await interaction.message.thread.setArchived(true);
      }
    }
  }

  // Cleanup verification data
  if (messageids && messageids.length > 0) {
    await cleanupVerificationData(verification, interaction.guild.id, userid, applicationId);
  }

  // Send denial DM
  const dmResult = await sendDenyDM(interaction.user.username, user, application, interaction.guild.name, reason);

  if (dmResult.dmDisabled) {
    await interaction.followUp({
      content: `✅ User denied successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.followUp({
      content: `✅ User denied successfully!`,
      flags: MessageFlags.Ephemeral,
    });
  }
};
