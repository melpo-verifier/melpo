const { EmbedBuilder } = require("discord.js");

module.exports = async ({ interaction }) => {
	await interaction.deferUpdate();

	const cancelEmbed = new EmbedBuilder()
		.setColor("#3f7ff1")
		.setTitle("Deletion Cancelled")
		.setDescription("The application deletion has been cancelled.");

	await interaction.editReply({
		embeds: [cancelEmbed],
		components: [],
	});
};
