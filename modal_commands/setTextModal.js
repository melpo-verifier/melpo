const { ServerConfig } = require("../dbObjects.js");
const { updateTempApplication } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0];
  const tempApplicationId = parseInt(context[1], 10);

  let title = interaction.fields.getTextInputValue("title");
  let description = interaction.fields.getTextInputValue("description");

  if (title.length < 1)       { title = "deleted"; }
  if (description.length < 1) { description = getDefaultValue(customIdValue).description; }

  await updateTempApplication(
    interaction.guild.id, 
    { [customIdValue]: { title: title, description: description } }, 
    { id: tempApplicationId }
  );

  const customizationMenu = require("../menu_commands/selectcustomizationMenu.js");
  customizationMenu({ interaction, customIdValue, tempApplicationId });
};

const getDefaultValue = (fieldName) => {
  const field = ServerConfig.rawAttributes[fieldName];
  return field ? field.defaultValue : null;
};
