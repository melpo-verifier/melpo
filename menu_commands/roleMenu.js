const { MessageFlags } = require("discord.js");
const { getTempApplicationById } = require("../js/tempconfigfuncs.js");
const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
	const selectedRole = parseInt(context[0], 10);
	const tempApplicationId = parseInt(context[1], 10);

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error || !tempApp) {
		return interaction.reply({
			content: `Error: ${error || "Temporary application setup not found."}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	const roles = interaction.values;

	const roleFieldMap = {
		0: "verifiedrole",
		1: "unverifiedrole",
		2: "pingrole",
		3: "managerrole",
		4: "questionpingrole",
		5: "deniedrole",
	};

	const targetField = roleFieldMap[selectedRole];
	if (targetField) {
		tempApp[targetField] = roles;
		tempApp.changed(targetField, true);
		await tempApp.save();
	}

	await rolesinfo({ interaction, client, whichdefault: selectedRole, tempApplicationId });
};
