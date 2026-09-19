const { MessageFlags } = require("discord.js");

module.exports = async ({ interaction, client }) => {
	if (interaction.user.id !== "808738877945675786") {
		return await interaction.reply({
			content: "You are not authorized to use this command.",
			flags: MessageFlags.Ephemeral,
		});
	}

	await interaction.deferUpdate();

	const previewEmbed = interaction.message.embeds[0];

	if (!previewEmbed) {
		return await interaction.followUp({
			content: "Could not find the preview embed to broadcast.",
			flags: MessageFlags.Ephemeral,
		});
	}

	try {
		const { ServerConfig } = require("../dbObjects.js");
		const allConfigs = await ServerConfig.findAll({ attributes: ["server_id", "melpologs"] });
		const configData = allConfigs.map((c) => ({ server_id: c.server_id, melpologs: c.melpologs }));
		const targetCount = configData.filter((c) => c.melpologs).length;

		client.cluster
			.broadcastEval(
				async (c, { embedData, configs }) => {
					const delay = (ms) => new Promise((r) => setTimeout(r, ms));

					(async () => {
						for (const config of configs) {
							if (!config.melpologs) continue;
							const guild = c.guilds.cache.get(config.server_id);
							if (!guild) continue;

							const channel = guild.channels.cache.get(config.melpologs);
							if (channel) {
								await channel.send({ embeds: [embedData] }).catch(() => {});
								await delay(250);
							}
						}
					})();
					return true;
				},
				{ context: { embedData: previewEmbed.toJSON(), configs: configData } },
			)
			.catch(console.error);

		await interaction.editReply({
			content: `✅ Broadcast queued! Sending to ~**${targetCount}** servers.`,
			embeds: [],
			components: [],
		});
	} catch (error) {
		console.error("Broadcast error:", error);
		await interaction.editReply({
			content: `Broadcast encountered an error: ${error.message}`,
			embeds: [],
			components: [],
		});
	}
};
