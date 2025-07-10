const { updateTemporarySetup } = require("../../js/tempconfigfuncs.js");
const customizationMenu = require("../../menu_commands/selectcustomizationMenu.js");
const { ServerConfig } = require("../../dbObjects.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0].toString();

  const defaultValue = getDefaultValue(customIdValue);

  await updateTemporarySetup(interaction.guild.id, {
    [customIdValue]: {
      title: defaultValue.title,
      description: defaultValue.description,
    },
  });

  customizationMenu({ interaction, customIdValue });
};

const getDefaultValue = (fieldName) => {
  const field = ServerConfig.rawAttributes[fieldName];
  return field ? field.defaultValue : null;
};
