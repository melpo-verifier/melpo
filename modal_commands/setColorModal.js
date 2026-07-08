const { MessageFlags } = require("discord.js");
const { updateTempApplication } = require("../js/tempconfigfuncs.js");
const customizationMenu = require("../menu_commands/selectcustomizationMenu.js");

module.exports = async ({ interaction, context }) => {
	const customIdValue = context[0];
	const tempApplicationId = parseInt(context[1], 10);
	const value = interaction.fields.getTextInputValue("color");
	const hexColorRegex = /^#?[0-9A-Fa-f]{6}$/;

	if (!hexColorRegex.test(value)) {
		return interaction.reply({
			content: "Invalid color format! Please provide a valid hex color code (e.g., #FF0000 or FF0000).",
			flags: MessageFlags.Ephemeral,
		});
	}

	const formattedValue = value.startsWith("#") ? value : `#${value}`;
	await updateTempApplication(
		interaction.guild.id,
		{ [customIdValue]: { color: formattedValue } },
		{ id: tempApplicationId },
	);

	customizationMenu({ interaction, customIdValue, tempApplicationId });
};
