const { MessageFlags } = require("discord.js");
const { updateTemporarySetup } = require("../js/tempconfigfuncs.js");
const customizationMenu = require("../menu_commands/selectcustomizationMenu.js");

module.exports = async ({ interaction }) => {
  const customIdValue = interaction.customId.split("_")[1];
  const value = interaction.fields.getTextInputValue("color");

  const hexColorRegex = /^#?[0-9A-Fa-f]{6}$/;
  if (!hexColorRegex.test(value)) {
    return interaction.reply({
      content:
        "Invalid color format! Please provide a valid hex color code (e.g., #FF0000 or FF0000).",
      flags: MessageFlags.Ephemeral,
    });
  }

  const formattedValue = value.startsWith("#") ? value : `#${value}`;

  await updateTemporarySetup(interaction.guild.id, {
    [customIdValue]: { color: formattedValue },
  });
  customizationMenu({ interaction, customIdValue });
};
