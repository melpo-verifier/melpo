/** biome-ignore-all lint/complexity/noStaticOnlyClass: This pattern is safe and not obstructing readablity */
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { BaseError: SequelizeBaseError } = require("sequelize"); //Sequalise base error class, remapped to a particular error type - mat
const RateLimitError = require("./RateLimitHandling.js");
const Sentry = require("@sentry/node");

class ErrorHandler {
	static ERROR_TYPES = {
		PERMISSION: "permission",
		DATABASE: "database",
		API: "api",
		VALIDATION: "validation",
		MEMORY: "memory",
		RATE_LIMIT: "rate_limit",
		UNKNOWN: "unknown",
	};

	static errorStats = new Map();
	static lastCleanup = Date.now();
	static lastMemoryCleanup = 0;

	/**
	 * Generates a ErrorID
	 * @returns {String} Generated errorID
	 */
	static generateErrorId() {
		const timestamp = Date.now().toString(36);
		const random = Math.random().toString(36).substring(2, 4);
		return `ERR-${timestamp.slice(-4)}${random}`.toUpperCase();
	}

	/**
	 * Handler call back, constructs the basic error data.
	 * @param {Client} client Discord.js client object handle.
	 * @param {Error} error Handle to a error object.
	 * @param {BaseInteraction} interaction optional, Discord.js interaction handler.
	 * @param {*} context optional, [Unknown, no in code use]
	 * @returns {String} Generated ErrorID
	 */
	static async handle(client, error, interaction = null, context = null) {
		const errorId = ErrorHandler.generateErrorId();
		const timestamp = new Date().toISOString();
		const errorType = ErrorHandler.classifyError(error);

		ErrorHandler.updateErrorStats(errorType);

		let clusterName;

		if (client.cluster?.id >= 0) {
			clusterName = `${client.cluster.id}`;
		} else {
			clusterName = process.env.name ? process.env.name.split("_").pop() : "Custom";
		}

		Sentry.withScope((scope) => {
			scope.setTag("error_id", errorId);
			scope.setTag("cluster", clusterName);

			if (interaction) {
				const commandName = interaction.commandName ?? interaction.customId?.split("_")?.[0] ?? "Unknown";
				scope.setTag("command", commandName);
				scope.setTag("guild_id", interaction.guild?.id || "DM");
				scope.setTag("interaction_type", interaction.type?.toString() || "Unknown");
			}
			if (context) {
				scope.setTag("context_type", context);
			}

			if (interaction?.guild && interaction.channel) {
				const botPermissions = interaction.channel.permissionsFor(interaction.guild.members.me);

				scope.setContext("Channel Bot Permissions", {
					can_view_channel: botPermissions?.has("ViewChannel") ?? false,
					can_send_messages: botPermissions?.has("SendMessages") ?? false,
					can_read_message_history: botPermissions?.has("ReadMessageHistory") ?? false,
					can_embed_links: botPermissions?.has("EmbedLinks") ?? false,
					can_create_private_threads: botPermissions?.has("CreatePrivateThreads") ?? false,
					can_create_public_threads: botPermissions?.has("CreatePublicThreads") ?? false,
					can_send_messages_in_threads: botPermissions?.has("SendMessagesInThreads") ?? false,
					can_manage_threads: botPermissions?.has("ManageThreads") ?? false,
					can_manage_messages: botPermissions?.has("ManageMessages") ?? false,
					raw_permissions_bitfield: botPermissions?.bitfield?.toString() || "0",
				});
			}

			if (Array.isArray(error?.parent?.errors)) {
				for (const [key, value] of Object.entries(error.parent.errors)) {
					scope.setContext(`Parent Error: ${key}`, value);
				}
			}

			// Add specific fields for subErrors
			if (Array.isArray(error?.errors)) {
				for (const [key, subError] of error.errors) {
					const fieldDetails = {
						message: subError.message || subError.toString?.(),
						...subError,
					};
					scope.setContext(`Field Error: ${key}`, fieldDetails);
				}
			}

			if (interaction) {
				const commandArgs = interaction.options?.data?.reduce((acc, opt) => {
					acc[opt.name] = opt.value ?? (opt.user?.id || opt.role?.id || "True");
					return acc;
				}, {});

				scope.setContext("Discord Interaction", {
					channel_id: interaction.channelId,
					user_id: interaction.user?.id,
					options: commandArgs,
					locale: interaction.locale,
					guild_member_count: interaction.guild?.memberCount || 0,
					custom_id: interaction.customId || null,
					is_deferred: interaction.deferred,
					is_replied: interaction.replied,
					interaction_created_at: new Date(interaction.createdTimestamp).toISOString(),
				});

				scope.setUser({
					id: interaction.user.id,
					username: interaction.user.tag,
				});
			}

			scope.setContext("Bot Performance & State", {
				shard_ping: client.ws?.ping ?? 0,
				shard_id: interaction?.guild?.shardId ?? client.shard?.ids[0] ?? 0,
				guilds_cached_on_cluster: client.guilds?.cache?.size ?? 0,
				users_cached_on_cluster: client.users?.cache?.size ?? 0,
				uptime_seconds: Math.floor(process.uptime()),
				memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
			});

			Sentry.captureException(error);
		});

		console.error(`[${timestamp}] Error ${errorId} (${errorType}):`, {
			message: error.message,
			error: error,
			//stack: error.stack?.split("\n").slice(0, 5).join("\n"),
			context: context || "Unknown",
			guild: interaction?.guild?.id || "Unknown",
			user: interaction?.user?.id || "Unknown",
			command: interaction?.commandName || "Unknown",
		});

		if (error instanceof RateLimitError) {
			console.warn(`Rate limit hit: ${error.rateLimitInfo.route}`);
			console.warn(`Reset after: ${error.rateLimitInfo.timeout}ms`);
			return errorId;
		}

		// Unknown Interaction
		if (error.code === 10062) return errorId;

		// Service Unavailable
		if (error.status === 503) return errorId;

		if (interaction && !interaction.replied && !interaction.deferred) {
			try {
				await ErrorHandler.handleUserNotification(interaction, errorType, errorId, error);
			} catch (userError) {
				console.error("Failed to notify user about error:", userError.message);
			}
		}

		if (errorType !== ErrorHandler.ERROR_TYPES.PERMISSION) {
			try {
				await ErrorHandler.handleDevNotification(client, error, errorType, errorId, interaction);
			} catch (devError) {
				console.error("Failed to notify developer about error:", devError.message);
			}
		}

		//if (errorType === ErrorHandler.ERROR_TYPES.MEMORY) await ErrorHandler.handleMemoryError(error, client);
		if (Date.now() - ErrorHandler.lastCleanup > 3600000) ErrorHandler.cleanupErrorStats();

		return errorId;
	}

