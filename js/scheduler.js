const path = require("node:path");
const { Op } = require("sequelize");
const { PendingActions, Application } = require("../dbObjects.js");
const { isPremiumServer } = require("./DBFunctions.js");

async function scheduleAction({ guildId, userId, applicationId, actionType, durationMs }) {
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		throw new TypeError("durationMs must be a positive number of milliseconds");
	}
	const executeAt = new Date(Date.now() + durationMs);

	return await PendingActions.upsert(
		{
			guildId,
			userId,
			applicationId,
			actionType,
			executeAt,
		},
		{
			conflictFields: ["guildId", "userId", "applicationId", "actionType"],
		},
	);
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
				const melpoLoggerPath = path.join(__dirname, "melpoLogger.js");

				await manager.broadcastEval(
					async (client, { guildId, userId, actionType, verifiedRoles, deniedRoles, melpoLoggerPath }) => {
						const { sendMelpoLog, logRolePermissionError } = require(melpoLoggerPath);
						const guild = client.guilds.cache.get(guildId);
						if (!guild) return;

						//using force as we don't want stale data resulting in a false action.
						const member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);

						if (!member) return;

						async function validateRoles(guild, roleIds) {
							const botMember = guild.members.me || (await guild.members.fetchMe());
							let droppedRoles = [];
							let failureReason = null;

							const hasManageRoles = botMember?.permissions.has("ManageRoles");

							if (!hasManageRoles) {
								droppedRoles = roleIds;
								failureReason = "missing_permission";
							} else {
								const hasUncachedRoles = roleIds.some((id) => !guild.roles.cache.has(id));
								if (hasUncachedRoles) {
									await guild.roles.fetch().catch((error) => console.error("Failed to fetch guild roles:", error));
								}

								const botHighestPosition = botMember.roles.highest.position;
								droppedRoles = roleIds.filter((roleId) => {
									const role = guild.roles.cache.get(roleId);
									return !(role && role.position < botHighestPosition && !role.managed);
								});

								if (droppedRoles.length > 0) {
									failureReason = "hierarchy";
								}
							}

							if (droppedRoles.length > 0) {
								await logRolePermissionError(guild, {
									targetUserId: userId,
									actionText: "assign/remove roles for",
									droppedRoles,
									failureReason,
								});
							}

							return hasManageRoles ? roleIds.filter((id) => !droppedRoles.includes(id)) : [];
						}

						if (actionType === "UNVERIFIED_KICK") {
							if (!member.kickable) {
								console.log(`[Scheduler] Cannot kick ${userId} from ${guildId}: Member is not kickable.`);
								await sendMelpoLog(guild, {
									title: "⚠️ Auto-Kick Failed",
									description: `Failed to auto-kick <@${userId}> because the member is not kickable. Melpo may be missing the **Kick Members** permission or the member has a role higher than Melpo.`,
								});
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
							melpoLoggerPath,
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
