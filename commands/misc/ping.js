const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const os = require("os");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with detailed bot and shard statistics!"),
  async execute({ interaction }) {
    const client = interaction.client;

    const wsLatency = client.ws.ping;

    const totalSeconds = Math.floor(client.uptime / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);

    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

    const systemUptime = os.uptime();
    const sysDays = Math.floor(systemUptime / 86400);
    const sysHours = Math.floor((systemUptime % 86400) / 3600);
    const sysMinutes = Math.floor((systemUptime % 3600) / 60);
    const sysSeconds = Math.round(systemUptime % 60);

    const shardId = interaction.guild?.shardId ?? 0;
    const totalShards = client.shard?.count ?? 1;

    await interaction.reply("Pinging...");
    const sent = await interaction.fetchReply();
    const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;

    const cpuUsage = process.cpuUsage();
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1e6).toFixed(2);

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle(":ping_pong: Pong!")
      .setDescription("Here are the detailed bot and shard statistics:")
      .addFields(
        {
          name: ":stopwatch: Uptime",
          value: `${days}d ${hours}h ${minutes}m ${seconds}s`,
          inline: true,
        },
        {
          name: ":gear: Roundtrip Latency",
          value: `${apiLatency}ms`,
          inline: true,
        },
        {
          name: ":globe_with_meridians: WebSocket Latency",
          value: `${wsLatency}ms`,
          inline: true,
        },
        {
          name: ":desktop: Memory Usage",
          value: `• Heap Used: ${heapUsedMB}MB\n• Heap Total: ${heapTotalMB}MB\n• RSS: ${rssMB}MB`,
          inline: false,
        },
        {
          name: ":satellite: Shard Info",
          value: `• Shard ID: ${shardId}\n• Total Shards: ${totalShards}`,
          inline: true,
        },
        {
          name: ":computer: System Uptime",
          value: `${sysDays}d ${sysHours}h ${sysMinutes}m ${sysSeconds}s`,
          inline: true,
        },
        {
          name: ":chart_with_upwards_trend: CPU Usage",
          value: `${cpuPercent}%`,
          inline: true,
        },
      )
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
