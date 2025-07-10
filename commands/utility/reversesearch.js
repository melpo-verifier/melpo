const {
  SlashCommandBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reversesearch")
    .setDescription("Google reverse search an image")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("url")
        .setDescription("Enter a URL to reverse search")
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Enter a URL to reverse search")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("file")
        .setDescription("Upload an image to reverse search")
        .addAttachmentOption((option) =>
          option
            .setName("image-file")
            .setDescription("Upload an image file to reverse search")
            .setRequired(true),
        ),
    )
    .setContexts(0),
  async execute({ interaction }) {
    await interaction.deferReply();

    try {
      let imageUrl;

      if (interaction.options.getSubcommand() === "url") {
        imageUrl = interaction.options.getString("url");
      } else {
        const attachment = interaction.options.getAttachment("image-file");
        if (!attachment.contentType?.startsWith("image/")) {
          return interaction.editReply("Please provide a valid image file!");
        }
        imageUrl = attachment.url;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Google Lens")
          .setURL(
            `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`,
          )
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel("TinEye")
          .setURL(
            `https://tineye.com/search?url=${encodeURIComponent(imageUrl)}`,
          )
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel("SauceNAO")
          .setURL(
            `https://saucenao.com/search.php?url=${encodeURIComponent(imageUrl)}`,
          )
          .setStyle(ButtonStyle.Link),
      );

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("Reverse Image Search")
        .setDescription(
          "- **Google Lens** - Best for general searches and finding similar images\n" +
            "- **TinEye** - Best for finding exact copies\n" +
            "- **SauceNAO** - Best for artwork sources\n\n" +
            "Click a button below to search using your preferred engine",
        )
        .setImage(imageUrl)
        .setFooter({ text: "Image preview above • Click buttons to search" });

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (error) {
      console.error("Reverse search error:", error);
      await interaction.editReply(
        "Failed to process image search. Please try again.",
      );
    }
  },
};
