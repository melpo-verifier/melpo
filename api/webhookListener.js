const express = require("express");
const { exec } = require("node:child_process");
const pm2 = require("pm2");
const { Client, GatewayIntentBits } = require("discord.js");
const { Instances } = require("../dbObjects.js");
const { Op } = require("sequelize");
const cors = require("cors");
const { decryptData } = require("../js/DBFunctions.js");
const { syncApplicationPanels } = require("../js/updatePanels.js");

const app = express();
app.use(express.json());
app.use(cors());

app.post("/api/updatePanels/:guildId", async (req, res) => {
	const { guildId } = req.params;
	const { webhookUpdated } = req.body;
	console.log(`Received request to update panels for guild ${guildId}`);
	if (!guildId) return res.status(400).json({ error: "Missing guildId" });

	try {
		const statuses = await Instances.findAll({ where: { guilds: { [Op.contains]: [guildId] } } });

		if (!statuses || statuses.length === 0) {
			console.error(`No status entries found for guild ${guildId}`);
			return res.status(404).json({ error: "No status entries found" });
		}

		const clientIds = statuses.map((status) => status.client_id);

		let clientId;
		if (clientIds.length === 1 && clientIds[0] === process.env.MELPO_ID) {
			console.log("Using default bot (Melpo) for server");
			clientId = process.env.MELPO_ID;

			let targetClusterId = null;

			try {
				const checkResults = await global.shardManager.broadcastEval(
					(client, { guildId }) => (client.guilds.cache.has(guildId) ? client.cluster.id : null),
					{ context: { guildId } },
				);
				targetClusterId = checkResults.find((id) => id !== null);
			} catch (error) {
				console.error("Error checking clusters:", error);
			}

			if (targetClusterId === undefined || targetClusterId === null)
				return res.status(404).json({ error: "Guild not found on any cluster" });

			console.log(`Found guild ${guildId} on cluster ${targetClusterId}`);

			const [result] = await global.shardManager.broadcastEval(
				async (client, { guildId, melpoId, path, webhookUpdated }) => {
					const { syncApplicationPanels } = require(path);
					const guild = client.guilds.cache.get(guildId);
					if (!guild) return { success: false, error: "Guild not found" };

					try {
						const result = await syncApplicationPanels(guild, melpoId, webhookUpdated);

						console.log(result);
						return { success: true };
					} catch (error) {
						console.log("Error in updateVerifyMessage:", error);
						return { success: false, error: error.message };
					}
				},
				{
					context: {
						guildId,
						melpoId: process.env.MELPO_ID,
						path: require("node:path").join(process.cwd(), "/js/updatePanels.js"),
						webhookUpdated: webhookUpdated,
					},
					cluster: targetClusterId,
				},
			);

			if (!result.success) return res.status(404).json({ error: result.error });

			console.log(result);
			console.log(`Verification message ${result.action} successfully`);
		} else {
			const customBotId = clientIds.find((id) => id !== process.env.MELPO_ID);

			if (customBotId) {
				console.log(`Using custom bot for guild ${guildId}, client ID: ${customBotId}`);
				clientId = customBotId;

				const botToken = await getBotTokenFromId(clientId);
				if (!botToken) return res.status(404).json({ error: "Bot token not found for client id" });

				// Create a temporary Discord.js client
				const client = new Client({ intents: [GatewayIntentBits.Guilds] });

				return new Promise((resolve, reject) => {
					client.once("ready", async () => {
						try {
							console.log(`Logged in as ${client.user.tag}`);

							const guild = client.guilds.cache.get(guildId);
							if (!guild) {
								client.destroy();
								return resolve(res.status(404).json({ error: "Guild not found" }));
							}

							await syncApplicationPanels(guild, client.user.id, webhookUpdated);

							client.destroy();
							console.log("Custom bot logged off");
							resolve(res.status(200).json({ message: "Verify channel updated successfully" }));
						} catch (error) {
							client.destroy();
							console.error("Error with custom bot:", error);
							reject(error);
						}
					});

					client.on("error", (error) => {
						client.destroy();
						console.error("Custom bot login error:", error);
						reject(error);
					});

					client.login(botToken);
				});
			} else {
				console.error(`No custom bot found for guild ${guildId}`);
				return res.status(404).json({ error: "Melpo nor a custom bot found for this guild" });
			}
		}

		res.status(200).json({ message: "Verify channel updated successfully" });
	} catch (error) {
		console.error("Error updating verify channel:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.post("/api/pm2/instances", async (req, res) => {
	const { bot } = req.body;
	//if (!bot || !bot.client_id) return res.status(400).json({ error: "Missing bot details" });
	if (!bot?.client_id) return res.status(400).json({ error: "Missing bot details" });
	const clientId = bot.client_id;

	try {
		const existingBot = await Instances.findOne({ where: { client_id: clientId } });
		if (!existingBot) return res.status(404).json({ error: "Bot instance not found in database" });

		const ownerId = existingBot.owner_id;
		const processName = `bot_${ownerId}_${clientId}`;

		const pm2Command = `pm2 start customindex.js --name "${processName}" --time -f -- "${clientId}"`;

		exec(pm2Command, async (error, stdout) => {
			if (error) {
				console.error(`Error starting PM2 instance: ${error.message}`);
				return res.status(500).json({ error: "Failed to start bot instance" });
			}
			console.log(`PM2 bot started for ${clientId}:`, stdout);

			// Save PM2 config so it restarts on server reboot
			exec("pm2 save", (saveError) => {
				if (saveError) console.error(`Error saving PM2 config: ${saveError.message}`);
				else console.log("PM2 config saved for auto-restart on reboot");
			});

			// Wait a moment for the bot to fully initialize, then register commands
			setTimeout(() => {
				const deployCommand = `node deploy-commands-global.js --clientId "${clientId}"`;
				exec(deployCommand, (deployError, deployStdout) => {
					if (deployError) console.error(`Error registering commands for ${clientId}: ${deployError.message}`);
					else console.log(`Commands registered for ${clientId}:`, deployStdout);
				});
			}, 2000);

			res.json({
				success: true,
				message: "Bot instance started and commands are being registered",
			});
		});
	} catch (error) {
		console.error("Error retrieving custom bot from db:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.patch("/api/bot/:clientId/presence", async (req, res) => {
	const { clientId } = req.params;
	const { status_name, status_type, status } = req.body;

	console.log(`Received presence update for clientId ${clientId}:`, { status_name, status_type, status });
	if (clientId === process.env.MELPO_ID) return res.status(403).json({ error: "Cannot modify Melpo through the API" });

	try {
		const instance = await Instances.findOne({ where: { client_id: clientId } });
		if (!instance) return res.status(404).json({ error: "Bot instance not found" });

		const processName = `bot_${instance.owner_id}_${clientId}`;

		// Update presence via PM2 messaging
		pm2.connect((err) => {
			if (err) {
				console.error("Failed to connect to PM2:", err);
				return res.json({ success: true, bot: instance, saved: true, warning: "Could not send update signal" });
			}

			pm2.list((err, processList) => {
				if (err) {
					console.error("Failed to list PM2 processes:", err);
					pm2.disconnect();
					return res.json({ success: true, bot: instance, saved: true, warning: "Could not send update signal" });
				}

				const process = processList.find((p) => p.name === processName);
				if (!process) {
					console.warn(`Process ${processName} not found in PM2 list`);
					pm2.disconnect();
					return res.json({
						success: true,
						bot: instance,
						saved: true,
						warning: "Process not found",
					});
				}

				pm2.sendDataToProcessId(
					process.pm_id,
					{
						type: "updatePresence",
						data: {
							status: instance.status,
							status_name: instance.status_name,
							status_type: instance.type,
						},
						id: process.pm_id,
						topic: "updatePresence",
					},
					(error) => {
						pm2.disconnect();
						if (error) console.error(`Failed to send message to ${processName}:`, error);
						else console.log(`Successfully sent presence update message to ${processName}`);
					},
				);
			});
		});

		return res.json({ success: true, bot: instance, saved: true });
	} catch (error) {
		console.error("Error updating bot presence:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.patch("/api/pm2/instances/:id", async (req, res) => {
	const clientId = req.params.id;

	if (clientId === process.env.MELPO_ID) return res.status(403).json({ error: "Cannot modify Melpo through the API" });

	console.log("Received restart for:", clientId);

	try {
		const existingBot = await Instances.findOne({ where: { client_id: clientId } });

		if (!existingBot) return res.status(404).json({ error: "Bot instance not found in database" });

		const ownerId = existingBot.owner_id;
		const pm2Command = `pm2 restart "bot_${ownerId}_${clientId}"`;

		exec(pm2Command, (error, stdout) => {
			if (error) {
				console.error(`Error restarting PM2 instance: ${error.message}`);
				return res.status(500).json({ error: "Failed to restart bot process" });
			}

			console.log(`PM2 bot restarted for ${clientId}:`, stdout);

			exec("pm2 save", (saveError) => {
				if (saveError) console.error(`Error saving PM2: ${saveError.message}`);
			});

			res.json({ success: true, message: "Bot instance restarted successfully" });
		});
	} catch (error) {
		console.error("Error restarting bot:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.delete("/api/pm2/instances/:id", async (req, res) => {
	const clientId = req.params.id;

	if (clientId === process.env.MELPO_ID) return res.status(403).json({ error: "Cannot delete Melpo through the API" });

	try {
		const existingBot = await Instances.findOne({ where: { client_id: clientId } });

		if (!existingBot) return res.status(404).json({ error: "Bot instance not found in database" });

		const ownerId = existingBot.owner_id;
		const pm2Command = `pm2 delete "bot_${ownerId}_${clientId}"`;

		const clearCommand = `node deploy-commands-global.js --clientId "${clientId}" --clear`;
		exec(clearCommand, (clearError, clearStdout) => {
			if (clearError) console.error(`Error clearing commands for ${clientId}: ${clearError.message}`);
			else console.log(`Commands cleared for ${clientId}:`, clearStdout);

			exec(pm2Command, (error, stdout) => {
				if (error) {
					console.error(`Error deleting PM2 instance: ${error.message}`);
					return res.status(500).json({ error: "Failed to delete bot instance" });
				}
				console.log(`PM2 bot deleted for ${clientId}:`, stdout);

				exec("pm2 save", (saveError) => {
					if (saveError) console.error(`Error saving PM2 config: ${saveError.message}`);
					else console.log("PM2 config saved after deletion");
				});

				res.json({
					success: true,
					message: "Bot instance stopped, commands deleted, and process removed",
				});
			});
		});
	} catch (error) {
		console.error("Error retrieving custom bot from db:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.listen(3169, () => console.log("Webhook server running on port 3169"));

const getBotTokenFromId = async (clientId) => {
	const instance = await Instances.findOne({ where: { client_id: clientId } });

	if (instance?.bot_token) return decryptData(instance.bot_token);

	const botName = Object.keys(process.env)
		.find((key) => process.env[key] === clientId)
		?.split("_")[0];

	if (!botName) throw new Error(`No bot name found for client ID: ${clientId}`);

	const botToken = process.env[`${botName}_TOKEN`];
	if (!botToken) throw new Error(`No bot token found for bot name: ${botName}`);

	return botToken;
};
