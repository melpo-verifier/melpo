const { MessageFlags } = require("discord.js");
const { getTempApplicationById } = require("../js/tempconfigfuncs.js");
const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
	const selectedRole = context[0];
	const tempApplicationId = parseInt(context[1], 10);

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error || !tempApp) {
		return interaction.reply({
			content: `Error: ${error || "Temporary application setup not found."}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	const roles = interaction.values;

	if (selectedRole) {
		tempApp[selectedRole] = roles;
		tempApp.changed(selectedRole, true);
		await tempApp.save();
	}

	await rolesinfo({ interaction, client, whichdefault: selectedRole, tempApplicationId });
};
