const { EmbedBuilder, MessageFlags } = require("discord.js");
const RateLimitError = require("./RateLimitHandling.js");

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

  static generateErrorId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 4);
    return `ERR-${timestamp.slice(-4)}${random}`.toUpperCase();
  }

  static async handle(client, error, interaction = null, context = null) {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();
    const errorType = this.classifyError(error);

    this.updateErrorStats(errorType);

    console.error(`[${timestamp}] Error ${errorId} (${errorType}):`, {
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
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

    if (interaction && !interaction.replied && !interaction.deferred) {
      try {
        await this.handleUserNotification(
          interaction,
          errorType,
          errorId,
          error,
        );
      } catch (userError) {
        console.error("Failed to notify user about error:", userError.message);
      }
    }

    if (errorType !== this.ERROR_TYPES.PERMISSION) {
      try {
        await this.handleDevNotification(
          client,
          error,
          errorType,
          errorId,
          interaction,
        );
      } catch (devError) {
        console.error(
          "Failed to notify developer about error:",
          devError.message,
        );
      }
    }

    if (errorType === this.ERROR_TYPES.MEMORY) {
      await this.handleMemoryError(error, client);
    }

    if (Date.now() - this.lastCleanup > 3600000) {
      this.cleanupErrorStats();
    }

    return errorId;
  }

  static classifyError(error) {
    if (error instanceof RateLimitError || error.code === "RATE_LIMITED") {
      return this.ERROR_TYPES.RATE_LIMIT;
    }

    if (
      error.code === 50013 ||
      error.message?.includes("permissions") ||
      error.message?.includes("Missing Access")
    ) {
      return this.ERROR_TYPES.PERMISSION;
    }

    if (
      error.name === "SequelizeError" ||
      error.message?.includes("database") ||
      (typeof error.code === "string" && error.code.startsWith("23"))
    ) {
      return this.ERROR_TYPES.DATABASE;
    }

    if (
      error.message?.includes("heap") ||
      error.message?.includes("memory") ||
      error.code === "ERR_MEMORY_ALLOCATION_FAILED"
    ) {
      return this.ERROR_TYPES.MEMORY;
    }

    if (error.code === 10008 || error.code === 10003 || error.code === 50001) {
      return this.ERROR_TYPES.API;
    }

    if (
      error.message?.includes("validation") ||
      error.message?.includes("invalid")
    ) {
      return this.ERROR_TYPES.VALIDATION;
    }

    return this.ERROR_TYPES.UNKNOWN;
  }

  static updateErrorStats(errorType) {
    const current = this.errorStats.get(errorType) || { count: 0, lastSeen: 0 };
    current.count++;
    current.lastSeen = Date.now();
    this.errorStats.set(errorType, current);
  }

  static async handleUserNotification(interaction, errorType, errorId, error) {
    const messages = {
      [this.ERROR_TYPES.PERMISSION]:
        "I don't have the required permissions to do that.",
      [this.ERROR_TYPES.DATABASE]: "There was an issue with the database.",
      [this.ERROR_TYPES.API]: "Discord's API is having issues.",
      [this.ERROR_TYPES.VALIDATION]: "The provided input was invalid.",
      [this.ERROR_TYPES.UNKNOWN]: "An unexpected error occurred.",
    };

    let embed;
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

    if (interaction.replied) {
      await interaction.followUp({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } else if (interaction.deferred) {
      await interaction.followUp({ embeds: [embed] });
    } else {
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  static async handleDevNotification(
    client,
    error,
    errorType,
    errorId,
    interaction,
  ) {
    if (error.code === 50001 || error.code === 50013) return;

    const interactionInfo = interaction
      ? {
          name: "Interaction Info",
          value: `Type: ${interaction.type}\nCommand: ${interaction.commandName || "N/A"}\nChannel: ${interaction.channel?.name || "N/A"}\nUser: ${interaction.user?.tag || "N/A"}\nServer: ${interaction.guild?.name || "N/A"}\nServer ID: ${interaction.guild?.id || "N/A"}`,
        }
      : {
          name: "Interaction",
          value: "No interaction context",
        };

    const devEmbed = new EmbedBuilder()
      .setColor("Red")
      .setTitle(`🐛 Error Report (ID: ${errorId})`)
      .addFields(
        { name: "Error ID", value: errorId },
        interactionInfo,
        { name: "Type", value: errorType },
        { name: "Error Name", value: error.name || "N/A" },
        { name: "Message", value: error.message || "N/A" },
        { name: "Stack", value: error.stack?.slice(0, 1024) || "N/A" },
      )
      .setTimestamp();

    const devUser = await client.users.fetch("808738877945675786");
    await devUser.send({ embeds: [devEmbed] });
  }

  static async handleMemoryError(error, client) {
    const now = Date.now();
    if (this.lastMemoryCleanup && now - this.lastMemoryCleanup < 60000) {
      console.warn("Skipping memory cleanup: already performed recently.");
      return;
    }

    this.lastMemoryCleanup = now;
    console.error(`Critical memory error detected:`, error.message);

    if (client) {
      console.log("Performing emergency memory cleanup...");

      client.guilds.cache.clear();
      client.users.cache.clear();
      client.channels.cache.clear();

      if (client.commands) client.commands.clear();
      if (client.buttonCommands) client.buttonCommands.clear();
      if (client.menus) client.menus.clear();
      if (client.modals) client.modals.clear();

      this.errorStats.clear();

      if (global.gc) {
        for (let i = 0; i < 3; i++) {
          global.gc();
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      try {
        const owner = await client.users.fetch("808738877945675786");
        await owner.send(
          `🚨 **CRITICAL MEMORY ERROR** 🚨\nBot had to perform emergency cleanup. Error: ${error.message}`,
        );
      } catch (err) {
        console.error(
          "Failed to notify owner about critical memory error:",
          err.message,
        );
      }
    }
  }

  static cleanupErrorStats() {
    const oneHourAgo = Date.now() - 3600000;

    for (const [type, stats] of this.errorStats.entries()) {
      if (stats.lastSeen < oneHourAgo) {
        this.errorStats.delete(type);
      }
    }

    this.lastCleanup = Date.now();
    console.log("Error stats cleaned up");
  }

  static getErrorStats() {
    const stats = {};
    for (const [type, data] of this.errorStats.entries()) {
      stats[type] = {
        count: data.count,
        lastSeen: new Date(data.lastSeen).toISOString(),
      };
    }
    return stats;
  }
}

module.exports = ErrorHandler;
