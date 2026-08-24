const { MessageFlags } = require("discord.js");
const { checkManagerPermission, verifyUser } = require("../js/verificationHandler.js");
const { getApplicationById } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, userid, context, applicationId }) => {
	await interaction.deferUpdate();

	// Check if another user is handling this verification
	const originaluserid = context[1]?.toString();
	if (originaluserid && originaluserid !== interaction.user.id) {
		return await interaction.followUp({
			content: "This verification is already handled by another user!",
			flags: MessageFlags.Ephemeral,
		});
	}

	const botMember = interaction.guild.members.me;
	if (!botMember?.permissions.has("ManageRoles")) {
		return await interaction.followUp({
			content: "I don't have the **Manage Roles** permission. Please grant it and try again.",
			flags: MessageFlags.Ephemeral,
		});
	}

	if (!userid) throw new Error("Could not fetch user ID from the embed");

	const { application, error } = await getApplicationById(applicationId, interaction.guild.id);

	if (error) {
		return await interaction.followUp({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	// Check manager permissions
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
				"User not found in server. This user has probably left this server.\nIf you believe this is an error, please contact the developer.\nYou can always verify someone manually using `/verify`",
			flags: MessageFlags.Ephemeral,
		});
	}

	await verifyUser(interaction, client, application, user);
};
