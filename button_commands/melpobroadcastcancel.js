const { MessageFlags } = require("discord.js");

module.exports = async ({ interaction }) => {
	await interaction.update({
		content: "Broadcast cancelled.",
		embeds: [],
		components: [],
		flags: MessageFlags.Ephemeral,
	});
};
