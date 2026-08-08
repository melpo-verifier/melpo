//-Initial house keeping
Error.stackTraceLimit = 5; // (v8/chrome)Set stack limit to 5 to focus on performance over debug depth. - mat
//-Varible Imports
const console_hooks = require("./util/console_hooks.js"); // Component : Console class hooking functionality -mat
const fs = require("node:fs"); // Library : Node js file system module.
const path = require("node:path"); // Library : Node js path module.
const { Client, IntentsBitField, Partials, AuditLogEvent, PermissionsBitField, Options } = require("discord.js"); // Library : Discord.js library imports.
require("./util/env_manager.js").config(); // Component : .env parsing (invoking config callback for setup)
const { updateBotJoins, updateBotLeaves } = require("./js/tempconfigfuncs.js"); //
const { processLeaveMessages, cleanupVerificationData, getMessageIds } = require("./js/verificationHandler.js"); // Component : Verification handling wrapper.
const {
	ServerConfig,
	Verification,
	Instances,
	Application,
	Blacklist,
	PremiumSubscription,
} = require("./dbObjects.js"); // Component : Common database objects.
const InviteManager = require("./js/dinvite.js"); // Component : Discord invites
const ErrorHandler = require("./js/ErrorHandling.js"); // Component : Error handling functionality(report to developer etc).
const RateLimitError = require("./js/RateLimitHandling.js"); // Component : Rate limit error wrapper.
const CommandLoader = require("./js/CommandLoader.js"); // Component : Command loader.
// const MemoryManager = require("./js/MemoryManager.js"); //
const { ClusterClient, getInfo } = require("discord-hybrid-sharding"); // Library : Discord sharding parts.

if (process.argv.length > 2 && process.argv[2] === "sharded") {
	console.log("sharded arrived!");
	createBot(process.env.MELPO_TOKEN).catch(() => {}); //Pass token directly from environment block - mat
}

