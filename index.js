//-Initial house keeping
Error.stackTraceLimit = 30; // (v8/chrome)Set stack limit to 5 to focus on performance over debug depth. - mat (changed to 30 since debug depth is most important - milo)
//-Varible Imports
const console_hooks = require("./util/console_hooks.js"); // Console class hooking functionality -mat
const { ClusterManager } = require("discord-hybrid-sharding"); // Discord sharding parts.
const cron = require("node-cron"); // Scheduled task wrapper.
const { InviteTracker, TempConfig, QuestionId, Verification, Instances } = require("./dbObjects.js"); // Common database objects.
const { Op } = require("sequelize"); // Database access library.
const Sentry = require("@sentry/node");
// const fs = require("node:fs");
// const path = require("node:path");

const clusterName = "Main";

if (process.env.GLITCHTIP_DSN) {
	Sentry.init({
		dsn: process.env.GLITCHTIP_DSN,
		enableLogs: true,
		tracesSampleRate: 1.0,
		autoSessionTracking: false,
		sendDefaultPii: false,
		integrations: [
			Sentry.consoleLoggingIntegration({
				levels: ["log", "info", "warn", "error"],
			}),
		],
		// Modify event before sending as issue event to glitchtip
		beforeSend(event) {
			if (event.server_name) delete event.server_name;
			if (event.environment) delete event.environment;

			//remove unnecessary contexts
			if (event.contexts) {
				delete event.contexts.device;
				delete event.contexts.app;
				delete event.contexts.culture;
				delete event.contexts.cloud_resource;
				delete event.contexts.os;
			}

			return event;
		},
		// Modify breadcrumb before sending along with issue event to glitchtip
		beforeBreadcrumb(breadcrumb) {
			if (breadcrumb.category === "console") {
				if (breadcrumb?.data?.arguments) {
					delete breadcrumb.data.arguments;
				}
				if (breadcrumb?.data?.logger) {
					delete breadcrumb.data.logger;
				}
			}
			return breadcrumb;
		},
		// Modify log before sending to glitchtip logs
		beforeSendLog(log) {
			log.service = clusterName;
			log.attributes = { ...log.attributes, service: clusterName };
			return log;
		},
	});
}

console_hooks.SetPrefix("main");
require("./util/env_manager.js").config(); //Attempt to read .env if we need to.

if (process.env.NODE_ENV === "production") {
	try {
		require("./api/webhookListener");
	} catch (error) {
		console.error("Failed to initialize webhook listener.\n %O", error);
	}
}

//Block : Node.js process hooks.
{
	const _hooks = {
		handleRejection: (reason, promise) => {
			console.error("Unhandled Rejection\n %O \n-- Reason:\n %O", promise, reason);
		},
		handleException: (error, origin) => {
			console.error("Uncaught Exception:\n %O \n-- Origin:\n %O", error, origin);
		},
	};

	process.on("unhandledRejection", _hooks.handleRejection);
	process.on("uncaughtException", _hooks.handleException);
}

//Couple of tests to confirm handlers behave properly
//{ throw new Error("Testing exception handler"); } //Test to invoke unhandled exception.
//{ new Promise((resolve, reject) => { reject(); }); } //Test to invoke unhandled rejecton.

async function cleanupOldInvites() {
	try {
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const deleted = await InviteTracker.destroy({ where: { createdAt: { [Op.lt]: thirtyDaysAgo } } });
		console.log(`Cleaned up ${deleted} old invites`);
	} catch (error) {
		console.error("Failed to cleanup invites:", error);
	}
}

async function cleanupTempConfig() {
	try {
		const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
		const deleted = await TempConfig.destroy({ where: { createdAt: { [Op.lt]: fourteenDaysAgo } } });
		console.log(`Cleaned up ${deleted} temporary configurations`);
	} catch (error) {
		console.error("Failed to cleanup temp configs:", error);
	}
}

async function cleanupQuestionIds() {
	try {
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const deleted = await QuestionId.destroy({ where: { createdAt: { [Op.lt]: thirtyDaysAgo } } });
		console.log(`Cleaned up ${deleted} old question IDs`);
	} catch (error) {
		console.error("Failed to cleanup question IDs:", error);
	}
}

