const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  // ContainerBuilder,
  // TextDisplayBuilder,
} = require("discord.js");
const { ServerConfig } = require("../dbObjects.js");

module.exports = async ({ interaction }) => {
  await interaction.deferUpdate();

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  // Permission check
  if (serverConfig && Array.isArray(serverConfig.managerrole)) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = serverConfig.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return interaction.followUp({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${serverConfig.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
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
      .setCustomId(`actionconfirm_${interaction.user.id}`)
      .setLabel("Confirm Kick")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("returntomenu")
      .setLabel("Cancel")
      .setStyle("Danger"),
  );

  if (hasComponents) {
    // const confirmContainer = new ContainerBuilder({
    //   accent_color: 4161521,
    // }).addTextDisplayComponents(
    //   new TextDisplayBuilder({
    //     content:
    //       '**Are you sure you want to Kick this user?**\nClick "Confirm Denial" to kick or "Cancel" to return.',
    //   }),
    // );

    await interaction.message.edit({
      flags: [MessageFlags.IsComponentsV2],
      components: [originalComponents[0], verifyRow],
    });
  } else {
    const verifyEmbed = new EmbedBuilder(originalEmbed).addFields({
      name: "Are you sure you want to kick this user?",
      value: 'Click "Confirm Verification" to kick or "Cancel" to return.',
    });

    await interaction.message.edit({
      embeds: [verifyEmbed],
      components: [verifyRow],
    });
  }
};
