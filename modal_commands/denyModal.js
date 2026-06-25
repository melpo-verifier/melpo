const { MessageFlags } = require("discord.js");
const { Verification, Submissions } = require("../dbObjects.js");
const {
	handleV2Edit,
	validateRoles,
	VerificationStatus,
	relinkAttachments,
	processLogMessages,
	cleanupVerificationData,
	sendDenyDM,
	applyRoles,
	getMessageIds,
} = require("../js/verificationHandler.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");
const { isPremiumServer } = require("../js/DBFunctions.js");

module.exports = async ({ interaction, client, userid, applicationId }) => {
	if (!userid) {
		console.error("No user ID found for this deny Modal!!");
		await interaction.reply({
			content:
				"Could not find the user associated with this verification. If you believe this is an error, please notify support staff in Melpo's support server.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	//if (userid && userid.includes(" | ")) {
	if (userid?.includes(" | ")) {
		await interaction.reply({
			content: `Oop! It seems this user has already been handled by someone else!`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const user = await client.users.fetch(userid);

	await interaction.deferUpdate();

	const verification = await Verification.findOne({ where: { userId: userid } });
	const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);
	if (error) {
		return interaction.followUp({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}
	const messageids = getMessageIds(verification, interaction.guild.id, applicationId);
	const reason = interaction.fields.getTextInputValue("denyInput");

	let member;
	try {
		member = await interaction.guild.members.fetch(userid);
	} catch {
		member = { user, id: userid };
	}

	const rolesToApply = [];
	console.log(application.deniedrole);

	//check deny count if there exists a threshold, if it meets threshold apply deny role if it exists
	if (application.maxdenials && application.deniedrole?.length > 0 && (await isPremiumServer(interaction.guild.id))) {
		//check if premium is active

		const denyCount = await Submissions.count({
			where: { user_id: userid, guild_id: interaction.guild.id, app_id: String(applicationId), status: "denied" },
		});
		if (denyCount + 1 >= application.maxdenials) rolesToApply.push(application.deniedrole);
	} else if (application.deniedrole?.length > 0) {
		rolesToApply.push(application.deniedrole);
	}

	if (rolesToApply.length > 0) {
		// Validate roles
		const roleErrors = await validateRoles(interaction, rolesToApply, null);
		if (roleErrors.length > 0)
			return await interaction.followUp({ content: roleErrors[0], flags: MessageFlags.Ephemeral });

		await applyRoles(member, rolesToApply, null, interaction);
	}

	// Process log messages
	try {
		await processLogMessages({
			interaction,
			client,
			application,
			messageids,
			user: member,
			status: VerificationStatus.DENIED,
			reason,
			useRateLimiting: false,
		});
	} catch (logError) {
		if (logError.code === 50001 || logError.code === 50013) {
			console.warn(`Missing permissions for log messages in guild ${interaction.guild.id}`);
			await interaction
				.followUp({
					content: "Warning: Could not process log messages due to missing permissions.",
					flags: MessageFlags.Ephemeral,
				})
				.catch(() => {});
		} else {
			throw logError;
		}
	}

	// If no separate log channel, edit the current message
	if (!application.verifylogs || application.reviewchannel === application.verifylogs) {
		if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
			const { container, files } = relinkAttachments(interaction.message);

			const tempMsg = { ...interaction.message, components: [container] };
			const deniedContainer = handleV2Edit(interaction, tempMsg, VerificationStatus.DENIED, reason);
			const editPayload = { flags: [MessageFlags.IsComponentsV2], components: [deniedContainer] };

			if (files) editPayload.files = files;
			await interaction.editReply(editPayload);

			if (interaction.message.thread) await interaction.message.thread.setArchived(true);
		}
	}

	//mark submission as denied
	await Submissions.update(
		{ status: "denied" },
		{ where: { message_id: interaction.message.id, status: "completed" } },
	).catch((e) => console.error("Error updating submission status:", e));

	// Cleanup verification data
	if (messageids && messageids.length > 0) {
		await cleanupVerificationData(verification, interaction.guild.id, userid, applicationId);
	}

	// Send denial DM
	const dmResult = await sendDenyDM(interaction.user.username, user, application, interaction.guild.name, reason);

	if (dmResult.dmDisabled) {
		await interaction.followUp({
			content: `✅ User denied successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
			flags: MessageFlags.Ephemeral,
		});
	} else {
		await interaction.followUp({
			content: `✅ User denied successfully!${rolesToApply.length > 0 ? `\nThe deny role(s) has been applied to the user.` : ""}`,
			flags: MessageFlags.Ephemeral,
		});
	}
};
