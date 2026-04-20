const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  IntentsBitField,
  Partials,
  AuditLogEvent,
  PermissionsBitField,
  Options,
} = require("discord.js");
require("dotenv").config();
const { updateBotJoins, updateBotLeaves } = require("./js/tempconfigfuncs.js");
const { processLeaveMessages, cleanupVerificationData, getMessageIds } = require("./js/verificationHandler.js");
const { ServerConfig, Verification, Instances, Application, Blacklist } = require("./dbObjects.js");
const InviteManager = require("./js/dinvite.js");
const ErrorHandler = require("./js/ErrorHandling.js");
const RateLimitError = require("./js/RateLimitHandling.js");
const CommandLoader = require("./js/CommandLoader.js");
// const MemoryManager = require("./js/MemoryManager.js");
const artleaderboardweek = require("./js/artleaderboardweek.js");

const { ClusterClient, getInfo } = require('discord-hybrid-sharding');

if (process.argv.length > 3 && process.argv[2] === "sharded") {
  console.log("sharded arrived!");
  const token = process.argv[3];
  createBot(token);
}

async function createBot(token) {
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
  const clientOptions = {
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
        interval: 3600,
        lifetime: 7200,
      },
    },
    makeCache: Options.cacheWithLimits({
      MessageManager: {
        maxSize: 50,
        keepOverLimit: (message) => message.author?.id === client.user.id && message.createdTimestamp > Date.now() - 60 * 60 * 24 * 7,
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
  }

  new InviteManager(client);

  // const memoryManager = new MemoryManager(client);
  // memoryManager.start();

  // global.memoryManager = memoryManager;

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
    try {
      const serverEntry = await Blacklist.findOne({
        where: { server_id: guild.id, blacklisted: true },
      });

      let ownerId = guild.ownerId;
      if (!ownerId) {
        try {
          const owner = await guild.fetchOwner();
          ownerId = owner?.id;
        } catch (fetchOwnerError) {
          console.error(`Failed to fetch owner for guild ${guild.id}:`, fetchOwnerError);
        }
      }

      const ownerEntry = ownerId
        ? await Blacklist.findOne({
            where: { user_id: ownerId, blacklisted: true },
          })
        : null;

      if (serverEntry || ownerEntry) {
        console.log(
          `Leaving blacklisted guild ${guild.id} (${serverEntry ? "server" : "owner"}).`,
        );
        return await guild.leave();
      }
    } catch (error) {
      console.error("Blacklist check failed on guildCreate:", error);
    }

    await updateBotJoins();

    try {
      const status = await Instances.findOne({
        where: { client_id: client.user.id },
      });
      const guilds = status?.guilds || [];
      if (!guilds.includes(guild.id)) {
        guilds.push(guild.id);
        await Instances.update(
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
      const status = await Instances.findOne({
        where: { client_id: client.user.id },
      });
      const guilds = status?.guilds || [];
      const updatedGuilds = guilds.filter((id) => id !== guild.id);
      await Instances.update(
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

  client.on("guildMemberRemove", async (member) => {
    if (!member?.guild?.id || !member.id) return;

    let applications, verification;

    try {
      [applications, verification] = await Promise.all([
        Application.findAll({
          where: { server_id: member.guild.id },
          attributes: ["id", "reviewchannel", "verifylogs"],
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

    if (!applications?.length || !verification) return;

    const guildData = verification?.guildVerifications?.[member.guild.id];
    if (!guildData) return;

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

    for (const app of applications) {
      const appMessageIds = getMessageIds(verification, member.guild.id, app.id);
      if (!appMessageIds || appMessageIds.length === 0) continue;

      await processLeaveMessages({
        client,
        member,
        application: app,
        messageIds: appMessageIds,
      });
    }

    try {
      await cleanupVerificationData(verification, member.guild.id);
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
