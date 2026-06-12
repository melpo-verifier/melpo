const { updateTempApplication, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const customizationMenu = require("../../menu_commands/selectcustomizationMenu.js");
const { Application } = require("../../dbObjects.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0].toString();
  const tempApplicationId = parseInt(context[1], 10);

  const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error || !tempApp) {
    return interaction.reply({
      content: error || "Application not found or does not belong to this server.",
      flags: 64
    });
  }

  const defaultValue = getDefaultValue(customIdValue);

  await updateTempApplication(interaction.guild.id, {
    [customIdValue]: {
      title: defaultValue.title,
      description: defaultValue.description
    },
  }, { id: tempApplicationId });

  customizationMenu({ interaction, customIdValue, tempApplicationId });
};

const getDefaultValue = (fieldName) => {
  const field = Application.rawAttributes[fieldName];
  return field ? field.defaultValue : null;
};
