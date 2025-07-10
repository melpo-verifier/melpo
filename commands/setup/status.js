const {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
} = require("discord.js");
const { Status } = require("../../dbObjects"); // path to dbObjects.js

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setstatus")
    .setDescription("Sets the bot presense (status)")
    .setContexts(0)
    .addStringOption((option) =>
      option.setName("name").setDescription("the name"),
    )
    .addStringOption((option) =>
      option.setName("type").setDescription("the type").addChoices(
        {
          name: "Playing",
          value: "0",
        },
        {
          name: "Listening",
          value: "2",
        },
        {
          name: "Watching",
          value: "3",
        },
        {
          name: "none",
          value: "4",
        },
      ),
    )
    .addStringOption((option) =>
      option.setName("status").setDescription("the status").addChoices(
        {
          name: "online",
          value: "online",
        },
        {
          name: "idle",
          value: "idle",
        },
        {
          name: "dnd",
          value: "dnd",
        },
        {
          name: "invisible",
          value: "invisible",
        },
      ),
    ),
  async execute({ interaction, client }) {
    if (
      (client.user.id === "849613551080701983" ||
        client.user.id === "1289208416023347265" ||
        client.user.id === "916372883087974440") &&
      interaction.user.id !== "808738877945675786"
    ) {
      return interaction.reply({
        content:
          "In order to set a custom status you have to have a custom version of Melpo *add more info here*",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return interaction.reply({
        content: `You need the \`Manage Server\` permission to change the bot's status.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const name = interaction.options.getString("name");
    const type = interaction.options.getString("type");
    const status = interaction.options.getString("status");

    if (!name && !type && !status) {
      return interaction.reply({
        content:
          "You need to provide at least one of the following: name, type, status",
        flags: MessageFlags.Ephemeral,
      });
    }

    const [statusData] = await Status.findOrCreate({
      where: { client_id: client.user.id },
    });

    const presence = {
      activities: [{ name: statusData.name, type: parseInt(statusData.type) }],
      status: statusData.status,
    };

    if (name) {
      statusData.name = name;
      presence.activities[0].name = name;
    }

    if (type) {
      statusData.type = type;
      presence.activities[0].type = parseInt(type);
    }

    if (status) {
      statusData.status = status;
      presence.status = status;
    }

    await statusData.save();

    client.user.setPresence(presence);

    await interaction.reply({
      content: `Applied status!`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
