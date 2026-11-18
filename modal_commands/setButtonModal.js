const { updateTempApplication } = require("../js/tempconfigfuncs.js");
const selectcustomizationMenu = require("../menu_commands/selectcustomizationMenu.js");

module.exports = async ({ interaction, context }) => {
	const customIdValue = context[0];
	const tempApplicationId = parseInt(context[1], 10);

	const rawLabel = interaction.fields.getTextInputValue("buttonLabel") || "";
	const selectedStyle = interaction.fields.getStringSelectValues("buttonStyle")?.[0];
	const label = rawLabel.length > 0 ? rawLabel.slice(0, 80) : "Apply";

	await updateTempApplication(
		interaction.guild.id,
		{ [customIdValue]: { buttonLabel: label, buttonStyle: selectedStyle } },
		{ id: tempApplicationId },
	);

	await selectcustomizationMenu({
		interaction,
		customIdValue,
		tempApplicationId,
	});
};
