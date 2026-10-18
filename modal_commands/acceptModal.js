const { MessageFlags } = require("discord.js");
const { verifyUser, checkManagerPermission } = require("../js/verificationHandler.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, userid, applicationId }) => {
	if (!userid) throw new Error("Could not fetch user ID from the embed");

	if (userid?.includes(" | ")) {
		await interaction.reply({
			content: "Oop! It seems this user has already been handled by someone else!",
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

	const permCheck = await checkManagerPermission(interaction, application);
	if (!permCheck.allowed) {
		return await interaction.followUp({
			content: permCheck.message,
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
				"User not found in server. This user has probably left this server.\n-# If you believe this is an error, please contact the developer.\nYou can always accept someone manually using `/verify`",
			flags: MessageFlags.Ephemeral,
		});
	}

	const note = interaction.fields.getTextInputValue("acceptInput");

	await verifyUser(interaction, client, application, user, note);
};
