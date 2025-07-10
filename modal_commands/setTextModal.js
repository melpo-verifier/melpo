const { ServerConfig } = require("../dbObjects.js");
const { updateTemporarySetup } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0];

  var title = interaction.fields.getTextInputValue("title");
  var description = interaction.fields.getTextInputValue("description");

  if (title.length < 1) {
    title = "deleted";
  }
  if (description.length < 1) {
    description = getDefaultValue(customIdValue).description;
  }

  await updateTemporarySetup(interaction.guild.id, {
    [customIdValue]: { title: title, description: description },
  });

  const customizationMenu = require("../menu_commands/selectcustomizationMenu.js");
  customizationMenu({ interaction, customIdValue });
};

const getDefaultValue = (fieldName) => {
  const field = ServerConfig.rawAttributes[fieldName];
  return field ? field.defaultValue : null;
};
