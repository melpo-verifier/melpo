const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  IntentsBitField,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  Partials,
  AuditLogEvent,
  PermissionsBitField,
  Options,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} = require("discord.js");
require("dotenv").config();
const { updateBotJoins, updateBotLeaves } = require("./js/tempconfigfuncs.js");
const { ServerConfig, Verification, Status } = require("./dbObjects.js");
const InviteManager = require("./js/dinvite.js");
const ErrorHandler = require("./js/ErrorHandling.js");
const RateLimitError = require("./js/RateLimitHandling.js");
const CommandLoader = require("./js/CommandLoader.js");
const MemoryManager = require("./js/MemoryManager.js");
const artleaderboardweek = require("./js/artleaderboardweek.js");

if (process.argv.length > 3 && process.argv[2] === "sharded") {
  console.log("sharded arrived!");
  const token = process.argv[3];
  createBot(token);
}

async function createBot(token) {
  const myIntents = new IntentsBitField();
  myIntents.add(3276543);
  const client = new Client({
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.User,
    ],
    intents: myIntents,
    allowedMentions: { parse: ["users", "roles"], repliedUser: true },
    sweepers: {
      messages: {
        interval: 1800, // 30 minutes instead of 5
        lifetime: 3600, // 1 hour instead of 30 minutes
      },
      users: {
        interval: 1800, // 30 minutes instead of 10
        filter: () => (user) => user.id !== client.user.id && !user.bot,
      },
      // Removed presence sweeper - not needed for verification bot
    },
    makeCache: Options.cacheWithLimits({
      MessageManager: {
        maxSize: 200,
        keepOverLimit: (message) => {
          // Keep verification messages and recent messages
          return (
            message.author?.id === client.user.id ||
            Date.now() - message.createdTimestamp < 1800000
          ); // 30 minutes
        },
      },
      UserManager: {
        maxSize: 1000,
        keepOverLimit: (user) => user.id === client.user.id,
      },
      RoleManager: Infinity,
    }),
    rest: {
      retries: 3,
      timeout: 15000,
      sweepInterval: 30,
      globalRequestsPerSecond: 50,
    },
  });

  new InviteManager(client);

  const memoryManager = new MemoryManager(client);
  memoryManager.start();

  global.memoryManager = memoryManager;

  client.rest.on("rateLimited", async (rateLimitInfo) => {
    console.log("rate limited!");
    await ErrorHandler.handle(client, new RateLimitError(rateLimitInfo));
  });

  process.on("unhandledRejection", async (error) => {
    await ErrorHandler.handle(client, error);
  });

  process.on("uncaughtException", async (error) => {
    await ErrorHandler.handle(client, error);
  });

  client.on("error", async (error) => {
    await ErrorHandler.handle(client, error);
  });

  console.log("Loading commands...");

  const loader = new CommandLoader(client);
  loader.loadAll();

  console.log("Commands loaded.");
  console.log("Loading events...");

  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

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
    await updateBotJoins();

    try {
      const status = await Status.findOne({
        where: { client_id: client.user.id },
      });
      const guilds = status?.guilds || [];
      if (!guilds.includes(guild.id)) {
        guilds.push(guild.id);
        await Status.update(
          { guilds },
          { where: { client_id: client.user.id } },
        );
        console.log(`Added guild ${guild.id} to the database.`);
      }
    } catch (error) {
      console.error("Failed to update guild list on guildCreate:", error);
    }
  });

  client.on("guildDelete", async (guild) => {
    if (!guild.name || !guild.memberCount) {
      return; //console.log('Received partial guild data:', guild);
    }
    await updateBotLeaves();

    try {
      const status = await Status.findOne({
        where: { client_id: client.user.id },
      });
      const guilds = status?.guilds || [];
      const updatedGuilds = guilds.filter((id) => id !== guild.id);
      await Status.update(
        { guilds: updatedGuilds },
        { where: { client_id: client.user.id } },
      );
      console.log(`Removed guild ${guild.id} from the database.`);
    } catch (error) {
      console.error("Failed to update guild list on guildDelete:", error);
    }
  });

  client.on("guildMemberAdd", async (member) => {
    if (!member || member.user.bot) return;

    let serverConfig;
    try {
      serverConfig = await ServerConfig.findOne({
        where: { server_id: member.guild.id },
        attributes: ["autorole"],
      });
    } catch (error) {
      console.error("Failed to fetch server config:", error);
      return;
    }

    if (
      !serverConfig?.autorole ||
      !Array.isArray(serverConfig.autorole) ||
      !serverConfig.autorole.length
    )
      return;

    try {
      let botMember = member.guild.members.cache.get(client.user.id);
      if (!botMember) {
        botMember = await member.guild.members.fetch(client.user.id);
      }

      if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles))
        return;

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
            // Unknown Member
            throw roleError;
          }
          console.error(
            `Failed to add role ${roleId} to ${member.id}: ${roleError.message}`,
          );
        }
      });

      await Promise.allSettled(rolePromises);
    } catch (error) {
      if (error.code === 10007) {
        console.log(`Member ${member.id} left before roles could be assigned`);
      } else {
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

  function createLeftV2Component(originalMessage, member) {
    const leftContainer = new ContainerBuilder({
      accent_color: 0x808080,
    });

    const originalContainer = originalMessage.components[0];

    if (originalContainer?.components) {
      for (const component of originalContainer.components) {
        if (component.type === 9) {
          // Section component
          let content = component.components[0].content;

          content = content.replace(/<@&\d+>/g, "").trim();

          leftContainer.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder({
                  content: content + `\n**Status:** \`Left Server\``,
                }),
              )
              .setThumbnailAccessory(
                new ThumbnailBuilder({
                  media: { url: component.accessory.media.url },
                }),
              ),
          );
        } else if (component.type === 10) {
          // Text display component
          leftContainer.addTextDisplayComponents(
            new TextDisplayBuilder({
              content: component.content,
            }),
          );
        } else if (component.type === 14) {
          // Separator component
          leftContainer.addSeparatorComponents(
            new SeparatorBuilder({
              spacing: component.spacing || SeparatorSpacingSize.Small,
            }),
          );
        } else if (component.type === 12) {
          // Media gallery component
          if (component.items?.length > 0) {
            const mappedurls = component.items?.map((item) => ({
              media: {
                url: item.media.url,
              },
            }));
            leftContainer.addMediaGalleryComponents(
              new MediaGalleryBuilder({
                items: mappedurls,
              }),
            );
          }
        }
      }
    }

    leftContainer.addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `-# User left server (${member.id})`,
      }),
    );

    return leftContainer;
  }

  const disverify = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify")
      .setLabel("Verify")
      .setStyle("Success")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("deny")
      .setLabel("Deny")
      .setStyle("Danger")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("reasondeny")
      .setLabel("Deny with reason")
      .setStyle("Danger")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("question")
      .setLabel("Question")
      .setStyle("Primary")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("action")
      .setLabel("Kick")
      .setStyle("Secondary")
      .setDisabled(true),
  );

  client.on("guildMemberRemove", async (member) => {
    if (!member?.guild?.id || !member.id) return;

    let serverConfig, verification;

    try {
      [serverConfig, verification] = await Promise.all([
        ServerConfig.findOne({
          where: { server_id: member.guild.id },
          attributes: ["reviewchannel", "verifylogs"],
        }),
        Verification.findOne({
          where: { userId: member.id },
          attributes: ["userId", "guildVerifications"],
        }),
      ]);
    } catch (error) {
      console.error("Failed to fetch configs:", error);
      return;
    }

    if (!serverConfig || !verification) return;

    const messageIds = verification?.guildVerifications?.[member.guild.id];
    if (!messageIds || !Array.isArray(messageIds) || !messageIds.length) return;

    let wasKicked = false;
    const botMember = member.guild.members.cache.get(client.user.id);
    if (botMember?.permissions.has("ViewAuditLog")) {
      try {
        const auditLogs = await member.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberKick,
          limit: 1,
        });

        const kickLog = auditLogs.entries.first();
        wasKicked =
          kickLog?.target?.id === member.id &&
          kickLog.createdTimestamp > Date.now() - 3000;

        if (wasKicked) {
          console.log(
            `${member.user?.tag || member.id} was kicked, skipping message edits`,
          );
          return;
        }
      } catch {
        // Ignore audit log errors
      }
    }

    if (
      serverConfig.verifylogs &&
      messageIds &&
      serverConfig.reviewchannel !== serverConfig.verifylogs
    ) {
      const reviewChannel = member.guild.channels.cache.get(
        serverConfig.reviewchannel,
      );
      const logChannel = member.guild.channels.cache.get(
        serverConfig.verifylogs,
      );

      if (logChannel && reviewChannel && messageIds) {
        // Get all messages in chronological order
        const messages = [];
        for (const messageId of messageIds) {
          try {
            const message = await reviewChannel.messages.fetch(messageId);
            if (message) messages.push(message);
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (error) {
            if (error.code === 10008) {
              console.log(`Message ${messageId} not found - skipping`);
              continue;
            }
            throw error;
          }
        }

        // Sort by timestamp
        messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const message of messages) {
          await new Promise((resolve) => setTimeout(resolve, 600));

          try {
            if (message.flags.has(MessageFlags.IsComponentsV2)) {
              const leftContainer = createLeftV2Component(message, member);

              let threadEmbed;

              if (message.thread) {
                threadEmbed = new EmbedBuilder()
                  .setTitle(`Thread Summary`)
                  .setColor("#808080");

                try {
                  const threadMessages = await message.thread.messages.fetch();

                  if (threadMessages.size > 1) {
                    const messagesArray = Array.from(threadMessages.values())
                      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                      .slice(1);

                    const formattedMessages = messagesArray?.map((msg) => {
                      let content;

                      if (msg.flags.has(MessageFlags.IsComponentsV2)) {
                        content =
                          msg.components?.[0]?.components?.[0]?.content ||
                          "No content";
                      } else {
                        content = msg.content || "No content";
                      }

                      if (msg.author.id === client.user.id) {
                        content = content?.replace(
                          /### Question answered by[^\n]*\n?/g,
                          "\n",
                        );
                      }

                      return `\`${msg.author.username}:\` ${content}`;
                    });

                    const finalContent = formattedMessages
                      .join("\n")
                      .slice(0, 4096);
                    threadEmbed.setDescription(
                      finalContent || "No messages in thread",
                    );
                  } else {
                    threadEmbed.setDescription(
                      "No additional messages in thread",
                    );
                  }
                } catch (error) {
                  console.error("Error fetching thread messages:", error);
                  threadEmbed.setDescription("Error loading thread messages");
                }
              }

              const sendmessage = await logChannel.send({
                flags: [MessageFlags.IsComponentsV2],
                components: [leftContainer],
              });

              const threadchannel = await sendmessage.startThread({
                name: `${member.user?.username || member.id}'s log`,
              });

              if (threadEmbed) {
                await threadchannel.send({ embeds: [threadEmbed] });
              }
              await threadchannel.setArchived(true);

              if (message.thread) {
                await message.thread.delete().catch(console.error);
              }

              await message.delete().catch(console.error);
            } else {
              const originalembed = message.embeds[0];

              const Embed = new EmbedBuilder(originalembed)
                .setColor("#808080")
                .setTitle(originalembed.title + " (LEFT)")
                .setFooter({
                  text: `Left | ${originalembed?.footer?.text || member.id}`,
                });

              await logChannel.send({
                content: `<@${member.id}>`,
                embeds: [Embed],
              });
              await message.delete().catch(console.error);
            }
          } catch (error) {
            console.error(`Error processing log message:`, error);
          }
        }
      }
    } else {
      const reviewChannel = member.guild.channels.cache.get(
        serverConfig.reviewchannel,
      );
      if (!reviewChannel) return;

      if (messageIds && messageIds.length > 0) {
        for (const messageId of messageIds) {
          try {
            const message = await reviewChannel.messages.fetch(messageId);
            await new Promise((resolve) => setTimeout(resolve, 1000));

            if (
              message &&
              message.author.id === client.user.id &&
              !message.embeds[0]?.footer?.text?.includes("Left")
            ) {
              if (message.flags.has(MessageFlags.IsComponentsV2)) {
                const leftContainer = createLeftV2Component(message, member);
                await message.edit({
                  flags: [MessageFlags.IsComponentsV2],
                  components: [leftContainer, disverify],
                });

                if (message.thread) {
                  await message.thread.setArchived(true);
                }
              } else if (!message?.embeds[0]?.footer?.text?.includes("Left")) {
                const originalembed = message.embeds[0];

                const Embed = new EmbedBuilder(originalembed)
                  .setColor("#808080")
                  .setTitle(originalembed.title + " (LEFT)")
                  .setFooter({
                    text: `Left | ${originalembed?.footer?.text || member.id}`,
                  });

                await message.edit({
                  embeds: [Embed],
                  components: [disverify],
                });
              }
            }
          } catch (error) {
            console.error(
              `Failed to process message with ID ${messageId}: ${error}`,
            );
          }
        }
      }
    }

    // Clean up verification data
    try {
      if (messageIds && messageIds.length > 0) {
        delete verification.guildVerifications[member.guild.id];
        verification.changed("guildVerifications", true);
        await verification.save();
      }
    } catch (error) {
      console.error("Failed to update verification:", error);
    }
  });

  artleaderboardweek(client);

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
      const delay = Math.min(Math.pow(2, attempt) * 1000, 60000);
      console.log(`Login failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return client;
}

module.exports = { createBot };
