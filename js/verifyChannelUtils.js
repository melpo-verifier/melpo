const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  WebhookClient,
} = require("discord.js");
const { GuildWebhook } = require("../dbObjects.js");
const { decryptData } = require("./DBFunctions.js");
const { Application } = require("../dbObjects.js");

const DEFAULT_EMBED_COLOR = "#3f7ff1";

function isValidHexColor(value) {
  const hexColorRegex = /^#?[0-9A-Fa-f]{6}$/;
  return hexColorRegex.test(value);
}

async function sendViaWebhook(webhook, embed, row, name, avatarURL, verifymessage_id, webhookUpdated) {
  const webhookData = decryptData(String(webhook.encrypted_token));
  if (!webhookData || !webhookData.id || !webhookData.token) {
    throw new Error(`Invalid webhook data for channel ${webhook.channel_id}`);
  }

  const client = new WebhookClient({
    id: webhookData.id,
    token: webhookData.token
  });



  let finalMessageId = verifymessage_id;

  try {
    if (webhookUpdated === "true" || !finalMessageId) {
      if (finalMessageId) {
        await client.deleteMessage(finalMessageId).catch(() => { });
      }
      const message = await client.send({
        username: name,
        avatarURL: avatarURL,
        embeds: [embed],
        components: [row]
      });
      return message.id;
    }

    try {
      await client.editMessage(finalMessageId, {
        username: name,
        avatarURL,
        embeds: [embed],
        components: [row],
      });
      return finalMessageId;
    } catch (editError) {
      console.warn(`Edit failed for message ${finalMessageId}, sending new message instead.`);
      const message = await client.send({
        username: name,
        avatarURL,
        embeds: [embed],
        components: [row],
      });
      return message.id;
    }
  } catch (error) {
    console.error("Error sending via webhook:", error.message);
    throw error;
  } finally {
    client.destroy();
  }
}

async function findVerifyMessage(verifyChannelObj, botId, embedConfig) {
  const verificationMessages = await verifyChannelObj.messages.fetch({ limit: 50 });
  return verificationMessages?.find?.(
    (m) =>
      m.author.id === botId &&
      m.embeds.length > 0 &&
      m.embeds[0].footer?.text === embedConfig.footer
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
    messageId,
    appId,
    webhookUpdated
  } = opts;

  const guildId = verifyChannelObj.guild.id;

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
      .setStyle(ButtonStyle.Success)
  );

  const application = await Application.findOne({ where: { id: appId } });

  if (application.branding_enabled === true) {
    const webhook = await GuildWebhook.findOne({ where: { channel_id: verifyChannelObj.id } });
    if (webhook) {
      try {
        const name = application.custom_name || "Melpo Verifier";
        const avatarURL = application.custom_avatar_url || null;
        const verifymessage_id = application.verifymessage_id;
        const resultMessageId = await sendViaWebhook(webhook, embed, row, name, avatarURL, verifymessage_id, webhookUpdated);
        return { action: "webhook_sent", messageId: resultMessageId };
      } catch (error) {
        console.error("Error sending webhook:", error.message);
      }
    }
  }

  let verificationMessage = null;
  if (messageId) {
    try {
      verificationMessage = await verifyChannelObj.messages.fetch(messageId);
    } catch {
      verificationMessage = null;
    }
  }

  if (!verificationMessage) {
    verificationMessage = await findVerifyMessage(verifyChannelObj, botId, embedConfig);
  }

  if (!verificationMessage) {
    const newMessage = await verifyChannelObj.send({ embeds: [embed], components: [row] });
    return { action: "created", messageId: newMessage?.id };
  } else if (messageNeedsUpdate(verificationMessage, embed, button.customId)) {
    await verificationMessage.edit({ embeds: [embed], components: [row] });
    return { action: "updated", messageId: verificationMessage.id };
  }

  return { action: "no_changes", messageId: verificationMessage.id };
}

module.exports = {
  updateVerifyMessage,
  isValidHexColor
};