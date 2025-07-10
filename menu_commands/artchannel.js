const { ArtBoardConfig } = require("../dbObjects.js");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");

module.exports = async ({ interaction, context }) => {
  const num = parseInt(context[0]);

  await interaction.deferUpdate();

  await interaction.editReply({ components: [] });

  if (num === 0) {
    const artchannelcomponent = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("artchannel_1")
        .setChannelTypes("GuildText")
        .setPlaceholder("Select the art leaderboard channel")
        .setMinValues(1)
        .setMaxValues(1)
        .setDefaultChannels([]),
    );

    const channels = interaction.values;

    await ArtBoardConfig.upsert({
      server_id: interaction.guild.id,
      artchannels: channels,
    });

    await interaction.editReply({
      content: `Great! The art channel(s) is now set up correctly! \n\nNow please select the art leaderboard channel.`,
      components: [artchannelcomponent],
    });
  }

  if (num === 1) {
    const channel = interaction.values[0];

    await ArtBoardConfig.upsert({
      server_id: interaction.guild.id,
      artleaderboardchannel: channel,
    });

    await interaction.editReply({
      content: `Great! Now we just need to set up an emoji to use as a reaction!\n\nPlease send the emoji you would like to use to rate art.`,
      components: [],
    });

    const filter = (m) => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({
      filter,
      time: 60000,
      max: 5,
    });

    collector.on("collect", async (m) => {
      const emotes = (str) =>
        str.match(/<a?:.+?:\d{18}>|\p{Extended_Pictographic}/gu);
      if (emotes(m.content) === null)
        return m.reply(
          "Please enter a valid emoji to use as the reaction emoji.",
        );
      collector.stop();

      const emoji = emotes(m.content)[0];

      await ArtBoardConfig.upsert({
        server_id: interaction.guild.id,
        emoji: emoji,
      });

      const rolecomponent = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("artchannel_2")
          .setPlaceholder("Select the role(s) to assign to the weekly winners")
          .setMinValues(1)
          .setMaxValues(5),
      );

      const skipandfinish = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("artchannelfinish")
          .setLabel("Skip & Finish")
          .setStyle("Primary"),
      );

      await m.reply({
        content: `Great! The emoji is now set up correctly! The base setup for the art leaderboard is completed! If you wish to assign the weekly winners a special role you can do so right here. Or you can choose to skip that step and finish setup.`,
        components: [rolecomponent, skipandfinish],
      });
    });
  }

  if (num === 2) {
    const roles = interaction.values;

    await ArtBoardConfig.upsert({
      server_id: interaction.guild.id,
      winnerrole: roles,
    });

    await interaction.editReply({
      content: `Great! The role(s) to assign to the weekly winners is now set up correctly! The setup is now completed!`,
      components: [],
    });
  }

  if (num === 3) {
    await interaction.editReply({
      content: `Great! The setup is now completed!`,
      components: [],
    });
  }
};
