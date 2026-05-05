const {
  ButtonBuilder,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js"); //the fallback is temporary for migration since button ids aren't updated into the past.
const { relinkAttachments } = require("../js/verificationHandler.js");

module.exports = async ({ interaction, applicationId }) => {
  await interaction.deferUpdate();

  const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);
  if (error) {
    return interaction.followUp({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Permission check
  if (application && Array.isArray(application.managerrole) && application.managerrole.length > 0) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = application.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return interaction.followUp({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${application.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Check if there's an existing container components message
  const hasComponents = interaction.message.flags.has(
    MessageFlags.IsComponentsV2,
  );

  // Get either the container components or the original embed
  const originalComponents = hasComponents
    ? interaction.message.components
    : [];
  const originalEmbed = hasComponents ? null : interaction.message.embeds[0];

  // Check if verification already in progress
  if (
    (hasComponents &&
      originalComponents.some((c) =>
        c.components?.some((cc) => cc.customId?.includes("actionconfirm")),
      )) ||
    (!hasComponents &&
      originalEmbed?.fields?.some((f) => f.name.includes("Are you sure")))
  ) {
    return;
  }

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`actionconfirm_${applicationId}_${interaction.user.id}`)
      .setLabel("Confirm Kick")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId(`returntomenu_${applicationId}`)
      .setLabel("Cancel")
      .setStyle("Danger"),
  );

  if (hasComponents) {
    const { container, files } = relinkAttachments(interaction.message);
    const editPayload = {
      flags: [MessageFlags.IsComponentsV2],
      components: [container, verifyRow],
    };
    if (files) editPayload.files = files;
    await interaction.editReply(editPayload);
  }
};
