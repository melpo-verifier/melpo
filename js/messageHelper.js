const { WebhookClient } = require("discord.js");
const { GuildWebhook } = require("../dbObjects.js");
const { decryptData } = require("../js/DBFunctions.js");

async function sendWebhookMessage(channel, application, payload, threadName) {
  let message;
  if (application?.branding_enabled === true) {
    const webhook = await GuildWebhook.findOne({ where: { channel_id: channel.id } });

    if (webhook) {
      try {
        const webhookData = decryptData(String(webhook.encrypted_token));
        if (webhookData?.id && webhookData?.token) {
          const wc = new WebhookClient({ id: webhookData.id, token: webhookData.token });

          const sendOptions = {
            username: application.custom_name || "Melpo Verifier",
            avatarURL: application.custom_avatar_url || null,
            ...payload,
            wait: true
          };

          if (channel.isThread()) {
            sendOptions.threadId = channel.id;
          }

          message = await wc.send(sendOptions);
        }
      } catch (error) {
        console.error("Branding Webhook Error:", error);
      }
    }
  }

  if (!message) {
    message = await channel.send(payload);
  }

  if (threadName && !channel.isThread()) {
    try {
      await channel.threads.create({
        name: threadName.substring(0, 100),
        startMessage: message.id,
      });
    } catch (error) {
      console.error("Failed to create thread:", error);
    }
  }

  return message;
}

module.exports = { sendWebhookMessage };