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
          name: ":satellite: Shard Info",
          value: `• Shard ID: ${shardId}\n• Total Shards: ${totalShards}`,
          inline: true,
        },
        {
          name: ":computer: System Uptime",
          value: `${sysDays}d ${sysHours}h ${sysMinutes}m ${sysSeconds}s`,
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