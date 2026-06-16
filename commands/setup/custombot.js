const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("custombot")
    .setDescription("Custom Melpo with your own avatar and name!")
    .setContexts(0),
  async execute({ interaction }) {
    //NOTE : Hardcoded invite link, potentially move to DB or table? -mat
    const adembed = new EmbedBuilder()
      .setColor("#3f7ff1")
      .setTitle("Custom Melpo")
      .setDescription(
        `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo) or in Discord's store\n\nIt is now possible to have a custom Melpo with your own avatar, name, banner, status and about me, completely for your own to use!\nA custom bot is a bot that runs Melpo Verifier through a bot token of your own.\nFor $5 a month or $50 for a year you get your custom bot!\n\n**Fully custom bot profile**\n- Personalize your custom bot with a profile that fully matches your server.\n**Custom Status**\n- Customise the status displayed on your bot's profile.\n**Hosted and online 24/7**\n- Your bot is hosted as a separate instance, ensuring maximum uptime and performance.\n**Support Melpo's Development and Hosting**\n- Your contribution helps maintain and improve the bot's features and hosting.`
      )
      .setFooter({ text: "Developed by milo_dev" });

    const linkbuttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Ko-Fi")
        .setStyle(5)
        .setURL("https://ko-fi.com/melpo"),
      new ButtonBuilder()
        .setLabel("Custom bot dashboard")
        .setStyle(5)
        .setURL("https://melpo.app/custom-bot")
    );

    await interaction.reply({ embeds: [adembed], components: [linkbuttons] });
  },
};
