const { handleApplicationStart } = require("../js/applicationHandler.js");
const { MessageFlags } = require("discord.js");

module.exports = async ({ interaction, client, applicationId }) => {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	await handleApplicationStart({ interaction, client, applicationId });
};
