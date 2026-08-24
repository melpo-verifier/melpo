const { MessageFlags } = require("discord.js");
const { denyUser } = require("../js/verificationHandler.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, userid, applicationId }) => {
	// if (!userid) {
	// 	console.error("No user ID found for this deny Modal!!");
	// 	await interaction.reply({
	// 		content:
	// 			"Could not find the user associated with this verification. If you believe this is an error, please notify support staff in Melpo's support server.",
	// 		flags: MessageFlags.Ephemeral,
	// 	});
	// 	return;
	// }
	if (!userid) throw new Error("Could not fetch user ID from the embed");

	if (userid?.includes(" | ")) {
		await interaction.reply({
			content: `Oop! It seems this user has already been handled by someone else!`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferUpdate();

	const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);

	if (error) {
		return interaction.followUp({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	// Fetch user
	let user;
	try {
		user = await interaction.guild.members.fetch(userid);
		if (!user) throw new Error("User not found");
	} catch {
		return await interaction.followUp({
			content:
				"User not found in server. This user has probably left this server.\n-# If you believe this is an error, please contact the developer.\nYou can always verify someone manually using `/verify`",
			flags: MessageFlags.Ephemeral,
		});
	}

	const reason = interaction.fields.getTextInputValue("denyInput");

	await denyUser(interaction, client, application, user, reason);
};
