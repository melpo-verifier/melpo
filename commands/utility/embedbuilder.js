const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embedbuilder")
    .setDescription("Create or edit embeds")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new embed")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Embed title")
            .setMaxLength(256)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Embed description")
            .setMaxLength(4096)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription("Embed color (hex: FF0000)")
            .setMaxLength(6)
            .setMinLength(6)
            .setRequired(false),
        )
        .addAttachmentOption((option) =>
          option
            .setName("image")
            .setDescription("Embed image")
            .setRequired(false),
        )
        .addAttachmentOption((option) =>
          option
            .setName("thumbnail")
            .setDescription("Embed thumbnail image")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("footer")
            .setDescription("Embed footer text")
            .setMaxLength(2048)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("timestamp")
            .setDescription("Add current timestamp?")
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to send embed in")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit an existing embed")
        .addStringOption((option) =>
          option
            .setName("message-id")
            .setDescription("ID of message to edit")
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel with the Embed you want to edit")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Embed title")
            .setMaxLength(256)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Embed description")
            .setMaxLength(4096)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription("Embed color (hex: FF0000)")
            .setMaxLength(6)
            .setMinLength(6)
            .setRequired(false),
        )
        .addAttachmentOption((option) =>
          option
            .setName("image")
            .setDescription("Embed image")
            .setRequired(false),
        )
        .addAttachmentOption((option) =>
          option
            .setName("thumbnail")
            .setDescription("Embed thumbnail image")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("footer")
            .setDescription("Embed footer text")
            .setMaxLength(2048)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("timestamp")
            .setDescription("Add current timestamp?")
            .setRequired(false),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("delete features of an existing embed")
        .addStringOption((option) =>
          option
            .setName("message-id")
            .setDescription("ID of message to edit")
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel with the Embed you want to edit")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("remove-title")
            .setDescription("Remove the title?")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("remove-description")
            .setDescription("Remove the description?")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("remove-color")
            .setDescription("Reset color to default?")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("remove-image")
            .setDescription("Remove the image?")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("remove-thumbnail")
            .setDescription("Remove the thumbnail?")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("remove-footer")
            .setDescription("Remove the footer?")
            .setRequired(false),
        ),
    )

    .setDefaultMemberPermissions(PermissionsBitField.ManageMessages)
    .setContexts(0),
  async execute({ interaction }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.options.getSubcommand() === "create") {
      const embed = new EmbedBuilder()
        .setTitle(interaction.options.getString("title"))
        .setDescription(interaction.options.getString("description"));

      if (interaction.options.getString("color"))
        embed.setColor("#" + interaction.options.getString("color"));
      if (interaction.options.getAttachment("thumbnail"))
        embed.setThumbnail(interaction.options.getAttachment("thumbnail").url);
      if (interaction.options.getAttachment("image"))
        embed.setImage(interaction.options.getAttachment("image").url);
      if (interaction.options.getString("footer"))
        embed.setFooter({ text: interaction.options.getString("footer") });
      if (interaction.options.getBoolean("timestamp")) embed.setTimestamp();

      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (
        !channel
          .permissionsFor(interaction.client.user)
          .has(["ViewChannel", "SendMessages", "EmbedLinks"])
      ) {
        return interaction.editReply({
          content: `I don't have permission to send embeds in ${channel}!`,
        });
      }

      await channel.send({ embeds: [embed] });

      await interaction.editReply({
        content: `Your embed has been sent to ${channel}:`,
        embeds: [embed],
      });
    } else if (interaction.options.getSubcommand() === "edit") {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;
      const messageId = interaction.options.getString("message-id");

      const message = await channel.messages.fetch(messageId).catch(() => null);

      if (!message) {
        return interaction.editReply("Could not find that message!");
      }

      if (message.author.id !== interaction.client.user.id) {
        return interaction.editReply("I can only edit my own embeds!");
      }

      if (!message.embeds?.[0]) {
        return interaction.editReply("That message doesn't contain an embed!");
      }

      // Create new embed from old one
      const oldEmbed = message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed);

      const updates = {
        title: interaction.options.getString("title"),
        description: interaction.options.getString("description"),
        color: "#" + interaction.options.getString("color"),
        image: interaction.options.getAttachment("image"),
        thumbnail: interaction.options.getAttachment("thumbnail"),
        footer: interaction.options.getString("footer"),
        timestamp: interaction.options.getBoolean("timestamp"),
      };

      if (updates.title) newEmbed.setTitle(updates.title);
      if (updates.description) newEmbed.setDescription(updates.description);

      if (updates.color?.match(/^#[0-9A-F]{6}$/i)) {
        newEmbed.setColor(updates.color);
      }

      if (updates.image) newEmbed.setImage(updates.image.url);
      if (updates.thumbnail) newEmbed.setThumbnail(updates.thumbnail.url);

      if (updates.footer) newEmbed.setFooter({ text: updates.footer });
      if (updates.timestamp !== null) {
        updates.timestamp
          ? newEmbed.setTimestamp()
          : newEmbed.setTimestamp(null);
      }

      await message.edit({ embeds: [newEmbed] });

      await interaction.editReply({
        content: "Embed updated!",
      });
    } else if (interaction.options.getSubcommand() === "delete") {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;
      const messageId = interaction.options.getString("message-id");

      const message = await channel.messages.fetch(messageId).catch(() => null);

      if (!message) {
        return interaction.editReply("Could not find that message!");
      }

      if (message.author.id !== interaction.client.user.id) {
        return interaction.editReply("I can only edit my own embeds!");
      }

      if (!message.embeds?.[0]) {
        return interaction.editReply("That message doesn't contain an embed!");
      }

      // Create new embed from old one
      const oldEmbed = message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed);

      const removals = {
        title: interaction.options.getBoolean("remove-title"),
        description: interaction.options.getBoolean("remove-description"),
        color: interaction.options.getBoolean("remove-color"),
        image: interaction.options.getBoolean("remove-image"),
        thumbnail: interaction.options.getBoolean("remove-thumbnail"),
        footer: interaction.options.getBoolean("remove-footer"),
      };

      if (removals.title) newEmbed.setTitle(null);
      if (removals.description) newEmbed.setDescription(null);
      if (removals.color) newEmbed.setColor(null);
      if (removals.image) newEmbed.setImage(null);
      if (removals.thumbnail) newEmbed.setThumbnail(null);
      if (removals.footer) newEmbed.setFooter(null);

      await message.edit({ embeds: [newEmbed] });

      await interaction.editReply({
        content: "Embed updated!",
      });
    }
  },
};
