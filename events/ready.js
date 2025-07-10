const { Events } = require("discord.js");
const { Status } = require("../dbObjects");
const cron = require("node-cron");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);

    const setPresence = async () => {
      try {
        const [statusData] = await Status.findOrCreate({
          where: { client_id: client.user.id },
        });

        await client.user.setPresence({
          activities: [
            {
              name: statusData.name,
              type: parseInt(statusData.type),
            },
          ],
          status: statusData.status,
        });
      } catch (error) {
        console.error("Failed to set presence:", error);
      }
    };

    //only run if not a sharded bot
    if (!process.argv.includes("sharded")) {
      console.log("custom bot, writing assosiated guild ids to database...");
      const guildids = client.guilds.cache?.map((guild) => guild.id);
      console.log(`Found ${guildids.length} guilds.`);
      await Status.upsert({
        client_id: client.user.id,
        guilds: guildids,
      });
    }

    await setPresence();

    cron.schedule("0 * * * *", setPresence);
    client.on("reconnecting", setPresence);
    client.on("resume", setPresence);
  },
};
