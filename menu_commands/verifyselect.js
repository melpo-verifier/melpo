const { handleApplicationStart } = require("../js/applicationHandler.js");
const { MessageFlags } = require("discord.js");
module.exports = async ({ interaction, client }) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const applicationId = parseInt(interaction.values[0], 10);
  await handleApplicationStart({ interaction, client, applicationId });
};
