const { updateTemporarySetup, updateTempApplication } = require("../../js/tempconfigfuncs.js");
const customizationMenu = require("../../menu_commands/selectcustomizationMenu.js");
const { ServerConfig } = require("../../dbObjects.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0].toString();
  const appName = context[1];

  const defaultValue = getDefaultValue(customIdValue);

  await updateTempApplication(interaction.guild.id, {
    [customIdValue]: {
      title: defaultValue.title,
      description: defaultValue.description,
    },
  }, { name: appName });

  customizationMenu({ interaction, customIdValue, appName });
};

const getDefaultValue = (fieldName) => {
  const field = ServerConfig.rawAttributes[fieldName];
  return field ? field.defaultValue : null;
};