async function createBot(token) {
	/*
	const myIntents = new IntentsBitField();
	myIntents.add(
		IntentsBitField.Flags.Guilds,
		IntentsBitField.Flags.GuildMembers,
		IntentsBitField.Flags.GuildModeration,
		IntentsBitField.Flags.GuildInvites,
		IntentsBitField.Flags.GuildMessages,
		IntentsBitField.Flags.GuildMessageReactions,
		IntentsBitField.Flags.DirectMessages,
		IntentsBitField.Flags.MessageContent,
	);
	*/
	const clientOptions = {
		partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
		intents: [
			IntentsBitField.Flags.Guilds,
			IntentsBitField.Flags.GuildMembers,
			IntentsBitField.Flags.GuildModeration,
			IntentsBitField.Flags.GuildInvites,
			IntentsBitField.Flags.GuildMessages,
			IntentsBitField.Flags.GuildMessageReactions,
			IntentsBitField.Flags.DirectMessages,
			IntentsBitField.Flags.MessageContent,
		],
		allowedMentions: { parse: ["users", "roles"], repliedUser: true },
		sweepers: {
			messages: {
				interval: 3600,
				lifetime: 7200,
			},
		},
		makeCache: Options.cacheWithLimits({
			MessageManager: {
				maxSize: 50,
				keepOverLimit: (message) =>
					message.author?.id === client.user.id && message.createdTimestamp > Date.now() - 60 * 60 * 24 * 7,
			},
			UserManager: {
				maxSize: 5000,
				keepOverLimit: (user) => user.id === client.user.id,
			},
			GuildMemberManager: {
				maxSize: 1000,
			},
			RoleManager: Infinity,
		}),
	};

	const isSharded = process.argv.includes("sharded");
	if (isSharded) {
		clientOptions.shards = getInfo().SHARD_LIST;
		clientOptions.shardCount = getInfo().TOTAL_SHARDS;
	}

	const client = new Client(clientOptions);

	if (isSharded) {
		client.cluster = new ClusterClient(client);
		console_hooks.SetPrefix(`Cluster ${String(client.cluster.id)}`); //Tag cluster in console hooker - Mat
	}

	new InviteManager(client);

	// const memoryManager = new MemoryManager(client);
	// memoryManager.start();

	// global.memoryManager = memoryManager;

	//Block : Node.js process hooks.
	{
		//unhandledRejection and uncaughtException are redirected to a common call, so used a common hook. - mat
		const _ErrorHook = async (error) => await ErrorHandler.handle(client, error);

		process.on("unhandledRejection", _ErrorHook);
		process.on("uncaughtException", _ErrorHook);
	}

	client.rest.on("rateLimited", async (rateLimitInfo) => {
		console.log("rate limited!");
		await ErrorHandler.handle(client, new RateLimitError(rateLimitInfo));
	});

	client.on("error", async (error) => await ErrorHandler.handle(client, error));

	console.log("Loading commands...");

	const loader = new CommandLoader(client);
	loader.loadAll();

	console.log("Commands loaded.");
	console.log("Loading events...");

	const eventsPath = path.join(__dirname, "events");
	const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

	for (const file of eventFiles) {
		const filePath = path.join(eventsPath, file);
		const event = require(filePath);

		if (event.once) {
			client.once(event.name, (...args) => event.execute(...args));
		} else {
			client.on(event.name, (...args) => event.execute(...args, client));
		}
	}
	console.log("Events loaded.");

	client.on("guildCreate", async (guild) => {
		try {
			const serverEntry = await Blacklist.findOne({ where: { server_id: guild.id, blacklisted: true } });

			let ownerId = guild.ownerId;
			if (!ownerId) {
				try {
					const owner = await guild.fetchOwner();
					ownerId = owner?.id;
				} catch (fetchOwnerError) {
					console.error(`Failed to fetch owner for guild ${guild.id}:`, fetchOwnerError);
				}
			}

			const ownerEntry = ownerId ? await Blacklist.findOne({ where: { user_id: ownerId, blacklisted: true } }) : null;

			if (serverEntry || ownerEntry) {
				console.log(`Leaving blacklisted guild ${guild.id} (${serverEntry ? "server" : "owner"}).`);
				return await guild.leave();
			}
		} catch (error) {
			console.error("Blacklist check failed on guildCreate:", error);
		}

		if (client.user.id !== process.env.MELPO_ID && client.user.id !== "916372883087974440") {
			//custom bot, check guild limit
			const instance = await Instances.findOne({ where: { client_id: client.user.id } });

			if (!instance) {
				console.error(`No instance found for client_id ${client.user.id}`);
				return null;
			}

			const premium = await PremiumSubscription.findOne({ where: { status: "ACTIVE", id: instance.subscription_id } });

			if (!premium) {
				console.log("No active premium subscription found for this whitelabel bot.");
				return await guild.leave();
			}

			if (
				(premium.tier.startsWith("whitelabel_1") && client.guilds.cache.size > 1) ||
				(premium.tier.startsWith("whitelabel_3") && client.guilds.cache.size > 3)
			) {
				console.log(`Guild limit reached for custom bot. Leaving guild ${guild.id}.`);

				const user = await client.users.fetch(premium.purchaser_id).catch(() => null);
				if (user) {
					await user
						.send(
							`Your custom bot instance of Melpo Verifier has reached its guild limit and has left the guild "${guild.name}". Please contact support if you believe this is a mistake or manage your subscriptions at: https://melpo.app/premium`,
						)
						.catch(() => null);
				}

				return await guild.leave();
			}
		}

		await updateBotJoins();

		try {
			const status = await Instances.findOne({ where: { client_id: client.user.id } });
			const guilds = status?.guilds || [];
			if (!guilds.includes(guild.id)) {
				guilds.push(guild.id);
				await Instances.update({ guilds }, { where: { client_id: client.user.id } });
			}
		} catch (error) {
			console.error("Failed to update guild list on guildCreate:", error);
		}
	});

	client.on("guildDelete", async (guild) => {
		if (!guild.name || !guild.memberCount) return; //console.log("Received partial guild data:", guild);

		await updateBotLeaves();

		try {
			const status = await Instances.findOne({ where: { client_id: client.user.id } });
			const guilds = status?.guilds || [];
			const updatedGuilds = guilds.filter((id) => id !== guild.id);
			await Instances.update({ guilds: updatedGuilds }, { where: { client_id: client.user.id } });
		} catch (error) {
			console.error("Failed to update guild list on guildDelete:", error);
		}
	});

	client.on("guildMemberAdd", async (member) => {
		if (!member || member.user.bot) return;

		let serverConfig;
		try {
			serverConfig = await ServerConfig.findOne({ where: { server_id: member.guild.id }, attributes: ["autorole"] });
		} catch (error) {
			console.error("Failed to fetch server config:", error);
			return;
		}

		if (!serverConfig?.autorole || !Array.isArray(serverConfig.autorole) || !serverConfig.autorole.length) return;

		try {
			let botMember = member.guild.members.cache.get(client.user.id);
			if (!botMember) {
				botMember = await member.guild.members.fetch(client.user.id);
			}

			if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

			const botHighestPosition = botMember.roles.highest.position;
			const validRoleIds = serverConfig.autorole.filter((roleId) => {
				const role = member.guild.roles.cache.get(roleId);
				return role && role.position < botHighestPosition;
			});

			if (!validRoleIds.length) return;

			const rolePromises = validRoleIds?.map(async (roleId) => {
				try {
					await member.roles.add(roleId, "Auto-role assignment");
				} catch (roleError) {
					if (roleError.code === 10007) {
						throw roleError;
					} // Unknown Member

					console.error(`Failed to add role ${roleId} to ${member.id}: ${roleError.message}`);
				}
			});

			await Promise.allSettled(rolePromises);
		} catch (error) {
			if (error.code !== 10007) {
				ErrorHandler.handle(client, error);
			}
		} finally {
			setTimeout(() => {
				if (member.guild.members.cache.has(member.id)) {
					member.guild.members.cache.delete(member.id);
				}
			}, 5000);
		}
	});

	client.on("guildMemberRemove", async (member) => {
		if (!member?.guild?.id || !member.id) return;

		let applications, verification;

		try {
			[applications, verification] = await Promise.all([
				Application.findAll({
					where: { server_id: member.guild.id },
					attributes: ["id", "reviewchannel", "verifylogs"],
				}),
				Verification.findOne({ where: { userId: member.id }, attributes: ["userId", "guildVerifications"] }),
			]);
		} catch (error) {
			console.error("Failed to fetch configs:", error);
			return;
		}

		if (!applications?.length || !verification) return;

		const guildData = verification?.guildVerifications?.[member.guild.id];
		if (!guildData) return;

		let wasKicked = false;
		const botMember = member.guild.members.cache.get(client.user.id);
		if (botMember?.permissions.has("ViewAuditLog")) {
			try {
				const auditLogs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });

				const kickLog = auditLogs.entries.first();
				wasKicked = kickLog?.target?.id === member.id && kickLog.createdTimestamp > Date.now() - 3000;

				if (wasKicked) {
					return;
				}
			} catch {
				// Ignore audit log errors
			}
		}

		for (const app of applications) {
			const appMessageIds = getMessageIds(verification, member.guild.id, app.id);
			if (!appMessageIds || appMessageIds.length === 0) continue;

			await processLeaveMessages({ client, member, application: app, messageIds: appMessageIds });
		}

		try {
			await cleanupVerificationData(verification, member.guild.id, member.id);
		} catch (error) {
			console.error("Failed to update verification:", error);
		}
	});

	process.on("exit", (code) => {
		console.log(`this shard is shutting down with exit code: ${code}`);
		if (client) {
			client.removeAllListeners();
			client.guilds.cache.clear();
			client.users.cache.clear();
			client.channels.cache.clear();
		}
	});

	process.on("SIGTERM", () => {
		console.log("Received SIGTERM, shutting down gracefully...");
		client?.destroy();
		process.exit(0);
	});

	process.on("SIGINT", () => {
		console.log("Received SIGINT, shutting down gracefully...");
		client?.destroy();
		process.exit(0);
	});

	console.log("Logging in...");

	const maxRetries = 10;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			await client.login(token);

			console.log("Successfully logged in!");

			break;
		} catch (error) {
			if (attempt === maxRetries - 1) throw error;

			//const delay = Math.min(Math.pow(2, attempt) * 1000, 60000);
			const delay = Math.min(2 ** attempt * 1000, 60000);
			console.log(`Login failed: ${error.message}, retrying in ${delay}ms...`);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	return client;
}

module.exports = { createBot };
