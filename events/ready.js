const { Events } = require("discord.js");
const { Instances } = require("../dbObjects");
const cron = require("node-cron");
const { resumeApplication } = require("../js/applicationHandler.js");
//const { status } = require("express/lib/response.js");
const { _status } = require("express/lib/response.js");

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		//only run if not a sharded bot
		if (!process.argv.includes("sharded")) {
			console.log("custom bot, writing assosiated guild ids to database...");
			const guildids = client.guilds.cache?.map((guild) => guild.id);
			console.log(`Found ${guildids.length} guilds.`);
			await Instances.upsert({ client_id: client.user.id, guilds: guildids });
		} else {
			client.cluster.triggerReady();
		}

		const setPresence = async () => {
			try {
				const [statusData] = await Instances.findOrCreate({ where: { client_id: client.user.id } });

				await client.user.setPresence({
					activities: [{ name: statusData.status_name, type: parseInt(statusData.type, 10) }],
					status: statusData.status,
				});
			} catch (error) {
				console.error("Failed to set presence:", error);
			}
		};

		await setPresence();

		//Resume applications
		setTimeout(async () => {
			if (!client.cluster || client.cluster.id === 0) {
				await resumeApplication(client).catch((error) =>
					console.error("Failed to resume verification sessions:", error),
				);
			}
		}, 60000); // Delay to make sure other clusters are ready too.

		cron.schedule("0 * * * *", setPresence);
		client.on("reconnecting", setPresence);
		client.on("resume", setPresence);

		process.on("message", (msg) => {
			if (msg.type === "updatePresence" || msg.topic === "updatePresence") {
				console.log("Received updatePresence via PM2");
				setPresence().catch(() => {});
			}
		});
	},
};