async function cleanupEmptyVerifications() {
	try {
		const verifications = await Verification.findAll();
		let deletedCount = 0;

		for (const verification of verifications) {
			const guildVerifs = verification?.guildVerifications;

			if (!guildVerifs || Object.keys(guildVerifs).length === 0 || guildVerifs === "{}") {
				await verification.destroy();
				deletedCount++;
			}
		}

		console.log(`Cleaned up ${deletedCount} empty verification entries`);
	} catch (error) {
		console.error("Failed to cleanup empty verifications:", error);
	}
}

//async function checkImageExists(imagePath) {
//	if (!imagePath) return false;
//	if (isRemoteImage(imagePath)) return true;

//	const resolvedPath = path.isAbsolute(imagePath)
//		? imagePath
//		: path.join(process.cwd(), imagePath);

//	try {
//		await fs.promises.access(resolvedPath, fs.constants.F_OK);
//		return true;
//	} catch {
//		return false;
//	}
//}

//async function cleanupImages(customisationField) {
//	try {
//		console.log(`Cleaning up images in ${customisationField}`);

//		const serverConfigs = await ServerConfig.findAll({
//			where: Sequelize.literal(`${customisationField}::jsonb ? "image"`)
//		});

//		console.log(
//			`Found ${serverConfigs.length} server configurations with images in ${customisationField}`
//		);

//		for (const config of serverConfigs) {
//		const fieldData = config[customisationField];
//		if (fieldData && (fieldData.image || fieldData.image === null)) {
//			const imageExists = await checkImageExists(fieldData.image);
//			if (!imageExists) {
//				console.log(`Image ${fieldData.image} does not exist, removing from config`);

//				const updatedFieldData = { ...fieldData };
//				delete updatedFieldData.image;

//				const updateResult = await ServerConfig.update(
//					{ [customisationField]: updatedFieldData },
//					{
//						where: { server_id: config.server_id },
//						returning: true
//					});

//					if (updateResult[0] > 0) {
//						console.log(`Successfully updated record ID ${config.server_id}`);
//					} else {
//						console.log(`No changes made to record ID ${config.server_id}`);
//					}
//			} else {
//					console.log(`Image ${fieldData.image} exists`);
//			}
//		}
//	}
//	return serverConfigs;
//	} catch (error) {
//		console.error(`Error cleaning up images in ${customisationField}:`, error);
//	}
//}

async function runAllCleanupTasks() {
	console.log("Running cleanup tasks...");
	await Promise.all([cleanupOldInvites(), cleanupTempConfig(), cleanupQuestionIds(), cleanupEmptyVerifications()]);
	console.log("All cleanup tasks completed.");
}

// Run cleanup at 03:30 every day
cron.schedule("30 3 * * *", async () => {
	console.log("Cron triggered at:", new Date().toISOString());
	await runAllCleanupTasks();
});

const manager = new ClusterManager("./bot.js", {
	totalShards: "auto",
	// totalShards: 3,
	totalClusters: "auto",
	shardsPerClusters: 8,
	token: process.env.MELPO_TOKEN,
	shardArgs: ["sharded"],
});

let clustersReady = 0;

manager.on("clusterCreate", (cluster) => {
	console.log(`Launched cluster ${cluster.id}`);

	cluster.on("death", (process) => {
		console.log(`[${new Date().toISOString()}] Cluster ${cluster.id} died with code ${process?.exitCode}`);
	});

	cluster.on("disconnect", () => console.log(`[${new Date().toISOString()}] Cluster ${cluster.id} disconnected`));

	cluster.on("reconnecting", () => console.log(`[${new Date().toISOString()}] Cluster ${cluster.id} reconnecting`));

	cluster.on("ready", async () => {
		clustersReady++;
		console.log(`Cluster ${cluster.id} ready (${clustersReady}/${manager.totalClusters})`);

		if (clustersReady === manager.totalClusters) {
			setTimeout(initializeAPI, 5000);

			setTimeout(async () => {
				console.log("All clusters are ready. Collecting guild IDs...");
				try {
					const allGuildIds = await manager.broadcastEval(async (client) =>
						client.guilds.cache.map((guild) => guild.id),
					);
					const uniqueGuildIds = [...new Set(allGuildIds.flat())];
					console.log(`Collected ${uniqueGuildIds.length} unique guild IDs from all clusters.`);

					await Instances.upsert({ client_id: process.env.MELPO_ID, guilds: uniqueGuildIds });

					console.log("Guild IDs successfully saved to the database.");
				} catch (error) {
					console.error("Failed to collect guild IDs from clusters:", error);
				}
			}, 5000);
		}
	});
});

