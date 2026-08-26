const { PermissionsBitField } = require("discord.js");
const { Op } = require("sequelize");
const { PendingActions, Application } = require("../dbObjects.js");
// const { validateRoles } = require("../js/verificationHandler.js"); // Nice function, but doesn't have exactly what is needed here. Good idea to later make a good combined feature as this is used in more places.

async function validateRoles(guild, roleIds) {
	const botMember = guild.members.me || (await guild.members.fetchMe());
	if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

	const hasUncachedRoles = roleIds.some((id) => !guild.roles.cache.has(id));
	if (hasUncachedRoles) {
		await guild.roles.fetch().catch((error) => console.error("Failed to fetch guild roles:", error));
	}

	// WARNING: Will silently drop invalid roles without user notification. Might be nice to add in the future. -Milo
	const botHighestPosition = botMember.roles.highest.position;
	const validRoleIds = roleIds.filter((roleId) => {
		const role = guild.roles.cache.get(roleId);
		return role && role.position < botHighestPosition && !role.managed;
	});

	return validRoleIds;
}

async function scheduleAction(PendingAction, { guildId, userId, applicationId, actionType, durationMs }) {
	const executeAt = new Date(Date.now() + durationMs);

	return await PendingAction.create({
		guildId,
		userId,
		applicationId,
		actionType,
		executeAt,
	});
}
//could be a useful function, but not needed rn.
// async function cancelPendingActions() {
// }

function startActionWorker(client, intervalMs = 60000) {
	console.log("Background action scheduler started.");

	setInterval(async () => {
		//Find actions where executeAt is in the past
		const expiredActions = await PendingActions.findAll({
			where: {
				executeAt: {
					[Op.lte]: new Date(),
				},
			},
			limit: 10, //Limit makes sure that there aren't too many actions processed at once, to reduce rate-limits.
			order: [["executeAt", "ASC"]],
		});

		console.log(expiredActions);

		if (expiredActions.length === 0) return;

		for (const action of expiredActions) {
			try {
				const guild = await client.guilds.fetch(action.guildId).catch(() => null);
				if (!guild) {
					await action.destroy();
					continue;
				}

				const member = await guild.members.fetch(action.userId).catch(() => null);

				if (!member) {
					await action.destroy();
					continue;
				}

				if (action.actionType === "UNVERIFIED_KICK") {
					//check if member is kickable
					//check if member still lacks verified role

					//if so, kick member

					console.log(`[Scheduler] Kicked ${action.userId} from ${action.guildId}`);
				} else if (action.actionType === "REMOVE_DENIED_ROLE") {
					const application = await Application.findByPk(action.applicationId);
					if (!application) {
						console.error(`[Scheduler] Application not found for action ID ${action.id}`);
						await action.destroy();
						continue;
					}

					// THIS IS AN ARRAY OF IDs
					const rolesToRemove = application.deniedrole;

					//validate roles
					const validRoles = await validateRoles(guild, rolesToRemove);
					if (!validRoles.length) return;

					await member.roles.remove(rolesToRemove, "Denied status period expired.");
					console.log(
						`[Scheduler] Removed denied role(${rolesToRemove.join(", ")}) from ${action.userId} in ${action.guildId}`,
					);
				}
			} catch (err) {
				console.error(`[Scheduler] Failed to process action ID ${action.id}:`, err.message);
			} finally {
				await action.destroy();
			}
		}
	}, intervalMs);
}

module.exports = { startActionWorker, scheduleAction, cancelPendingActions };
