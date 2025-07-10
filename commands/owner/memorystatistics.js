const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { Statistics } = require("../../dbObjects.js");
const os = require("os");
const { Op } = require("sequelize");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("performancestatistics")
    .setDescription("Get comprehensive performance statistics of the bot")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Type of statistics to display")
        .addChoices(
          { name: "System Performance", value: "system" },
          { name: "Bot Usage Stats", value: "usage" },
          { name: "Database Performance", value: "database" },
          { name: "Cache Statistics", value: "cache" },
          { name: "All Statistics", value: "all" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("timeframe")
        .setDescription("Time period for usage statistics")
        .addChoices(
          { name: "Today", value: "today" },
          { name: "Last 7 days", value: "week" },
          { name: "Last 30 days", value: "month" },
        ),
    ),
  async execute({ interaction, client }) {
    const authorizedUsers = ["808738877945675786"];
    if (!authorizedUsers.includes(interaction.user.id)) {
      return await interaction.reply({
        content: "You are not authorized to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString("type") || "all";
    const timeframe = interaction.options.getString("timeframe") || "today";

    try {
      const embeds = [];

      if (type === "system" || type === "all") {
        embeds.push(await getSystemPerformanceEmbed(client));
      }

      if (type === "usage" || type === "all") {
        embeds.push(await getUsageStatisticsEmbed(timeframe));
      }

      if (type === "cache" || type === "all") {
        embeds.push(await getCacheStatisticsEmbed(client));
      }

      await interaction.editReply({ embeds });
    } catch (error) {
      console.error("Error fetching performance statistics:", error);
      await interaction.editReply({
        content: "An error occurred while fetching performance statistics.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

async function getSystemPerformanceEmbed(client) {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const uptime = process.uptime();
  const systemUptime = os.uptime();

  // Calculate CPU percentage
  const cpuPercent = (
    ((cpuUsage.user + cpuUsage.system) / 1000000 / uptime) *
    100
  ).toFixed(2);

  const embed = new EmbedBuilder()
    .setTitle("🖥️ System Performance")
    .setColor("#00ff00")
    .addFields(
      {
        name: "📊 Memory Usage",
        value: `**Heap Used:** ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
                    **Heap Total:** ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
                    **RSS:** ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB
                    **External:** ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
        inline: true,
      },
      {
        name: "⚡ Performance",
        value: `**CPU Usage:** ${cpuPercent}%
                    **Bot Uptime:** ${formatUptime(uptime)}
                    **System Uptime:** ${formatUptime(systemUptime)}
                    **Node.js Version:** ${process.version}`,
        inline: true,
      },
      {
        name: "🌐 Network",
        value: `**WebSocket Ping:** ${client.ws.ping}ms
                    **Shard Count:** ${client.shard?.count || 1}
                    **Current Shard:** ${client.shard?.ids[0] || 0}`,
        inline: true,
      },
      {
        name: "🏢 System Info",
        value: `**OS:** ${os.type()} ${os.release()}
                    **CPU Cores:** ${os.cpus().length}
                    **Free Memory:** ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB
                    **Total Memory:** ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
        inline: false,
      },
    )
    .setTimestamp();

  return embed;
}

async function getUsageStatisticsEmbed(timeframe) {
  const dates = getDateRange(timeframe);

  const stats = await Statistics.findAll({
    where: {
      date: {
        [Op.gte]: dates.start,
        [Op.lte]: dates.end,
      },
    },
    order: [["date", "DESC"]],
  });

  if (stats.length === 0) {
    return new EmbedBuilder()
      .setTitle("📈 Usage Statistics")
      .setColor("#ffaa00")
      .setDescription("No usage data found for the selected timeframe.")
      .setTimestamp();
  }

  let totalVerifications = 0;
  let totalBotJoins = 0;
  let totalBotLeaves = 0;
  const commandUsage = {};
  const componentUsage = {};

  stats.forEach((stat) => {
    totalVerifications += stat.verifications || 0;
    totalBotJoins += stat.botJoins || 0;
    totalBotLeaves += stat.botLeaves || 0;

    if (stat.commandUsage) {
      Object.entries(stat.commandUsage).forEach(([cmd, count]) => {
        commandUsage[cmd] = (commandUsage[cmd] || 0) + count;
      });
    }

    if (stat.componentUsage) {
      Object.entries(stat.componentUsage).forEach(([comp, count]) => {
        componentUsage[comp] = (componentUsage[comp] || 0) + count;
      });
    }
  });

  const topCommands =
    Object.entries(commandUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      ?.map(([cmd, count]) => `${cmd}: ${count}`)
      .join("\n") || "No command data";

  const topComponents =
    Object.entries(componentUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      ?.map(([comp, count]) => `${comp}: ${count}`)
      .join("\n") || "No component data";

  const embed = new EmbedBuilder()
    .setTitle(`📈 Usage Statistics (${timeframe})`)
    .setColor("#0099ff")
    .addFields(
      {
        name: "📊 Overview",
        value: `**Total Verifications:** ${totalVerifications}
                    **Bot Joins:** ${totalBotJoins}
                    **Bot Leaves:** ${totalBotLeaves}
                    **Net Growth:** ${totalBotJoins - totalBotLeaves}`,
        inline: true,
      },
      {
        name: "🔧 Top Commands",
        value: topCommands,
        inline: true,
      },
      {
        name: "🎛️ Top Components",
        value: topComponents,
        inline: true,
      },
    )
    .setFooter({ text: `Data from ${stats.length} day(s)` })
    .setTimestamp();

  return embed;
}

async function getCacheStatisticsEmbed(client) {
  const cacheStats = {
    guilds: client.guilds.cache.size,
    users: client.users.cache.size,
    channels: client.channels.cache.size,
    messages: 0,
    members: 0,
    roles: 0,
    emojis: client.emojis.cache.size,
    voiceStates: 0,
  };

  client.guilds.cache.forEach((guild) => {
    cacheStats.members += guild.members.cache.size;
    cacheStats.roles += guild.roles.cache.size;
    cacheStats.voiceStates += guild.voiceStates.cache.size;

    guild.channels.cache.forEach((channel) => {
      if (channel.messages) {
        cacheStats.messages += channel.messages.cache.size;
      }
    });
  });

  const embed = new EmbedBuilder()
    .setTitle("💾 Cache Statistics")
    .setColor("#9900ff")
    .addFields(
      {
        name: "🏰 Guild Data",
        value: `**Guilds:** ${cacheStats.guilds}
**Channels:** ${cacheStats.channels}
**Roles:** ${cacheStats.roles}`,
        inline: true,
      },
      {
        name: "👥 User Data",
        value: `**Users:** ${cacheStats.users}
**Members:** ${cacheStats.members}
**Voice States:** ${cacheStats.voiceStates}`,
        inline: true,
      },
      {
        name: "💬 Content Data",
        value: `**Messages:** ${cacheStats.messages}
**Emojis:** ${cacheStats.emojis}`,
        inline: true,
      },
    )
    .setFooter({ text: "Cache sizes may vary due to automatic cleanup" })
    .setTimestamp();

  return embed;
}

function getDateRange(timeframe) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (timeframe) {
    case "today":
      return {
        start: today.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
      };
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        start: weekAgo.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
      };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return {
        start: monthAgo.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
      };
    }
    default:
      return {
        start: today.toISOString().split("T")[0],
        end: today.toISOString().split("T")[0],
      };
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
