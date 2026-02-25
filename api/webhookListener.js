const express = require("express");
const {
  Client,
  GatewayIntentBits,
} = require("discord.js");
const { Status } = require("../dbObjects.js");
const { Op } = require("sequelize");
const cors = require("cors");

const {
  getApplicationById
} = require("../js/tempconfigfuncs.js");
const { resolveImage } = require("../js/imageUtils.js");
const { updateVerifyMessage } = require("../js/verifyChannelUtils.js");


const app = express();
app.use(express.json());
app.use(cors());

app.post("/api/updateVerifyChannel/:guildId/:appId", async (req, res) => {
  console.log(req.params);
  const { guildId, appId } = req.params;

  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId" });
  }

  if (!appId) {
    return res.status(400).json({ error: "Missing appId" });
  }

  const { application, error } = await getApplicationById(appId, guildId);

  if (!application || error) {
    return res.status(404).json({ error: `Application not found: ${error || "Unknown error"}` });
  }

  const verifyChannelId = application.verifychannel;
  const appName = application.name;

  const embedColor = application.verifychannelembed?.color || "#3f7ff1";
  const embedTitle = application.verifychannelembed?.title ?? "Verification";
  const embedDescription = application.verifychannelembed?.description ?? "Please verify yourself by clicking the button below.";
  const embedImage = application.verifychannelembed?.image;
  const embedImageAsset = resolveImage(embedImage);

  try {
    const statuses = await Status.findAll({
      where: { guilds: { [Op.contains]: [guildId] } },
    });

    if (!statuses || statuses.length === 0) {
      console.error(`No status entries found for guild ${guildId}`);
      return res.status(404).json({ error: "No status entries found" });
    }

    const clientIds = statuses.map((status) => status.client_id);

    let clientId;

    if (clientIds.length === 1 && clientIds[0] === process.env.MELPO_ID) {
      console.log("Using default bot (Melpo) for server");
      clientId = process.env.MELPO_ID;

      let foundShard = null;

      for (const [shardId, shard] of global.shardManager.shards) {
        try {
          const hasGuild = await shard.eval(
            `this.guilds.cache.has('${guildId}')`,
          );
          console.log(`Shard ${shardId}: Guild exists = ${hasGuild}`);

          if (hasGuild) {
            foundShard = shard;
            console.log(`Found guild ${guildId} on shard ${shardId}`);
            break;
          }
        } catch (error) {
          console.error(`Error checking shard ${shardId}:`, error);
          continue;
        }
      }

      if (!foundShard) {
        return res.status(404).json({ error: "Guild not found on any shard" });
      }

      const result = await foundShard.eval(
        async (
          client,
          { guildId, verifyChannelId, embedColor, embedTitle, embedDescription, embedImageAsset, appName, appId, melpoId, path },
        ) => {
          const { updateVerifyMessage } = require(path);

          const guild = client.guilds.cache.get(guildId);
          if (!guild) {
            return { success: false, error: "Guild not found" };
          }

          const verifyChannelObj = guild.channels.cache.get(verifyChannelId);
          if (!verifyChannelObj) {
            return { success: false, error: "Verify channel not found" };
          }

          console.log(`Found verify channel ${verifyChannelObj.name} (${verifyChannelObj.id}) in guild ${guild.name}`);

          try {
            const result = await updateVerifyMessage({
              verifyChannelObj,
              botId: melpoId,
              embedConfig: {
                color: embedColor,
                title: embedTitle,
                description: embedDescription,
                imageUrl: embedImageAsset.embedUrl,
                footer: appName,
              },
              button: {
                customId: `verifybutton_${appId}`,
                label: "Apply",
              },
            });

            return { success: true, action: result.action };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        {
          guildId,
          verifyChannelId,
          embedColor,
          embedTitle,
          embedDescription,
          embedImageAsset,
          appName,
          appId,
          melpoId: process.env.MELPO_ID,
          path: require('path').join(process.cwd(), "/js/verifyChannelUtils.js")
        },
      );

      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      console.log(`Verification message ${result.action} successfully`);
    } else {
      const customBotId = clientIds.find((id) => id !== process.env.MELPO_ID);

      if (customBotId) {
        console.log(
          `Using custom bot for guild ${guildId}, client ID: ${customBotId}`,
        );
        clientId = customBotId;

        const botToken = getBotTokenFromId(clientId);
        if (!botToken) {
          return res
            .status(404)
            .json({ error: "Bot token not found for client id" });
        }

        // Create a temporary Discord.js client
        const client = new Client({
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
        });

        return new Promise((resolve, reject) => {
          client.once("ready", async () => {
            try {
              console.log(`Logged in as ${client.user.tag}`);

              const guild = client.guilds.cache.get(guildId);
              if (!guild) {
                client.destroy();
                return resolve(
                  res.status(404).json({ error: "Guild not found" }),
                );
              }

              const verifyChannelObj =
                guild.channels.cache.get(verifyChannelId);
              if (!verifyChannelObj) {
                client.destroy();
                return resolve(
                  res.status(404).json({ error: "Verify channel not found" }),
                );
              }

              await updateVerifyMessage({
                verifyChannelObj,
                botId: client.user.id,
                embedConfig: {
                  color: embedColor,
                  title: embedTitle,
                  description: embedDescription,
                  imageUrl: embedImageAsset.embedUrl,
                  footer: appName,
                },
                button: {
                  customId: `verifybutton_${appId}`,
                  label: "Apply",
                },
              });

              client.destroy();
              console.log("Custom bot logged off");
              resolve(
                res
                  .status(200)
                  .json({ message: "Verify channel updated successfully" }),
              );
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
        return res
          .status(404)
          .json({ error: "Melpo nor a custom bot found for this guild" });
      }
    }

    res.status(200).json({ message: "Verify channel updated successfully" });
  } catch (error) {
    console.error("Error updating verify channel:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(3169, () => {
  console.log("Webhook server running on port 3169");
});

const getBotTokenFromId = (clientId) => {
  const botName = Object.keys(process.env)
    .find((key) => process.env[key] === clientId)
    ?.split("_")[0];

  if (!botName) {
    throw new Error(`No bot name found for client ID: ${clientId}`);
  }

  const botToken = process.env[`${botName}_TOKEN`];
  if (!botToken) {
    throw new Error(`No bot token found for bot name: ${botName}`);
  }

  return botToken;
};
