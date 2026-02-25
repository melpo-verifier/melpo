const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} = require("discord.js");

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

function messageNeedsUpdate(existingMessage, newEmbed) {
  const oldEmbed = existingMessage.embeds[0];
  const newEmbedData = newEmbed.data;

  return (
    (oldEmbed.title || null) !== (newEmbedData.title || null) ||
    (oldEmbed.description || null) !== (newEmbedData.description || null) ||
    oldEmbed.image?.url !== newEmbedData.image?.url ||
    oldEmbed.color !== newEmbedData.color
  );
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
    embedConfig.footer,
  );

  const embed = new EmbedBuilder()
    .setColor(embedConfig.color)
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
    if (messageNeedsUpdate(verificationMessage, embed)) {
      await verificationMessage.edit({
        embeds: [embed],
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
};
