const { ActionRowBuilder, ButtonBuilder } = require("discord.js");

function createCategoryButtons(tempApplicationId, disabledIndex = -1) {
	const buttons = [
		new ButtonBuilder().setCustomId(`generalinfo_${tempApplicationId}`).setLabel("Channels").setStyle("Secondary"),
		new ButtonBuilder().setCustomId(`rolesinfo_${tempApplicationId}`).setLabel("Roles").setStyle("Secondary"),
		new ButtonBuilder().setCustomId(`questioninfo_${tempApplicationId}`).setLabel("Questions").setStyle("Secondary"),
		new ButtonBuilder()
			.setCustomId(`customizationinfo_${tempApplicationId}`)
			.setLabel("Customization")
			.setStyle("Secondary"),
		new ButtonBuilder().setCustomId(`miscinfo_${tempApplicationId}`).setLabel("Misc").setStyle("Secondary"),
	];

	if (disabledIndex >= 0 && disabledIndex < buttons.length) buttons[disabledIndex].setDisabled(true);

	return new ActionRowBuilder().addComponents(...buttons);
}

module.exports = { createCategoryButtons };
