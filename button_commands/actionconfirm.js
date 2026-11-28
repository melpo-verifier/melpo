const { MessageFlags } = require("discord.js");
const { checkManagerPermission, kickUser } = require("../js/verificationHandler.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, userid, context, applicationId }) => {
	await interaction.deferUpdate();

	// context[0] is applicationId, context[1] is the user ID who pressed the button
	const originaluserid = context[1]?.toString();
	if (originaluserid && originaluserid !== interaction.user.id) {
		return await interaction.followUp({
			content: "This application is already handled by another user!",
			flags: MessageFlags.Ephemeral,
		});
	}

	if (!userid) {
		throw new Error("Could not fetch user ID from the embed");
	}

	const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);
	if (error) {
		return interaction.followUp({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	// Check manager permissions
	const permCheck = await checkManagerPermission(interaction, application);
	if (!permCheck.allowed) {
		return interaction.followUp({
			content: permCheck.message,
			flags: MessageFlags.Ephemeral,
		});
	}

	let user;
	try {
		user = await interaction.guild.members.fetch(userid);
		if (!user) throw new Error("User not found");
	} catch (error) {
		if (error.code === 10007) {
			return interaction.followUp({
				content: "This user is no longer in the server.",
				flags: MessageFlags.Ephemeral,
			});
		}
		throw error;
	}

	await kickUser(interaction, client, application, user, null);
};
