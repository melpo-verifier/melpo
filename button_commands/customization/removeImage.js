const { updateTemporarySetup } = require("../../js/tempconfigfuncs.js");
const customizationMenu = require("../../menu_commands/selectcustomizationMenu.js");

module.exports = async ({ interaction }) => {
  const customIdValue = interaction.customId.split("_")[1];

  await updateTemporarySetup(interaction.guild.id, {
    [customIdValue]: { image: "deleted" },
  });

  customizationMenu({ interaction, customIdValue });
};
