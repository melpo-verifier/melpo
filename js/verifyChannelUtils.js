const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} = require("discord.js");

const DEFAULT_EMBED_COLOR = "#3f7ff1";

function isValidHexColor(value) {
  const hexColorRegex = /^#?[0-9A-Fa-f]{6}$/;
  return hexColorRegex.test(value)
}

async function findVerifyMessage(verifyChannelObj, botId, embedConfig) {
  const verificationMessages = await verifyChannelObj.messages.fetch({
    limit: 50,
  });
  return verificationMessages.find(
    (m) =>
      m.author.id === botId &&
      m.embeds.length > 0 &&
      m.embeds[0].footer &&
      m.embeds[0].footer.text === embedConfig.footer,
  );
}

function messageNeedsUpdate(existingMessage, newEmbed, newButtonCustomId) {
  const oldEmbed = existingMessage.embeds[0];
  const newEmbedData = newEmbed.data;

  const embedChanged = (
    (oldEmbed.title || null) !== (newEmbedData.title || null) ||
    (oldEmbed.description || null) !== (newEmbedData.description || null) ||
    oldEmbed.image?.url !== newEmbedData.image?.url ||
    oldEmbed.color !== newEmbedData.color
  );
  
  const oldButtonCustomId = existingMessage.components?.[0]?.components?.[0]?.customId;
  const buttonChanged = oldButtonCustomId !== newButtonCustomId;
  
  return embedChanged || buttonChanged;
}

async function updateVerifyMessage(opts) {
  const {
    verifyChannelObj,
    botId,
    embedConfig,
    button,
  } = opts;

  const verificationMessage = await findVerifyMessage(
    verifyChannelObj,
    botId,
    embedConfig,
  );

  const embed = new EmbedBuilder()
    .setColor(isValidHexColor(embedConfig.color) ? embedConfig.color : DEFAULT_EMBED_COLOR)
    .setTitle(embedConfig.title)
    .setDescription(embedConfig.description)
    .setImage(embedConfig.imageUrl)
    .setFooter({ text: embedConfig.footer });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(button.customId)
      .setLabel(button.label)
      .setStyle("Success"),
  );

  if (!verificationMessage) {
    // Create new message
    const newMessage = await verifyChannelObj.send({
      embeds: [embed],
      components: [row],
    });

    return {
      action: "created",
      message: newMessage,
    };
  } else {
    // Check if update needed
    if (messageNeedsUpdate(verificationMessage, embed, button.customId)) {
      await verificationMessage.edit({
        embeds: [embed],
        components: [row],
      });

      return {
        action: "updated",
        message: verificationMessage,
      };
    }

    return {
      action: "no_changes",
      message: verificationMessage,
    };
  }
}

module.exports = {
  updateVerifyMessage,
  isValidHexColor
};
