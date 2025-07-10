const express = require("express");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  AttachmentBuilder,
  Client,
  GatewayIntentBits,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { ServerConfig, Status } = require("../dbObjects.js");
const { Op } = require("sequelize");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

app.post("/api/updateVerifyChannel/:guildId", async (req, res) => {
  console.log(req.params);
  const { guildId } = req.params;

  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId" });
  }

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: guildId },
  });
  if (!serverConfig) {
    return res.status(404).json({ error: "Server configuration not found" });
  }

  const verifyChannelId = serverConfig.verifychannel;
  const verifychannelembed = serverConfig.verifychannelembed;

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
          { guildId, verifyChannelId, verifychannelembed, melpoId },
        ) => {
          const {
            EmbedBuilder,
            ActionRowBuilder,
            ButtonBuilder,
            AttachmentBuilder,
          } = require("discord.js");
          const fs = require("fs");
          const path = require("path");

          const guild = client.guilds.cache.get(guildId);
          if (!guild) {
            return { success: false, error: "Guild not found" };
          }

          const verifyChannelObj = guild.channels.cache.get(verifyChannelId);
          if (!verifyChannelObj) {
            return { success: false, error: "Verify channel not found" };
          }

          try {
            const verificationMessages = await verifyChannelObj.messages.fetch({
              limit: 50,
            });
            const verificationMessage = verificationMessages.find(
              (m) =>
                m.author.id === melpoId &&
                m.embeds.length > 0 &&
                m.embeds[0].footer &&
                m.embeds[0].footer.text ===
                  "Thanks for verifying! - Developed by milo_dev",
            );

            const verificationembed = new EmbedBuilder()
              .setColor(verifychannelembed.color || "#3f7ff1")
              .setTitle(
                verifychannelembed.title &&
                  verifychannelembed.title.trim().length > 0
                  ? verifychannelembed.title
                  : null,
              )
              .setDescription(
                verifychannelembed.description &&
                  verifychannelembed.description.trim().length > 0
                  ? verifychannelembed.description
                  : null,
              )
              .setImage(
                verifychannelembed.image
                  ? `attachment://verifychannelimage.${verifychannelembed.image.split(".").pop()}`
                  : null,
              )
              .setFooter({
                text: "Thanks for verifying! - Developed by milo_dev",
              });

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("verifybutton")
                .setLabel("Verify")
                .setStyle("Success"),
            );

            let attachment;
            if (
              verifychannelembed.image &&
              fs.existsSync(verifychannelembed.image)
            ) {
              try {
                attachment = new AttachmentBuilder(
                  verifychannelembed.image,
                ).setName(
                  `verifychannelimage.${path.extname(verifychannelembed.image).slice(1)}`,
                );
              } catch (error) {
                console.error("Error creating attachment:", error);
              }
            }

            if (!verificationMessage) {
              await verifyChannelObj.send({
                embeds: [verificationembed],
                components: [row],
                files: attachment ? [attachment] : [],
              });
              return { success: true, action: "created" };
            } else {
              const verifymessage = verificationMessage.embeds[0];

              const needsUpdate =
                (verifymessage.title || null) !==
                  (verificationembed.data.title || null) ||
                (verifymessage.description || null) !==
                  (verificationembed.data.description || null) ||
                verifymessage.image?.url !==
                  verificationembed.data.image?.url ||
                verifymessage.color !== verificationembed.data.color;

              if (needsUpdate) {
                await verificationMessage.edit({
                  embeds: [verificationembed],
                  files: attachment ? [attachment] : [],
                });
                return { success: true, action: "updated" };
              } else {
                return { success: true, action: "no_changes" };
              }
            }
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        {
          guildId,
          verifyChannelId,
          verifychannelembed,
          melpoId: process.env.MELPO_ID,
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

              const verificationMessages =
                await verifyChannelObj.messages.fetch({ limit: 50 });
              const verificationMessage = verificationMessages.find(
                (m) =>
                  m.author.id === client.user.id &&
                  m.embeds.length > 0 &&
                  m.embeds[0].footer &&
                  m.embeds[0].footer.text ===
                    "Thanks for verifying! - Developed by milo_dev",
              );

              const verificationembed = new EmbedBuilder()
                .setColor(verifychannelembed.color || "#3f7ff1")
                .setTitle(verifychannelembed.title ?? null)
                .setDescription(verifychannelembed.description ?? null)
                .setImage(
                  verifychannelembed.image
                    ? `attachment://verifychannelimage.${verifychannelembed.image.split(".").pop()}`
                    : null,
                )
                .setFooter({
                  text: "Thanks for verifying! - Developed by milo_dev",
                });

              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("verifybutton")
                  .setLabel("Verify")
                  .setStyle("Success"),
              );

              let attachment;
              if (
                verifychannelembed.image &&
                fs.existsSync(verifychannelembed.image)
              ) {
                try {
                  attachment = new AttachmentBuilder(
                    verifychannelembed.image,
                  ).setName(
                    `verifychannelimage.${path.extname(verifychannelembed.image).slice(1)}`,
                  );
                } catch (error) {
                  console.error("Error creating attachment:", error);
                }
              }

              if (!verificationMessage) {
                await verifyChannelObj.send({
                  embeds: [verificationembed],
                  components: [row],
                  files: attachment ? [attachment] : [],
                });
              } else {
                const verifymessage = verificationMessage.embeds[0];

                const needsUpdate =
                  (verifymessage.title || null) !==
                    (verificationembed.data.title || null) ||
                  (verifymessage.description || null) !==
                    (verificationembed.data.description || null) ||
                  verifymessage.image?.url !==
                    verificationembed.data.image?.url ||
                  verifymessage.color !== verificationembed.data.color;

                if (needsUpdate) {
                  await verificationMessage.edit({
                    embeds: [verificationembed],
                    files: attachment ? [attachment] : [],
                  });
                }
              }

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
