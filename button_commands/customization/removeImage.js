const { updateTempApplication, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const customizationMenu = require("../../menu_commands/selectcustomizationMenu.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0];
  const tempApplicationId = parseInt(context[1], 10);

  const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error || !tempApp) {
    return interaction.reply({
      content: error || "Application not found or does not belong to this server.",
      flags: 64,
    });
  }

  await updateTempApplication(interaction.guild.id, {
    [customIdValue]: { image: "deleted" },
  }, { id: tempApplicationId });

  customizationMenu({ interaction, customIdValue, tempApplicationId });
};
