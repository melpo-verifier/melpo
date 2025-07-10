const {
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("say something as Melpo")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("What should I say?")
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Where should I say it?")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionsBitField.ManageMessages)
    .setContexts(0),
  async execute({ interaction }) {
    const message = interaction.options.getString("message");
    const channel =
      interaction.options.getChannel("channel") || interaction.channel;

    if (
      !channel
        .permissionsFor(interaction.client.user)
        .has(PermissionsBitField.Flags.SendMessages) ||
      !channel
        .permissionsFor(interaction.client.user)
        .has(PermissionsBitField.Flags.ViewChannel) ||
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.ManageMessages,
      )
    ) {
      return interaction.reply({
        content: `I don't have permission to view or send messages in ${channel}!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await channel.send(
      message +
        (interaction.user ? `\n- *${interaction.user.displayName}*` : ""),
    );

    await interaction.reply({
      content: `Message sent in ${channel}!`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
