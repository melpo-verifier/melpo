const { EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { updateTemporarySetup } = require("../../js/tempconfigfuncs.js");
const activeCollectors = new Map();

module.exports = async ({ interaction }) => {
  const channelId = interaction.channel.id;
  // Check if a collector is already active in the channel
  if (activeCollectors.has(channelId)) {
    const existingCollector = activeCollectors.get(channelId);
    existingCollector.stop("newCollectorStarted");
  }

  const customIdValue = interaction.customId.split("_")[1];

  const imageaskembed = new EmbedBuilder()
    .setTitle("Set Image")
    .setDescription(
      "Please send an image url or upload and send an image that you would like to set as the embed image. You have 30 seconds to do so.",
    )
    .setColor("#3f7ff1");

  //create message component collector
  const filter = (msg) => msg.author.id === interaction.user.id;
  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 30000,
  });

  activeCollectors.set(channelId, collector);

  interaction.reply({ embeds: [imageaskembed], flags: MessageFlags.Ephemeral });

  collector.on("collect", async (collected) => {
    try {
      var imagePath;
      if (collected.attachments.first()) {
        const imageUrl = collected.attachments.first().url;
        imagePath = await downloadImage(
          imageUrl,
          interaction.guild.id,
          customIdValue,
        ).catch((err) => {
          interaction.followUp({
            content: `Error downloading image: ${err.message}`,
            flags: MessageFlags.Ephemeral,
          });
          collector.stop("invalid"); // Stop the collector
          return null; // Explicitly return null to prevent further execution
        });
        await updateTemporarySetup(interaction.guild.id, {
          [customIdValue]: { image: imagePath },
        });
        collector.stop("collected");
        collected.delete();
        interaction.deleteReply();
      } else if (collected.content) {
        const imageUrl = collected.content;
        imagePath = await downloadImage(
          imageUrl,
          interaction.guild.id,
          customIdValue,
        );
        await updateTemporarySetup(interaction.guild.id, {
          [customIdValue]: { image: imagePath },
        }).catch((err) => {
          interaction.followUp({
            content: `Error downloading image: ${err.message}`,
            flags: MessageFlags.Ephemeral,
          });
          collector.stop("invalid"); // Stop the collector
          return null; // Explicitly return null to prevent further execution
        });
        collector.stop("collected");
        collected.delete();
        interaction.deleteReply();
      }

      if (!imagePath) return; // Stop execution if imagePath is invalid

      const attachment = new AttachmentBuilder(imagePath).setName(
        `${customIdValue}.${imagePath.split(".").pop()}`,
      );

      const embed = EmbedBuilder.from(interaction.message.embeds[1])
        .setImage(`attachment://${customIdValue}.${imagePath.split(".").pop()}`)
        .setFooter({ text: `This is the ${customIdValue}.` });

      try {
        await interaction.message.edit({
          embeds:
            interaction.message.embeds.length > 1
              ? [interaction.message.embeds[0], embed]
              : [embed],
          files: [attachment],
        });
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error("Oh no! The image file does not seem to exist!");
        }
        throw error;
      }
    } catch (error) {
      collector.stop("invalid");
      throw error;
    }
  });

  collector.on("end", (collected, reason) => {
    activeCollectors.delete(channelId);
    if (reason === "time") {
      interaction.deleteReply();
    }
  });
};

async function downloadImage(url, serverId, customIdValue) {
  const ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };

  const fetch = (await import("node-fetch")).default;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch image");

  // Check content type
  const contentType = response.headers.get("content-type");
  if (!contentType || !ALLOWED_TYPES[contentType]) {
    return Promise.reject(
      new Error(
        `Invalid image type: ${contentType}. Allowed types: ${Object.keys(ALLOWED_TYPES).join(", ")}`,
      ),
    );
    // throw new Error('Invalid image type. Allowed types: JPG, PNG, GIF, WEBP');
  }

  try {
    // Ensure directory exists
    const dirPath = path.join(__dirname, "..", "..", "images", customIdValue);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = ALLOWED_TYPES[contentType];
    const fileName = `${serverId}_temp${ext}`;
    const relativeFilePath = path.join("images", customIdValue, fileName);
    const absoluteFilePath = path.join(__dirname, "..", "..", relativeFilePath);

    // Write file
    fs.writeFileSync(absoluteFilePath, buffer);

    // Verify file exists and is readable
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error("Failed to save image file");
    }

    console.log(`Image saved successfully:
            Relative path: ${relativeFilePath}
            Absolute path: ${absoluteFilePath}
            Size: ${buffer.length} bytes
        `);

    return relativeFilePath;
  } catch (error) {
    throw new Error(`Failed to save image: ${error.message}`);
  }
}