//Added a catch to this to identify failure more cleanly - mat
manager.spawn().catch((reason) => console.error("Failed to spawn cluster manager.\n %O", reason));
global.shardManager = manager;

function initializeAPI() {
	const shouldPostStats = (() => {
		if (process.env.POST_STATS === "false") return false;
		if (process.env.POST_STATS === "true") return true;
		const hasApiKey =
			!!process.env.DISCORDBOTLIST ||
			!!process.env.TOPGG ||
			!!process.env.DISCORDBOTSGG ||
			!!process.env.DISFORGE ||
			!!process.env.DISCORDEXTREMELIST ||
			!!process.env.DISCORDS ||
			!!process.env.DISCORDSERVICES ||
			!!process.env.VOIDBOTS;
		return process.env.NODE_ENV === "production" && !!process.env.MELPO_ID && hasApiKey;
	})();

	if (!shouldPostStats) {
		console.log("API poster disabled (set POST_STATS=true to force, POST_STATS=false to disable).");
		return;
	}

	console.log("All shards ready, initializing API poster");
	const dbots = require("dbots");

	const poster = new dbots.Poster({
		clientID: process.env.MELPO_ID,
		apiKeys: {
			discordbotlist: process.env.DISCORDBOTLIST,
			topgg: process.env.TOPGG,
			discordbotsgg: process.env.DISCORDBOTSGG,
			disforge: process.env.DISFORGE,
			discordextremelist: process.env.DISCORDEXTREMELIST,
			discords: process.env.DISCORDS,
			discordservices: process.env.DISCORDSERVICES,
			voidbots: process.env.VOIDBOTS,
		},
		serverCount: async () => {
			try {
				const counts = await manager.broadcastEval((c) => c.guilds.cache.size);
				return counts.reduce((a, b) => a + b, 0);
			} catch {
				return 0;
			}
		},
		userCount: async () => {
			try {
				const counts = await manager.broadcastEval((c) =>
					[...c.guilds.cache.values()].reduce((acc, guild) => acc + guild.memberCount, 0),
				);
				return counts.reduce((a, b) => a + b, 0);
			} catch {
				return 0;
			}
		},
		voiceConnections: async () => {
			const voiceConnections = 0;
			return voiceConnections;
		},
		shardCount: manager.totalShards,
	});

	// Test counts before posting
	async function validateCounts() {
		try {
			const serverCounts = await manager.broadcastEval((c) => c.guilds.cache.size);
			const serverCount = serverCounts.reduce((a, b) => a + b, 0);

			const userCounts = await manager.broadcastEval((c) =>
				[...c.guilds.cache.values()].reduce((acc, guild) => acc + guild.memberCount, 0),
			);
			const userCount = userCounts.reduce((a, b) => a + b, 0);

			const shardCount = manager.totalShards;

			console.log("=== Bot Stats Validation ===");
			console.log(`Servers: ${serverCount}`);
			console.log(`Users: ${userCount}`);
			console.log(`Shards: ${shardCount}`);

			if (serverCount === 0 || userCount === 0 || shardCount === 0) {
				console.error("Invalid counts detected, aborting API post");
				return false;
			}

			if (serverCount > 50000 || userCount > 10000000) {
				console.error("server or usercount too high, aborting API post");
				return false;
			}

			console.log("Stats validation passed");
			return true;
		} catch (error) {
			console.error("Error validating counts:", error);
			return false;
		}
	}

	validateCounts()
		.then((isValid) => {
			if (isValid) {
				setTimeout(() => {
					try {
						poster.post();
						poster.startInterval();
						console.log("API poster started successfully");
					} catch (error) {
						console.error("Failed to start API poster:", error);
					}
				}, 15000);
			}
		})
		.catch(() => {});
}
