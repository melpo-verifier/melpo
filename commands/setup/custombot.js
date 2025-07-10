const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("custombot")
    .setDescription("Custom Melpo with your own avatar and name!")
    .setContexts(0),
  async execute({ interaction }) {
    const adembed = new EmbedBuilder()
      .setColor("#3f7ff1")
      .setTitle("Custom Melpo")
      .setDescription(
        `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nIt is now possible to have a custom Melpo with your own avatar, name, banner, status and about me, completely for your own to use!\nA custom bot is a bot that runs Melpo Verifier through a bot token of your own. However this does cost more server overhead and effort on my end, thus this is a payed feature (see the price in the [Ko-Fi link](https://ko-fi.com/melpo)). If you are interested in your own custom bot or feel like the price is not right, please join the support server or contact milo_dev in DMs.`,
      )
      .setFooter({ text: "Developed by milo_dev" });

    await interaction.reply({ embeds: [adembed] });
  },
};
