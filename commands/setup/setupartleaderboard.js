const {
  SlashCommandBuilder,
  ActionRowBuilder,
  PermissionsBitField,
  ChannelSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const { Whitelist } = require("../../dbObjects.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setupartleaderboard")
    .setDescription("Sets up the art leaderboard!")
    .setContexts(0),
  async execute({ interaction }) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return await interaction.reply({
        content:
          "You do not have the required permissions (Manage Server) to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildwhitelist = await Whitelist.findOne({
      where: { server_id: interaction.guild.id },
    });
    if (!guildwhitelist || guildwhitelist.artLeaderboard === false) {
      return await interaction.reply(
        `This command currently isn't yet available for everyone to use yet. If you wish to use the art leaderboard, please contact the developer \`milo_dev\`.\nThe art leaderboard allows users to "vote" for images by reacting to them. At the end of each week (every Saturday), the bot counts the reactions and posts the top 3 images in a gallary.`,
      );
    }

    const artchannelcomponent = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("artchannel_0")
        .setChannelTypes("GuildText")
        .setPlaceholder("Select the art channel(s)")
        .setMinValues(1)
        .setMaxValues(5),
    );

    await interaction.reply({
      content:
        "Alrighty! Let's get started with setting up the art leaderboard!\n\nFirst, let's set up the art channel(s).",
      components: [artchannelcomponent],
    });
  },
};
