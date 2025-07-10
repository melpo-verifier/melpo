const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Get a list of commands")
    .setContexts(0),
  async execute({ interaction, client }) {
    const buttonPagination = require("./../../js/buttonPagination.js");
    const helpEmbeds = [];

    const orderedFolders = ["setup", "utility", "misc"];

    for (const folder of orderedFolders) {
      const commandFiles = fs
        .readdirSync(`./commands/${folder}`)
        .filter((file) => file.endsWith(".js"));

      const catagoryEmbed = new EmbedBuilder()
        .setTitle(folder)
        .setDescription(
          `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)`,
        )
        .setFooter({ text: "Developed by milo_dev" })
        .setTimestamp()
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
        .setColor("#3f7ff1");

      const subcommands = [];

      for (const file of commandFiles) {
        const command = require(`./../${folder}/${file}`);

        if (command.deleted) continue;

        const description = `${command.data.description || "No description provided"}`;

        if (
          command.data.type === "SUB_COMMAND" ||
          command.data.type === "SUB_COMMAND_GROUP"
        ) {
          subcommands.push(command);
        } else {
          catagoryEmbed.addFields({
            name: `/${command.data.name}`,
            value: description,
          });
        }
      }

      if (subcommands.length > 0) {
        catagoryEmbed.addFields({
          name: "Subcommands",
          value: subcommands
            ?.map((command) => `/${command.data.name}`)
            .join("\n"),
        });
      }

      helpEmbeds.push(catagoryEmbed);
    }

    await buttonPagination(
      interaction,
      helpEmbeds,
      60000,
      ["⏪", "⏩"],
      0,
      0,
      "help",
    );
  },
};