	/**
	 * Classify error by hints.
	 * @param {Error} error Handle to a error to identify.
	 * @returns {String} Classified error or "unknown" if unsure.
	 */
	static classifyError(error) {
		if (error instanceof RateLimitError || error.code === "RATE_LIMITED") return ErrorHandler.ERROR_TYPES.RATE_LIMIT;

		//DiscordAPIError is discord.js's error class for api errors.
		if (error.code === 50013 || error.message?.includes("permissions") || error.message?.includes("Missing Access"))
			return ErrorHandler.ERROR_TYPES.PERMISSION;

		if (error.code === 10008 || error.code === 10003 || error.code === 50001 || error.code === 10062)
			return ErrorHandler.ERROR_TYPES.API;

		if (
			/*error.name === "SequelizeError" ||*/
			//(error instanceof SequelizeBaseError) || //Improved sequalise error detection, check if instance of their error base class. - mat
			error instanceof SequelizeBaseError || //Improved sequalise error detection, check if instance of their error base class. - mat
			error.message?.includes("database") ||
			(typeof error.code === "string" && error.code.startsWith("23"))
		)
			return ErrorHandler.ERROR_TYPES.DATABASE;

		if (
			error.message?.includes("heap") ||
			error.message?.includes("memory") ||
			error.code === "ERR_MEMORY_ALLOCATION_FAILED"
		)
			return ErrorHandler.ERROR_TYPES.MEMORY;

		if (error.message?.includes("validation") || error.message?.includes("invalid"))
			return ErrorHandler.ERROR_TYPES.VALIDATION;

		return ErrorHandler.ERROR_TYPES.UNKNOWN;
	}

