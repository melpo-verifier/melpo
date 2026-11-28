const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
	const whichdefault = interaction.values[0];
	const tempApplicationId = parseInt(context[0], 10);

	await rolesinfo({ interaction, client, whichdefault, tempApplicationId });
};
