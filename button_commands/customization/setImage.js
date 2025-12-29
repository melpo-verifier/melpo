const { EmbedBuilder, MessageFlags } = require("discord.js");
const {
  uploadCustomizationImage,
  purgeOldImages,
  serializeImage,
} = require("../../js/customizationImages.js");
const {
  getTempApplicationById,
  updateTempApplication,
} = require("../../js/tempconfigfuncs.js");
const activeCollectors = new Map();

module.exports = async ({ interaction, context }) => {
  const channelId = interaction.channel.id;
  // Check if a collector is already active in the channel
  if (activeCollectors.has(channelId)) {
    const existingCollector = activeCollectors.get(channelId);
    existingCollector.stop("newCollectorStarted");
  }

  const customIdValue = context[0];
  const tempApplicationId = parseInt(context[1], 10);

  if (!customIdValue || isNaN(tempApplicationId)) {
    throw new Error("Missing customization context for image setup.");
  }

  // Validate tempApplicationId and get tempApp
  const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error || !tempApp) {
    return interaction.reply({
      content: error || "Application not found or does not belong to this server.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const imageaskembed = new EmbedBuilder()
    .setTitle("Set Image")
    .setDescription(
      "Please upload an image or paste an image URL within 30 seconds to update the image.",
    )
    .setColor("#3f7ff1");

  //create message component collector
  const filter = (msg) => msg.author.id === interaction.user.id;
  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 30000,
  });

  activeCollectors.set(channelId, collector);

  await interaction.reply({ embeds: [imageaskembed], flags: MessageFlags.Ephemeral });

  collector.on("collect", async (collected) => {
    try {
      const collectedimage = collected.attachments.first()?.url || collected.content;
      if (!collectedimage) {
        return;
      }

      const imageAsset = await fetchImage(collectedimage);
      const uploadedImage = await uploadCustomizationImage({
        serverId: interaction.guild.id,
        appName: tempApp.name,
        section: customIdValue,
        buffer: imageAsset.buffer,
        contentType: imageAsset.contentType,
        extension: imageAsset.extension,
      });

      await purgeOldImages({
        serverId: interaction.guild.id,
        appName: tempApp.name,
        section: customIdValue,
        keepKey: uploadedImage.key,
        filter: "temp",
      });

      const storedImage = serializeImage(uploadedImage);

      await updateTempApplication(
        interaction.guild.id,
        {
          [customIdValue]: {
            image: storedImage,
          },
        },
        { id: tempApplicationId },
      );

      await refreshCustomizationEmbed({ interaction, image: uploadedImage });

      collector.stop("collected");
      await collected.delete().catch(() => {});
      await interaction.deleteReply().catch(() => {});
    } catch (error) {
      console.error("Failed to process image upload:", error);
      await interaction.followUp({
        content: `Error processing image: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      collector.stop("invalid");
    }
  });

  collector.on("end", (_, reason) => {
    activeCollectors.delete(channelId);
    if (reason === "time") {
      interaction.deleteReply().catch(() => {});
    }
  });
};

async function refreshCustomizationEmbed({ interaction, image }) {
  const currentEmbeds = interaction.message.embeds;
  if (!currentEmbeds || currentEmbeds.length === 0) {
    return;
  }

  const targetIndex = currentEmbeds.length > 1 ? 1 : 0;
  const originalFooter = currentEmbeds[targetIndex]?.footer?.text;
  const targetEmbed = EmbedBuilder.from(currentEmbeds[targetIndex])
    .setImage(image.url)
    .setFooter({ text: targetEmbedFooter(originalFooter) });

  const embedsToSend = [...currentEmbeds];
  embedsToSend[targetIndex] = targetEmbed;

  await interaction.message.edit({
    embeds: embedsToSend,
    files: [],
  });
}

function targetEmbedFooter(existingFooter) {
  if (existingFooter && existingFooter.length > 0) {
    return existingFooter;
  }
  return "Customization preview";
}

async function fetchImage(url) {
  const ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };

  const fetch = (await import("node-fetch")).default;
  const response = await fetch(url, { size: 15 * 1024 * 1024 });
  if (!response.ok) {
    throw new Error("Failed to fetch image");
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !ALLOWED_TYPES[contentType]) {
    throw new Error(
      `Invalid image type: ${contentType || "unknown"}. Allowed types: ${Object.keys(ALLOWED_TYPES).join(", ")}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("Received empty image data");
  }

  return {
    buffer,
    contentType,
    extension: ALLOWED_TYPES[contentType],
  };
}