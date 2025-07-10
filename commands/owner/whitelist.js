const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { Whitelist } = require("../../dbObjects.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Whitelisting features for servers")
    .setContexts(0)
    .addStringOption((option) =>
      option.setName("server_id").setDescription("Server ID").setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("whitelistartleaderboard")
        .setDescription("Whitelist art leaderboard?"),
    ),
  async execute({ interaction }) {
    if (interaction.user.id !== "808738877945675786")
      return interaction.reply({
        content: "You are not allowed to use this command.",
        flags: MessageFlags.Ephemeral,
      });

    const serverId = interaction.options.getString("server_id");
    const whitelistArtLeaderboard = interaction.options.getBoolean(
      "whitelistartleaderboard",
    );
    if (whitelistArtLeaderboard !== null) {
      const [whitelist] = await Whitelist.findOrCreate({
        where: { server_id: serverId },
      });
      if (whitelistArtLeaderboard === true) {
        whitelist.artLeaderboard = true;
      } else {
        whitelist.artLeaderboard = false;
      }
      await whitelist.save();
      return await interaction.reply({
        content: `Whitelist art leaderboard has been set to ${whitelistArtLeaderboard} for server ${serverId}.`,
      });
    }
  },
};
