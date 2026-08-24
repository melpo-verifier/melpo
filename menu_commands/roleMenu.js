const { updateTempApplication, getTempApplicationById } = require("../js/tempconfigfuncs.js");
const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
	const selectedRole = parseInt(context[0], 10);
	const tempApplicationId = parseInt(context[1], 10);

	let whichdefault;

	const { error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error) {
		return interaction.reply({
			content: `Error: ${error}`,
			flags: require("discord.js").MessageFlags.Ephemeral,
		});
	}

	const roles = interaction.values;

	//Note : Should be able to just pass selectedRole directly to save complexity - mat
	switch (selectedRole) {
		case 0:
			whichdefault = 0;
			await updateTempApplication(interaction.guild.id, { verifiedrole: roles }, { id: tempApplicationId });
			break;
		case 1:
			whichdefault = 1;
			await updateTempApplication(interaction.guild.id, { unverifiedrole: roles }, { id: tempApplicationId });
			break;
		case 2:
			whichdefault = 2;
			await updateTempApplication(interaction.guild.id, { pingrole: roles }, { id: tempApplicationId });
			break;
		case 3:
			whichdefault = 3;
			await updateTempApplication(interaction.guild.id, { managerrole: roles }, { id: tempApplicationId });
			break;
		case 4:
			whichdefault = 4;
			await updateTempApplication(interaction.guild.id, { questionpingrole: roles }, { id: tempApplicationId });
			break;
	}

	await rolesinfo({ interaction, client, whichdefault, tempApplicationId });
};
