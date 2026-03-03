const { MessageFlags } = require("discord.js");
const { Verification } = require("../dbObjects.js");
const {
  checkManagerPermission,
  validateRoles,
  handleV2Edit,
  VerificationStatus,
  relinkAttachments,
  processLogMessages,
  cleanupVerificationData,
  sendWelcomeMessage,
  sendVerifyDM,
  applyRoles,
  getMessageIds,
} = require("../js/verificationHandler.js");
const { getApplicationById } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, userid, context, applicationId }) => {
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

  const { application, error } = await getApplicationById(applicationId, interaction.guild.id);

  if (error) {
    return await interaction.followUp({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check manager permissions
  const permCheck = await checkManagerPermission(interaction, application);
  if (!permCheck.allowed) {
    return await interaction.followUp({
      content: permCheck.message,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Validate roles
  const roleErrors = await validateRoles(
    interaction,
    application.verifiedrole,
    application.unverifiedrole,
  );
  if (roleErrors.length > 0) {
    return await interaction.followUp({
      content: roleErrors[0],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Fetch user
  let user;
  try {
    user = await interaction.guild.members.fetch(userid);
    if (!user) throw new Error("User not found");
  } catch {
    return await interaction.followUp({
      content:
        "User not found in server. This user has probably left this server.\nIf you believe this is an error, please contact the developer.\nYou can always verify someone manually using `/verify`",
      flags: MessageFlags.Ephemeral,
    });
  }

  const verifiedRoles = application.verifiedrole;
  const unverifiedRoles = application.unverifiedrole;
  const welcomeMessage = application.verificationwelcomemessage;
  const welcomeChannel = application.verificationwelcomechannel;
  const originalEmbed = interaction.message.embeds[0];

  // Apply roles
  const botMember = interaction.guild.members.me;
  if (!botMember || !botMember.permissions.has("ManageRoles")) {
    return await interaction.followUp({
      content: "I don't have the **Manage Roles** permission. Please grant it and try again.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await applyRoles(user, verifiedRoles, unverifiedRoles, interaction);

  // Send welcome message
  if (welcomeChannel && welcomeMessage) {
    try {
      await sendWelcomeMessage(
        interaction,
        user,
        welcomeChannel,
        welcomeMessage,
        originalEmbed,
        verifiedRoles,
      );
    } catch (error) {
      await interaction.followUp({
        content: `Welcome channel error: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Get verification data
  const verification = await Verification.findOne({ where: { userId: userid } });
  const messageids = getMessageIds(verification, interaction.guild.id, applicationId);

  // Process log messages
  await processLogMessages({
    interaction,
    client,
    application,
    messageids,
    user,
    status: VerificationStatus.VERIFIED,
    useRateLimiting: false,
  });

  // If no separate log channel, edit the current message
  if (!application.verifylogs || application.reviewchannel === application.verifylogs) {
    if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
      const { container, files } = relinkAttachments(interaction.message);

      const tempMsg = { ...interaction.message, components: [container] };
      const verifiedContainer = handleV2Edit(
        interaction,
        tempMsg,
        VerificationStatus.VERIFIED,
      );

      const editPayload = {
        flags: [MessageFlags.IsComponentsV2],
        components: [verifiedContainer],
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
    await cleanupVerificationData(verification, interaction.guild.id, applicationId);
  }

  // Send verification DM
  await sendVerifyDM(user, application, interaction, verifiedRoles);
};
