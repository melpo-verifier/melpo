const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whatsnew")
    .setDescription(
      "All the things changed in Melpo V3 along with a setup guide!",
    )
    .setContexts(0),
  async execute({ interaction }) {
    const linkbuttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle("Link")
        .setLabel("Support Server")
        .setURL("https://discord.gg/jjGAwwwxZz"),
      new ButtonBuilder()
        .setStyle("Link")
        .setLabel("Ko-Fi")
        .setURL("https://ko-fi.com/melpo"),
      new ButtonBuilder()
        .setStyle("Link")
        .setLabel("Review on Top.gg")
        .setURL("https://top.gg/bot/916372883087974440#reviews"),
    );

    const changesEmbed = new EmbedBuilder()
      .setColor("#3f7ff1")
      .setDescription(
        `## Melpo Verifier V3 is finally here!\n[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nAfter a year and over hundreds of hours of development, I have completely rewritten Melpo from scratch to be a lot more stable and future proof. There are also a lot of improvements for you (the users), of which the key changes are:\n- Discord slash (/) commands (\`/help\`)\n- Completely redesigned setup command\n- Completely customisable messages (with image support)!\n- Support for Multiple Choice Questions (MCQ)\n- Option to select multiple roles in setup\n- Improved invite logging\n- Possibility for custom versions of Melpo (more info further on)\n- Separated auto-role and unverified-role\n- More info about users at their application\n- Better overview of verifications with a seperate log channel with all handled verifications\n- Entirely new Database system for future-proofing\n- Better Error-handling with better communication to users\n\nSo to say that a lot has been changed, but not to worry! While a lot of things have been added, Melpo is still completely compatible with your old configuration as the transition has been made to be as smooth as possible! Though to make full use of the new Melpo or just to discover all new features you can check out the new setup: \`/setup\` and the help command:\`/help\`\n\n### More info on custom bot\nI have implemented the option to have a completely customisable version of Melpo Verifier in your server! This includes a custom avatar, name, banner, status and about me. Because this does require more server overhead and is more work for me, this is a paid feature (see the price in the Ko-Fi link). If you are interested in this or feel like the price is not right, please join the [support server](https://discord.gg/jjGAwwwxZz) or contact \`milo_dev\` in DMs.\n\n### What about bugs?\nI have done my absolute best to make sure that the transition is as smooth as possible and that there are as few remaining bugs in the bot as possible. The bot has been in beta for three months and almost all bugs should have been fixed. But even though everything has been tested, there is always a chance that something has been missed. **If you find any bugs, please report them in the [support server](https://discord.gg/jjGAwwwxZz)!**\n\n### Thank you\nI want to thank everyone who has supported me in the development of this bot. I have put a lot of time and effort into this bot and I hope that you will enjoy the new features and improvements. If you have any questions, suggestions or feedback, please let me know in the [support server](https://discord.gg/jjGAwwwxZz) or in my DMs!\n\n**⚠ IMPORTANT NOTE:** Some permission requirements may have been changed. Please check if Melpo still has all required permissions with: \`/checkpermissions\` and that Melpo has access to the channels it needs. NO BOT NEEDS ADMINISTRATOR permissions, so long as you configure it correctly. ⚠`,
      );

    await interaction.reply({
      embeds: [changesEmbed],
      components: [linkbuttons],
    });
  },
};