	static updateErrorStats(errorType) {
		const current = ErrorHandler.errorStats.get(errorType) || { count: 0, lastSeen: 0 };
		current.count++;
		current.lastSeen = Date.now();
		ErrorHandler.errorStats.set(errorType, current);
	}

	static async handleUserNotification(interaction, errorType, errorId, error) {
		if (!interaction?.isRepliable?.()) return;

		const messages = {
			[ErrorHandler.ERROR_TYPES.PERMISSION]: "I don't have the required permissions to do that.",
			[ErrorHandler.ERROR_TYPES.DATABASE]: "There was an issue with the database.",
			[ErrorHandler.ERROR_TYPES.API]: "Discord's API is having issues.",
			[ErrorHandler.ERROR_TYPES.VALIDATION]: "The provided input was invalid.",
			[ErrorHandler.ERROR_TYPES.UNKNOWN]: "An unexpected error occurred.",
		};

		let embed;
		//Note : Static invite token
		if (error.code === 50001 || error.code === 50013) {
			embed = new EmbedBuilder()
				.setColor("Red")
				.setTitle("⚠️ Error")
				.setDescription(
					`[Support server](https://discord.gg/jjGAwwwxZz)\n${messages[errorType]}\n${error.name}: ${error.message}\n\n**Make sure Melpo has these permissions in this channel and check for required permissions with </checkpermissions:1324406378328096890>:**\n• Send Messages\n• View Channel\n• Embed Links\n• Attach Files\n• Read Message History\n\nIf this issue persists, join the support server or contact the bot developer (\`milo_dev\`) with the following error ID: \`${errorId}\`.`,
				)
				.setTimestamp();
		} else {
			embed = new EmbedBuilder()
				.setColor("Red")
				.setTitle("⚠️ Error")
				.setDescription(
					`[Support server](https://discord.gg/jjGAwwwxZz)\n${messages[errorType]}\n${error.name}: ${error.message}\n\nIf this issue persists, contact the bot developer (\`milo_dev\`) with the following error ID: \`${errorId}\`.`,
				)
				.setTimestamp();
		}

		if (interaction.replied) await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
		else if (interaction.deferred) await interaction.followUp({ embeds: [embed] });
		else await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	}

