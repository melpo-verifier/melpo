const { ShardingManager } = require("discord.js");
const cron = require("node-cron");
const {
  ServerConfig,
  InviteTracker,
  TempConfig,
  QuestionId,
  Verification,
  Status,
} = require("./dbObjects.js");
const { Op, Sequelize } = require("sequelize");
const fs = require("fs");
require("dotenv").config();

try {
  require("./api/webhookListener");
} catch (error) {
  console.error("Failed to initialize webhook listener:", error);
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

async function cleanupOldInvites() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await InviteTracker.destroy({
      where: {
        createdAt: { [Op.lt]: thirtyDaysAgo },
      },
    });
    console.log(`Cleaned up ${deleted} old invites`);
  } catch (error) {
    console.error("Failed to cleanup invites:", error);
  }
}

async function cleanupTempConfig() {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const deleted = await TempConfig.destroy({
      where: {
        createdAt: { [Op.lt]: fourteenDaysAgo },
      },
    });
    console.log(`Cleaned up ${deleted} temporary configurations`);
  } catch (error) {
    console.error("Failed to cleanup temp configs:", error);
  }
}

async function cleanupQuestionIds() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await QuestionId.destroy({
      where: {
        createdAt: { [Op.lt]: thirtyDaysAgo },
      },
    });
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

      if (
        !guildVerifs ||
        Object.keys(guildVerifs).length === 0 ||
        guildVerifs === "{}"
      ) {
        await verification.destroy();
        deletedCount++;
      }
    }

    console.log(`Cleaned up ${deletedCount} empty verification entries`);
  } catch (error) {
    console.error("Failed to cleanup empty verifications:", error);
  }
}

async function checkImageExists(imagePath) {
  try {
    await fs.promises.access(imagePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    console.error(`Error checking image: ${error}`);
    return false;
  }
}

async function cleanupImages(customisationField) {
  try {
    console.log(`Cleaning up images in ${customisationField}`);

    const serverConfigs = await ServerConfig.findAll({
      where: Sequelize.literal(`${customisationField}::jsonb ? 'image'`),
    });

    console.log(
      `Found ${serverConfigs.length} server configurations with images in ${customisationField}`,
    );

    for (const config of serverConfigs) {
      const fieldData = config[customisationField];
      if (fieldData && (fieldData.image || fieldData.image === null)) {
        //check if image from config exists, otherwise delete it
        const imageExists = await checkImageExists(fieldData.image);
        if (!imageExists) {
          console.log(
            `Image ${fieldData.image} does not exist, removing from config`,
          );

          const updatedFieldData = { ...fieldData };
          delete updatedFieldData.image;

          const updateResult = await ServerConfig.update(
            { [customisationField]: updatedFieldData },
            {
              where: { server_id: config.server_id },
              returning: true,
            },
          );

          if (updateResult[0] > 0) {
            console.log(`Successfully updated record ID ${config.server_id}`);
          } else {
            console.log(`No changes made to record ID ${config.server_id}`);
          }
        } else {
          console.log(`Image ${fieldData.image} exists`);
        }
      }
    }
    return serverConfigs;
  } catch (error) {
    console.error(`Error cleaning up images in ${customisationField}:`, error);
  }
}

const customisationFields = [
  "verificationwelcomemessage",
  "verifychannelembed",
  "verifymessage",
  "startmessage",
  "finishmessage",
];

Promise.all([
  cleanupOldInvites(),
  cleanupTempConfig(),
  cleanupQuestionIds(),
  cleanupEmptyVerifications(),
  ...(Array.isArray(customisationFields)
    ? customisationFields.map((field) => cleanupImages(field))
    : []),
])
  .then(() => {
    console.log("All initial cleanup tasks completed.");
  })
  .catch((error) => {
    console.error("Error in cleanup tasks:", error);
  });

// Run at 03:30 every day
cron.schedule("30 3 * * *", async () => {
  console.log("Cron triggered at:", new Date().toISOString());
  return Promise.all([
    cleanupOldInvites(),
    cleanupTempConfig(),
    cleanupQuestionIds(),
    cleanupEmptyVerifications(),
  ]);
});

const manager = new ShardingManager("./bot.js", {
  token: process.env.MELPO_TOKEN,
  // totalShards: 3, // uncomment this line to set more shards, which is useful for testing
  shardArgs: ["sharded", process.env.MELPO_TOKEN],
});

let shardsReady = 0;

manager.on("shardCreate", (shard) => {
  console.log(`Launched shard ${shard.id}`);

  shard.on("death", (process) => {
    console.log(
      `[${new Date().toISOString()}] Shard ${shard.id} died with code ${process.exitCode}`,
    );
  });

  shard.on("disconnect", () => {
    console.log(`[${new Date().toISOString()}] Shard ${shard.id} disconnected`);
  });

  shard.on("reconnecting", () => {
    console.log(`[${new Date().toISOString()}] Shard ${shard.id} reconnecting`);
  });

  shard.on("ready", async () => {
    shardsReady++;
    console.log(
      `Shard ${shard.id} ready (${shardsReady}/${manager.totalShards})`,
    );

    if (shardsReady === manager.totalShards) {
      setTimeout(initializeAPI, 5000);

      setTimeout(async () => {
        console.log("All shards are ready. Collecting guild IDs...");
        try {
          const allGuildIds = await manager.broadcastEval(async (client) =>
            client.guilds.cache.map((guild) => guild.id),
          );

          const uniqueGuildIds = [...new Set(allGuildIds.flat())];
          console.log(
            `Collected ${uniqueGuildIds.length} unique guild IDs from all shards.`,
          );

          await Status.upsert({
            client_id: process.env.MELPO_ID,
            guilds: uniqueGuildIds,
          });

          console.log("Guild IDs successfully saved to the database.");
        } catch (error) {
          console.error("Failed to collect guild IDs from shards:", error);
        }
      }, 5000);
    }
  });
});

manager.spawn();
global.shardManager = manager;

function initializeAPI() {
  if (process.platform === "win32") {
    console.log(
      "Running on Windows, assuming development environment, skipping API initialization",
    );
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
      let serverCount = 0;
      for (const shard of manager.shards.values()) {
        serverCount += await shard.eval("this.guilds.cache.size");
      }
      return serverCount;
    },
    userCount: async () => {
      let userCount = 0;
      for (const shard of manager.shards.values()) {
        const users = await shard.eval(`
                    [...this.guilds.cache.values()].reduce((acc, guild) => acc + guild.memberCount, 0)
                `);
        userCount += users;
      }
      return userCount;
    },
    voiceConnections: async () => {
      let voiceConnections = 0;
      return voiceConnections;
    },
    shardCount: manager.totalShards,
  });

  // Test counts before posting
  async function validateCounts() {
    try {
      let serverCount = 0;
      let userCount = 0;

      for (const shard of manager.shards.values()) {
        serverCount += await shard.eval("this.guilds.cache.size");
        const users = await shard.eval(`
                    [...this.guilds.cache.values()].reduce((acc, guild) => acc + guild.memberCount, 0)
                `);
        userCount += users;
      }

      const shardCount = manager.totalShards;

      console.log("=== Bot Stats Validation ===");
      console.log(`Servers: ${serverCount}`);
      console.log(`Users: ${userCount}`);
      console.log(`Shards: ${shardCount}`);

      if (serverCount === 0 || userCount === 0 || shardCount === 0) {
        console.error("Invalid counts detected, aborting API post");
        return false;
      }

      if (serverCount > 10000 || userCount > 10000000) {
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

  validateCounts().then((isValid) => {
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
  });
}
