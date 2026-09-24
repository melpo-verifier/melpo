const { ServerConfig } = require("../dbObjects.js");

/**
 * Resolves the configured melpo-logs channel for a given guild.
 * @param {import("discord.js").Guild} guild
 * @returns {Promise<import("discord.js").TextChannel|null>}
 */
async function getMelpoLogChannel(guild) {
	if (!guild) return null;

	let targetChannelId = null;
	try {
		const serverConfig = await ServerConfig.findOne({
			where: { server_id: guild.id },
			attributes: ["melpologs"],
		});
		targetChannelId = serverConfig?.melpologs;
	} catch (err) {
		console.error(`[melpoLogger] Failed to fetch ServerConfig for guild ${guild.id}:`, err);
		return null;
	}

	if (!targetChannelId) return null;

	const channel =
		guild.channels.cache.get(targetChannelId) ?? (await guild.channels.fetch(targetChannelId).catch(() => null));

	if (!channel) return null;

	const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
	if (botMember && channel.permissionsFor) {
		const perms = channel.permissionsFor(botMember);
		if (perms && (!perms.has("ViewChannel") || !perms.has("SendMessages") || !perms.has("EmbedLinks"))) {
			return null;
		}
	}

	return channel;
}

/**
 * Sends a log message/embed to the configured melpo-logs channel for a guild.
 * @param {import("discord.js").Guild} guild
 * @param {object} payload Embed options ({ title, description, fields, color }) or full message options
 * @returns {Promise<import("discord.js").Message|null>}
 */
async function sendMelpoLog(guild, payload) {
	try {
		const channel = await getMelpoLogChannel(guild);
		if (!channel) return null;

		let messageOptions;

		if (payload && (payload.embeds || payload.content)) {
			messageOptions = payload;
		} else if (payload?.toJSON) {
			// EmbedBuilder instance
			messageOptions = { embeds: [payload] };
		} else {
			const alertEmbed = {
				color: payload?.color ?? 0xff0000,
				title: payload?.title ?? "⚠️ System Alert",
				description: payload?.description ?? "",
				fields: payload?.fields || [],
				timestamp: new Date(),
			};
			if (payload?.footer) alertEmbed.footer = payload.footer;
			messageOptions = { embeds: [alertEmbed] };
		}

		return await channel.send(messageOptions).catch((err) => {
			console.error(`[melpoLogger] Failed to send log to channel ${channel.id} in (${guild.id}):`, err?.message || err);
			return null;
		});
	} catch (err) {
		console.error(`[melpoLogger] Error executing sendMelpoLog for guild ${guild?.id}:`, err);
		return null;
	}
}

/**
 * Standardized logger for role permission and hierarchy errors (autoroles, scheduled roles, etc.).
 * @param {import("discord.js").Guild} guild
 * @param {object} params
 * @param {string} params.targetUserId User ID targeted by the role action
 * @param {string} [params.actionText="assign/remove roles for"] Description of the action (e.g. "assign autorole(s) to")
 * @param {string[]} [params.droppedRoles=[]] Array of role IDs that failed
 * @param {string} params.failureReason "missing_permission" | "hierarchy"
 * @returns {Promise<import("discord.js").Message|null>}
 */
async function logRolePermissionError(
	guild,
	{ targetUserId, actionText = "assign/remove roles for", droppedRoles = [], failureReason },
) {
	const droppedMentions = droppedRoles.map((id) => `<@&${id}>`).join(", ");

	const description =
		failureReason === "missing_permission"
			? `Failed to ${actionText} <@${targetUserId}> because I am missing the **Manage Roles** permission.`
			: `Failed to ${actionText} <@${targetUserId}> due to role hierarchy. The affected roles are higher than (or equal to) my highest role, managed by an integration, or deleted.`;

	const alertEmbed = {
		color: 0xff0000,
		title: "⚠️ Permission Error",
		description,
		fields: [
			{
				name: "Roles affected",
				value: droppedMentions || "None",
			},
		],
		timestamp: new Date(),
	};

	return await sendMelpoLog(guild, alertEmbed);
}

/**
 * Standardized logger for verification/deny role errors triggered by interaction.
 * @param {import("discord.js").CommandInteraction|import("discord.js").ButtonInteraction} interaction
 * @param {import("discord.js").User} targetUser User being verified or denied
 * @param {string} actionName "Verification" or "Deny"
 * @param {string[]} roleErrors Array of error strings returned by validateRoles
 * @returns {Promise<import("discord.js").Message|null>}
 */
async function logVerificationError(interaction, targetUser, actionName, roleErrors) {
	const actionVerb = actionName.toLowerCase();
	const alertEmbed = {
		color: 0xff0000,
		title: `⚠️ ${actionName} Permission Error`,
		description: `<@${interaction.user.id}> attempted to ${actionVerb} <@${targetUser.id}>, but Melpo is missing permissions to assign or remove some roles!`,
		fields: [
			{
				name: "Errors:",
				value: roleErrors
					.map((err) => `- ${err}`)
					.join("\n")
					.slice(0, 1024),
			},
		],
		timestamp: new Date(),
	};

	return await sendMelpoLog(interaction.guild, alertEmbed);
}

module.exports = {
	getMelpoLogChannel,
	sendMelpoLog,
	logRolePermissionError,
	logVerificationError,
};
