const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { getApplicationById } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, applicationId }) => {
  const verify = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`verify_${applicationId}`)
      .setLabel("Verify")
      .setStyle("Success"),
    new ButtonBuilder().setCustomId(`deny_${applicationId}`).setLabel("Deny").setStyle("Danger"),
    new ButtonBuilder()
      .setCustomId(`reasondeny_${applicationId}`)
      .setLabel("Deny with reason")
      .setStyle("Danger"),
    new ButtonBuilder()
      .setCustomId(`question_${applicationId}`)
      .setLabel("Question")
      .setStyle("Primary"),
    new ButtonBuilder()
      .setCustomId(`action_${applicationId}`)
      .setLabel("Kick")
      .setStyle("Secondary"),
  );

  const { application, error } = await getApplicationById(applicationId, interaction.guild.id);

  if (error) {
    return interaction.reply({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (application && Array.isArray(application.managerrole) && application.managerrole.length > 0) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = application.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return interaction.reply({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${application.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
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
