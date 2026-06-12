const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  WebhookClient,
  StringSelectMenuBuilder
} = require("discord.js");
const { GuildWebhook, Application } = require("../dbObjects.js");
const { decryptData } = require("./DBFunctions.js");

const DEFAULT_EMBED_COLOR = "#3f7ff1";

function isValidHexColor(value) {
  const hexColorRegex = /^#?[0-9A-Fa-f]{6}$/;
  return hexColorRegex.test(value);
}

async function sendViaWebhook(webhook, embed, row, name, avatarURL, verifymessage_id, webhookUpdated) {
  const webhookData = decryptData(String(webhook.encrypted_token));
  if (!webhookData || !webhookData.id || !webhookData.token) 
  { throw new Error(`Invalid webhook data for channel ${webhook.channel_id}`); }

  const client = new WebhookClient({
    id: webhookData.id,
    token: webhookData.token
  });

  let finalMessageId = verifymessage_id;

  try {
    if (webhookUpdated === "true" || !finalMessageId) {
      if (finalMessageId) 
      { await client.deleteMessage(finalMessageId).catch(() => { }); }
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
        components: [row]
      });
      return finalMessageId;
    } catch {
      console.warn(`Edit failed for message ${finalMessageId}, sending new message instead.`);
      const message = await client.send({
        username: name,
        avatarURL,
        embeds: [embed],
        components: [row]
      });
      return message.id;
    }
  } catch (error) {
    console.error("Error sending via webhook:", error.message);
    throw error;
  } 
  finally 
  { client.destroy(); }
}

async function findVerifyMessage(verifyChannelObj, botId, embedConfig, applicationId) {
  const verificationMessages = await verifyChannelObj.messages.fetch({ limit: 50 });
  return verificationMessages?.find?.(
    (m) =>
      m.author.id === botId &&
      m.embeds.length > 0 &&
      !m.interaction &&
      (m.components?.[0]?.components?.[0]?.customId === `verifybutton_${applicationId}` ||
        m.components?.[0]?.components?.[0]?.customId === `verifyselect_${applicationId}`)
  );
}

function messageNeedsUpdate(existingMessage, newEmbed, newRow) {
  const oldEmbed = existingMessage.embeds[0];
  const newEmbedData = newEmbed.data;

  const embedChanged =
    (oldEmbed.title || null) !== (newEmbedData.title || null) ||
    (oldEmbed.description || null) !== (newEmbedData.description || null) ||
    oldEmbed.image?.url !== newEmbedData.image?.url ||
    oldEmbed.color !== newEmbedData.color;

  const oldComponent = existingMessage.components?.[0]?.components?.[0];
  const newComponent = newRow.components[0];

  const componentChanged = oldComponent?.customId !== newComponent.data.custom_id;

  // If it's a select menu, also check if the options changed
  let optionsChanged = false;
  if (newComponent.data.options) {
    const oldOptions = oldComponent?.options ?? [];
    const newOptions = newComponent.data.options;
    optionsChanged =
      oldOptions.length !== newOptions.length ||
      newOptions.some((opt, i) => opt.value !== oldOptions[i]?.value || opt.label !== oldOptions[i]?.label);
  }

  return embedChanged || componentChanged || optionsChanged;
}


