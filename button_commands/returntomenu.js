const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { ServerConfig } = require("../dbObjects.js");

module.exports = async ({ interaction }) => {
  const verify = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify")
      .setLabel("Verify")
      .setStyle("Success"),
    new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle("Danger"),
    new ButtonBuilder()
      .setCustomId("reasondeny")
      .setLabel("Deny with reason")
      .setStyle("Danger"),
    new ButtonBuilder()
      .setCustomId("question")
      .setLabel("Question")
      .setStyle("Primary"),
    new ButtonBuilder()
      .setCustomId("action")
      .setLabel("Kick")
      .setStyle("Secondary"),
  );

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  if (serverConfig && Array.isArray(serverConfig.managerrole)) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = serverConfig.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return interaction.reply({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${serverConfig.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
    const originalComponents = interaction.message.components;

    const firstcomponent = originalComponents.shift();

    await interaction.update({ components: [firstcomponent, verify] });
  } else {
    //remove last field from embed
    const originalembed = interaction.message.embeds[0];
    const verifiedEmbed = new EmbedBuilder(originalembed)
      .spliceFields(-1, 1)
      .setColor("#3f7ff1");

    await interaction.update({ embeds: [verifiedEmbed], components: [verify] });
  }
};
