const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with detailed bot and shard statistics!"),
  async execute({ interaction }) {
    // const client = interaction.client;

    // const wsLatency = client.ws.ping;
    // const uptimeMs = client.uptime;
    // const days = Math.floor(uptimeMs / 86400000);
    // const hours = Math.floor((uptimeMs % 86400000) / 3600000);
    // const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    // const seconds = Math.floor((uptimeMs % 60000) / 1000);

    // const sysUptime = process.uptime();
    // const sysDays = Math.floor(sysUptime / 86400);
    // const sysHours = Math.floor((sysUptime % 86400) / 3600);
    // const sysMinutes = Math.floor((sysUptime % 3600) / 60);
    // const sysSeconds = Math.floor(sysUptime % 60);

    // const shardId = interaction.guild?.shardId ?? 0;
    // const totalShards = client.shard?.count ?? 1;

    // await interaction.reply("Pinging...");
    // const sent = await interaction.fetchReply();
    // const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;

    // const embed = new EmbedBuilder()
    //   .setColor("Blue")
    //   .setTitle(":ping_pong: Pong!")
    //   .setDescription("Here are the detailed bot and shard statistics:")
    //   .addFields(
    //     { name: ":stopwatch: Uptime", value: `${days}d ${hours}h ${minutes}m ${seconds}s`, inline: true },
    //     { name: ":gear: Roundtrip Latency", value: `${apiLatency}ms`, inline: true },
    //     { name: ":globe_with_meridians: WebSocket Latency", value: `${wsLatency}ms`, inline: true },
    //     { name: ":satellite: Shard Info", value: `• Shard ID: ${shardId}\n• Total Shards: ${totalShards}`, inline: true },
    //     { name: ":computer: System Uptime", value: `${sysDays}d ${sysHours}h ${sysMinutes}m ${sysSeconds}s`, inline: true },
    //   )
    //   .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
    //   .setTimestamp();

    // await interaction.editReply({ embeds: [embed] });
    // const wsLatency = interaction.client.ws.ping;
            
		// await interaction.reply('Pinging...');
		// const sent = await interaction.fetchReply();
		// const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;

		// await interaction.editReply(
		// 	`:ping_pong: Pong!\n` +
		// 	`:stopwatch: Uptime: ${Math.round(interaction.client.uptime / 60000)} minutes\n` +
		// 	`:gear: Roundtrip latency: ${apiLatency}ms\n` +
		// 	`:globe_with_meridians: WebSocket: ${wsLatency}ms`
		// );
        // Send an initial "Pinging..." message and fetch the reply to get its creation timestamp
    const sent = await interaction.reply({ content: 'Pinging...', withResponse: true });

    // console.log(sent.resource.message)

    // Calculate roundtrip latency:
    // The difference between the timestamp of the bot's reply and the timestamp of the user's interaction
    const roundtripLatency = sent.resource.message.createdTimestamp - interaction.createdTimestamp;

    // Calculate API latency (websocket heartbeat)
    const apiLatency = interaction.client.ws.ping;

    // Edit the initial reply to show the calculated latencies
    await interaction.editReply(`:ping_pong: Pong!\nWebsocket heartbeat: ${apiLatency}ms.\nRoundtrip Latency: ${roundtripLatency}ms`);

  },
};
