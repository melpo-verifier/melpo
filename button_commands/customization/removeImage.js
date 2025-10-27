const { updateTemporarySetup, updateTempApplication } = require("../../js/tempconfigfuncs.js");
const customizationMenu = require("../../menu_commands/selectcustomizationMenu.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0]
  const appName = context[1];

  await updateTempApplication(interaction.guild.id, {
    [customIdValue]: { image: "deleted" },
  }, { name: appName });

  customizationMenu({ interaction, customIdValue, appName });
};
