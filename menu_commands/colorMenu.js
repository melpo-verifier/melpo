const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { updateTemporarySetup } = require("../js/tempconfigfuncs.js");
const customizationMenu = require("./selectcustomizationMenu.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0];

  const value = interaction.values[0];

  if (value !== "custom") {
    await updateTemporarySetup(interaction.guild.id, {
      [customIdValue]: { color: value },
    });
    customizationMenu({ interaction, customIdValue });
  } else if (value === "custom") {
    const modal = new ModalBuilder()
      .setCustomId(`setColorModal_${customIdValue}`)
      .setTitle("Set Embed Color");

    const color = new TextInputBuilder()
      .setCustomId(`color`)
      .setLabel("Set hex color (error -> invalid hex)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Set hex color (e.g., #ffffff or #3f7ff1)")
      .setMinLength(7)
      .setMaxLength(7)
      .setRequired(true);

    const colorRow = new ActionRowBuilder().addComponents(color);
    modal.addComponents(colorRow);

    await interaction.showModal(modal);
  }
};
