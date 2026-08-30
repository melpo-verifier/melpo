const { Op } = require("sequelize");
const { PendingActions, Application } = require("../dbObjects.js");
const { isPremiumServer } = require("./DBFunctions.js");

async function scheduleAction({ guildId, userId, applicationId, actionType, durationMs }) {
	const executeAt = new Date(Date.now() + durationMs);

	return await PendingActions.create({
		guildId,
		userId,
		applicationId,
		actionType,
		executeAt,
	});
}
//could be a useful function, but not needed rn.
async function cancelPendingActions({ guildId, userId, applicationId, actionType }) {
	await PendingActions.destroy({
		where: {
			guildId,
			userId,
			applicationId,
			actionType,
		},
	});
	console.log(`[Scheduler] Canceled pending actions for user ${userId} in guild ${guildId}`);
}

function startActionWorker(manager, intervalMs = 5000) {
	console.log("Background action scheduler started.");

	setInterval(async () => {
		//Find actions where executeAt is in the past
		const expiredActions = await PendingActions.findAll({
			where: {
				executeAt: {
					[Op.lte]: new Date(),
				},
			},
			limit: 2,
			order: [["executeAt", "ASC"]],
		});

		if (expiredActions.length === 0) return;

		for (const action of expiredActions) {
			try {
				if (!(await isPremiumServer(action.guildId))) {
					continue;
				}

				if (!action.applicationId) {
					continue;
				}

				const application = await Application.findByPk(action.applicationId);
				if (!application) {
					console.error(`[Scheduler] Application not found for action ID ${action.id}`);
					continue;
				}

				await manager.broadcastEval(
					async (client, { guildId, userId, actionType, verifiedRoles, deniedRoles }) => {
						const guild = client.guilds.cache.get(guildId);
						if (!guild) return;

						//using force as we don't want stale data resulting in a false action.
						const member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);

						if (!member) return;

						async function validateRoles(guild, roleIds) {
							const botMember = guild.members.me || (await guild.members.fetchMe());
							if (!botMember?.permissions.has("ManageRoles")) return [];

							const hasUncachedRoles = roleIds.some((id) => !guild.roles.cache.has(id));
							if (hasUncachedRoles) {
								await guild.roles.fetch().catch((error) => console.error("Failed to fetch guild roles:", error));
							}

							// WARNING: Will silently drop invalid roles without user notification. Might be nice to add something in the future to notify the server. -Milo
							const botHighestPosition = botMember.roles.highest.position;
							const validRoleIds = roleIds.filter((roleId) => {
								const role = guild.roles.cache.get(roleId);
								return role && role.position < botHighestPosition && !role.managed;
							});

							return validRoleIds;
						}

						if (actionType === "UNVERIFIED_KICK") {
							if (!member.kickable) {
								console.log(`[Scheduler] Cannot kick ${userId} from ${guildId}: Member is not kickable.`);
								return;
							}

							//check if member still lacks verified role
							const hasVerifiedRole = verifiedRoles.some((roleId) => member.roles.cache.has(roleId));

							if (hasVerifiedRole) {
								console.log(`[Scheduler] Not kicking ${userId} from ${guildId}: Member has a verified role.`);
								return;
							}

							//if so, kick member
							await member.kick("Unverified status period expired.");
							console.log(`[Scheduler] Kicked ${userId} from ${guildId}`);
						} else if (actionType === "REMOVE_DENIED_ROLE") {
							const validRoles = await validateRoles(guild, deniedRoles);
							if (!validRoles?.length) {
								return;
							}

							const rolesToRemove = validRoles.filter((roleId) => member.roles.cache.has(roleId));

							if (!rolesToRemove?.length) {
								return;
							}

							await member.roles.remove(rolesToRemove, "Denied status period expired.");
							console.log(`[Scheduler] Removed denied role(${rolesToRemove.join(", ")}) from ${userId} in ${guildId}`);
						}
					},
					{
						context: {
							guildId: action.guildId,
							userId: action.userId,
							actionType: action.actionType,
							verifiedRoles: application.verifiedrole || [],
							deniedRoles: application.deniedrole || [],
						},
					},
				);
			} catch (err) {
				console.error(`[Scheduler] Failed to process action ID ${action.id}:`, err.message);
			} finally {
				await action.destroy();
			}
		}
	}, intervalMs);
}

module.exports = { startActionWorker, scheduleAction, cancelPendingActions };