async function updateVerifyMessage(opts) {
  const {
    verifyChannelObj,
    botId,
    embedConfig,
    messageId,
    appId,
    webhookUpdated
  } = opts;

  // const guildId = verifyChannelObj.guild.id;

  const application = await Application.findOne({ where: { id: appId } });

  //if app references another message, update that one instead
  if (application.mainMessageApplicationId) {
    const mainApp = await Application.findOne({
      where: { id: application.mainMessageApplicationId }
    });

    //if no main app is found, default to sending the regular message
    if (!mainApp) {
      // throw new Error(`Referenced mainMessageApplicationId ${application.mainMessageApplicationId} not found`);
      return sendOrUpdateMessage({
        application,
        dependentApps: [],
        verifyChannelObj,
        botId,
        embedConfig: {
          color: embedConfig.color,
          title: embedConfig.title,
          description: embedConfig.description,
          imageUrl: embedConfig.imageUrl ?? null
        },
        messageId,
        webhookUpdated
      });
    }

    const mainEmbedConfig = mainApp.verifychannelembed || "{}";

    const dependentApps = await Application.findAll({
      where: {
        server_id: mainApp.server_id,
        mainMessageApplicationId: mainApp.id
      },
    });

    return sendOrUpdateMessage({
      application: mainApp,
      dependentApps,
      verifyChannelObj,
      botId,
      embedConfig: {
        color: mainEmbedConfig.color,
        title: mainEmbedConfig.title,
        description: mainEmbedConfig.description,
        imageUrl: mainEmbedConfig.image?.url ?? null,
        // footer: appName,
      },
      messageId: mainApp.verifymessage_id,
      webhookUpdated
    });
  }

  //finds all apps that reference this app
  const dependentApps = await Application.findAll({
    where: {
      server_id: application.server_id,
      mainMessageApplicationId: application.id
    }
  });

  return sendOrUpdateMessage({
    application,
    dependentApps,
    verifyChannelObj,
    botId,
    embedConfig: {
      color: embedConfig.color,
      title: embedConfig.title,
      description: embedConfig.description,
      imageUrl: embedConfig.imageUrl ?? null
    },
    messageId,
    webhookUpdated
  });
}

async function sendOrUpdateMessage({
  application,
  dependentApps,
  verifyChannelObj,
  botId,
  embedConfig,
  messageId,
  webhookUpdated
}) {

  const embed = new EmbedBuilder()
    .setColor(isValidHexColor(embedConfig.color) ? embedConfig.color : DEFAULT_EMBED_COLOR)
    .setTitle(embedConfig.title)
    .setDescription(embedConfig.description)
    .setImage(embedConfig.imageUrl)

  const row = await buildRowForApplication(application, dependentApps);

  if (application.branding_enabled === true) {
    const webhook = await GuildWebhook.findOne({ where: { channel_id: verifyChannelObj.id } });
    if (webhook) {
      try {
        const name = application.custom_name || "Melpo Verifier";
        const avatarURL = application.custom_avatar_url || null;
        const verifymessage_id = application.verifymessage_id;
        const resultMessageId = await sendViaWebhook(webhook, embed, row, name, avatarURL, verifymessage_id, webhookUpdated);
        return { action: "webhook_sent", messageId: resultMessageId };
      } 
      catch (error) 
      { console.error("Error sending webhook:", error.message); }
    }
  }

  let verificationMessage = null;
  if (messageId) {
    try {
      const fetchedMessage = await verifyChannelObj.messages.fetch(messageId);
      verificationMessage = (fetchedMessage && fetchedMessage.author?.id === botId) ? fetchedMessage : null;
    } 
    catch 
    { verificationMessage = null; }
  }

  if (!verificationMessage) {
    verificationMessage = await findVerifyMessage(verifyChannelObj, botId, embedConfig, application.id);
  }

  if (!verificationMessage) {
    const newMessage = await verifyChannelObj.send({ embeds: [embed], components: [row] });
    return { action: "created", messageId: newMessage?.id };
  } else if (messageNeedsUpdate(verificationMessage, embed, row)) {
    await verificationMessage.edit({ embeds: [embed], components: [row] });
    return { action: "updated", messageId: verificationMessage.id };
  }

  return { action: "no_changes", messageId: verificationMessage.id };
}

async function buildRowForApplication(app, dependentApps) {
  if (dependentApps.length > 0) {
    const options = [
      { label: app.name, value: String(app.id) },
      ...dependentApps.map((dep) => ({ label: dep.name, value: String(dep.id) })),
    ];

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`verifyselect_${app.id}`)
        .setPlaceholder("Select an application")
        .addOptions(options)
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`verifybutton_${app.id}`)
      .setLabel("Apply")
      .setStyle(ButtonStyle.Success)
  );
}

module.exports = {
  updateVerifyMessage,
  isValidHexColor
};