	/**
	 * Diagnostic report callback, handles notification of developer.
	 * @param {Client} client Discord.js client handle.
	 * @param {Error} error Handle to error object.
	 * @param {String} errorType Type of error from classify error.
	 * @param {String} errorId ErrorID generated from report.
	 * @param {BaseInteraction} interaction Discord.js Interaction handle.
	 * @returns {void}
	 */
	static async handleDevNotification(client, error, errorType, errorId, interaction) {
		//API error op codes:
		//10062 - Invalid interaction [Lack of interaction update calls]
		//50013 - Lack of permissions [Missing channel or server level perms]
		//50001 - Missing access      [Missing account level access]
		if (error.code === 50001 || error.code === 50013 || error.code === 10062 || error.status === 503) return;

		const interactionInfo = interaction
			? {
					name: "Interaction Info",
					value: `\`Type\`: ${interaction.type}\n\`Command\`: ${interaction.commandName || "N/A"}\n\`Channel\`: ${interaction.channel?.name || "N/A"}\n\`User\`: ${interaction.user?.tag || "N/A"}\n\`Server\`: ${interaction.guild?.name || "N/A"}\n\`Server ID\`: ${interaction.guild?.id || "N/A"}`,
				}
			: {
					name: "Interaction",
					value: "No interaction context",
				};

		let Stack_out = "";
		Stack_out += "```";
		Stack_out += error.stack?.slice(0, 1018); //account for ``` adding to character limit 1024-6=1018
		Stack_out += "```";

		const devEmbed = new EmbedBuilder()
			.setColor("Red")
			.setTitle(`🐛 Error Report (ID: ${errorId})`)
			.addFields(
				{ name: "Error ID", value: errorId },
				interactionInfo,
				{ name: "Type", value: errorType },
				{ name: "Error Name", value: error.name || "N/A" },
				{ name: "Message", value: error.message || "N/A" },
				{ name: "Stack", value: Stack_out || "N/A" },
			)
			.setTimestamp();

		//Enhanced diagnostic output options should cover everything - mat
		//if (typeof(process.env.BUG_REPORT_MODE) !== "undefined") {
		if (typeof process.env.BUG_REPORT_MODE !== "undefined") {
			//Diagnostic handler block.
			const debug_actions = {
				act_DM: async (_out) => {
					const devUser = await client.users.fetch(process.env.BUG_REPORT_USER);
					await devUser.send(_out);
				},
				act_CH: async (_out) => {
					await client.cluster.broadcastEval(
						async (client, { outMessage }) => {
							const devChan = client.channels.cache.get(process.env.BUG_REPORT_CHAN);
							if (devChan) {
								if (devChan.isThread()) {
									if (devChan.archived) await devChan.setArchived(false);
								}
								await devChan.send(outMessage);
							}
						},
						{ context: { outMessage: _out } },
					);
				},
			};

			//--The environment var setting supports three modes--
			//None        : Just skip over sending it discord side.
			//User mode   : DM the issue to the configured userID.
			//Channel mode: Post the issue to a channel(ideally in a development server).
			//Both        : DM the issue and post to a channel.
			switch (process.env.BUG_REPORT_MODE) {
				case "none":
					break;
				case "user":
					await debug_actions.act_DM({ embeds: [devEmbed] });
					break;
				case "chan":
					await debug_actions.act_CH({ embeds: [devEmbed] });
					break;
				case "both":
					{
						await debug_actions.act_DM({ embeds: [devEmbed] });
						await debug_actions.act_CH({ embeds: [devEmbed] });
					}
					break;
				default:
					console.log("Unknown report mode : %s", process.env.BUG_REPORT_MODE);
					break;
			}
		}
	}

	//static async handleMemoryError(error, client) {
	//	const now = Date.now();
	//	if (this.lastMemoryCleanup && now - this.lastMemoryCleanup < 60000) {
	//		console.warn("Skipping memory cleanup: already performed recently.");
	//		return;
	//	}

	//	this.lastMemoryCleanup = now;
	//	console.error(`Critical memory error detected:`, error.message);

	//	if (client) {
	//		console.log("Performing emergency memory cleanup...");

	//		client.guilds.cache.clear();
	//		client.users.cache.clear();
	//		client.channels.cache.clear();

	//		if (client.commands) client.commands.clear();
	//		if (client.buttonCommands) client.buttonCommands.clear();
	//		if (client.menus) client.menus.clear();
	//		if (client.modals) client.modals.clear();

	//		this.errorStats.clear();

	//		if (global.gc) global.gc();

	//		try {
	//			const owner = await client.users.fetch("808738877945675786");
	//			await owner.send(`Bot had to perform emergency cleanup. Error: ${error.message}`);
	//		} catch (err) {
	//			console.error("Failed to notify owner about memory error:", err.message);
	//		}
	//	}
	//}

	static cleanupErrorStats() {
		const oneHourAgo = Date.now() - 3600000;

		for (const [type, stats] of ErrorHandler.errorStats.entries())
			if (stats.lastSeen < oneHourAgo) ErrorHandler.errorStats.delete(type);

		ErrorHandler.lastCleanup = Date.now();
		console.log("Error stats cleaned up");
	}

	static getErrorStats() {
		const stats = {};
		for (const [type, data] of ErrorHandler.errorStats.entries())
			stats[type] = { count: data.count, lastSeen: new Date(data.lastSeen).toISOString() };

		return stats;
	}
}

module.exports = ErrorHandler;
