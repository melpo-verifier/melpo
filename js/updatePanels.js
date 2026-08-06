const {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	WebhookClient,
	StringSelectMenuBuilder,
} = require("discord.js");
const { GuildWebhook, Application } = require("../dbObjects.js");
const { decryptData } = require("./DBFunctions.js");
const { resolveImage } = require("./imageUtils.js");

const DEFAULT_EMBED_COLOR = "#3f7ff1";

function isValidHexColor(value) {
	const hexColorRegex = /^#?[0-9A-Fa-f]{6}$/;
	return hexColorRegex.test(value);
}

//Compares existing message's embed/components vs a the newly built embed/row to determine if an edit is needed. (works for both regular and webhook messages)
function messageNeedsUpdate(existingMessage, newEmbed, newRow) {
	const oldEmbed = existingMessage.embeds?.[0];
	const newEmbedData = newEmbed.data;

	if (!oldEmbed) return true;

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

//Sends or edits verification message via a webhook if setup.
//Takes input of appNeedsWebhookUpdate, which is a check upon saving the application to see if username or pfp has changed. If it has a new message will need to be sent.
async function sendViaWebhook(webhook, embed, row, name, avatarURL, verifymessage_id, appNeedsWebhookUpdate) {
	const webhookData = decryptData(String(webhook.encrypted_token));
	if (!webhookData?.id || !webhookData.token) throw new Error(`Invalid webhook data for channel ${webhook.channel_id}`);

	const client = new WebhookClient({ id: webhookData.id, token: webhookData.token });

	try {
		let existingMessage = null;

		//Check if the stored verifymessage_id exists in Discord.
		if (verifymessage_id) {
			try {
				existingMessage = await client.fetchMessage(verifymessage_id);
			} catch {
				existingMessage = null;
			}
		}

		const sendMessageOptions = { username: name, avatarURL, embeds: [embed], components: [row] };

		//Check if profile changed, if so, delete previous message
		if (existingMessage && appNeedsWebhookUpdate) {
			await client.deleteMessage(verifymessage_id).catch(() => {});
			existingMessage = null;
		}

		//If no existing message, send a new one
		if (!existingMessage) {
			const message = await client.send(sendMessageOptions);
			return { messageId: message.id, action: "webhook_created" };
		}

		//If existing message exists, update it
		try {
			await client.editMessage(verifymessage_id, {
				embeds: [embed],
				components: [row],
			});
			return { messageId: verifymessage_id, action: "webhook_updated" };
		} catch (editError) {
			console.warn(
				`Edit failed for message ${verifymessage_id}, sending new message instead. Error:`,
				editError.message,
			);
			const message = await client.send(sendMessageOptions);
			return { messageId: message.id, action: "webhook_created" };
		}
	} catch (error) {
		console.error("Error sending via webhook:", error.message);
		throw error;
	} finally {
		client.destroy();
	}
}

//fallback if stored message id is missing
async function findVerifyMessage(verifyChannelObj, botId, applicationId) {
	const verificationMessages = await verifyChannelObj.messages.fetch({ limit: 50 });
	return verificationMessages?.find?.(
		(m) =>
			m.author.id === botId &&
			m.embeds.length > 0 &&
			!m.interaction &&
			(m.components?.[0]?.components?.[0]?.customId === `verifybutton_${applicationId}` ||
				m.components?.[0]?.components?.[0]?.customId === `verifyselect_${applicationId}`),
	);
}

function buildRowForApplication(app, dependentApps) {
	if (dependentApps.length > 0) {
		const options = [
			{ label: app.name, value: String(app.id) },
			...dependentApps.map((dep) => ({ label: dep.name, value: String(dep.id) })),
		];

		return new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`verifyselect_${app.id}`)
				.setPlaceholder("Select an application")
				.setMinValues(0)
				.addOptions(options),
		);
	}

	return new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`verifybutton_${app.id}`).setLabel("Apply").setStyle(ButtonStyle.Success),
	);
}

async function sendOrUpdateMessage({
	application,
	dependentApps,
	verifyChannelObj,
	botId,
	embedConfig,
	appNeedsWebhookUpdate,
}) {
	const embed = new EmbedBuilder()
		.setColor(isValidHexColor(embedConfig.color) ? embedConfig.color : DEFAULT_EMBED_COLOR)
		.setTitle(embedConfig.title?.slice(0, 256) ?? null)
		.setDescription(embedConfig.description ?? null)
		.setImage(embedConfig.imageUrl ?? null);

	const row = buildRowForApplication(application, dependentApps);

	//if branding is enabled follow the logic in sendViaWebhook
	if (application.branding_enabled === true) {
		const webhook = await GuildWebhook.findOne({ where: { channel_id: verifyChannelObj.id } });
		if (webhook) {
			try {
				const name = application.custom_name || "Melpo Verifier";
				const avatarURL = application.custom_avatar_url || null;
				return await sendViaWebhook(
					webhook,
					embed,
					row,
					name,
					avatarURL,
					application.verifymessage_id,
					appNeedsWebhookUpdate,
				);
			} catch (error) {
				console.error("Error sending webhook, falling back to bot message:", error.message);
				// fall through to bot-native path below
			}
		}
	}

	let verificationMessage = null;
	if (application.verifymessage_id) {
		try {
			const fetchedMessage = await verifyChannelObj.messages.fetch(application.verifymessage_id);
			verificationMessage = fetchedMessage && fetchedMessage.author?.id === botId ? fetchedMessage : null;
		} catch {
			verificationMessage = null;
		}
	}

	if (!verificationMessage) {
		verificationMessage = await findVerifyMessage(verifyChannelObj, botId, application.id);
	}

	if (!verificationMessage) {
		const newMessage = await verifyChannelObj.send({ embeds: [embed], components: [row] });
		return { messageId: newMessage?.id, action: "created" };
	}

	if (messageNeedsUpdate(verificationMessage, embed, row)) {
		await verificationMessage.edit({ embeds: [embed], components: [row] });
		return { messageId: verificationMessage.id, action: "updated" };
	}

	return { messageId: verificationMessage.id, action: "no_changes" };
}

//syncs a single application's verify message, returns the the action it took and message ID.
//Also updates the application's verifymessage_id if it changed.
async function syncSingleApplication(guild, botId, application, dependentApps, appNeedsWebhookUpdate) {
	if (!application.verifychannel) {
		return { action: "skipped_no_channel" };
	}

	const verifyChannelObj = await guild.channels.fetch(application.verifychannel).catch(() => null);
	if (!verifyChannelObj) {
		return { action: "skipped_channel_missing" };
	}

	const rawEmbedConfig = application.verifychannelembed || {};

	const embedImageAsset = resolveImage(rawEmbedConfig.image);

	const embedConfig = {
		color: rawEmbedConfig.color,
		title: rawEmbedConfig.title,
		description: rawEmbedConfig.description,
		imageUrl: embedImageAsset.embedURL,
	};

	const result = await sendOrUpdateMessage({
		application,
		dependentApps,
		verifyChannelObj,
		botId,
		embedConfig,
		messageId: application.verifymessage_id,
		appNeedsWebhookUpdate,
	});

	if (result.messageId && result.messageId !== application.verifymessage_id) {
		await application.update({ verifymessage_id: result.messageId });
	}

	return result;
}

// Loops through all applications in a server to sync their verify or webhook messages.
// Panel Logic:
// - An application is treated as a "root" if it has:
//   no mainMessageApplicationId, OR its mainMessageApplicationId points at
//   an application that no longer exists in this server.
// - Every other application is a "dependent" and shows up as an option on
//   its root's select menu instead of getting its own message.
async function syncApplicationPanels(guild, botId, webhookUpdated) {
	console.log("webhookUpdated:", webhookUpdated);
	const applications = await Application.findAll({ where: { server_id: guild.id } });
	const appById = new Map(applications.map((a) => [a.id, a]));

	const dependentsByRoot = new Map();
	const rootApps = [];

	for (const app of applications) {
		const referencesValidMain = app.mainMessageApplicationId && appById.has(app.mainMessageApplicationId);

		if (referencesValidMain) {
			const list = dependentsByRoot.get(app.mainMessageApplicationId) ?? [];
			list.push(app);
			dependentsByRoot.set(app.mainMessageApplicationId, list);
		} else {
			// No reference set, or it points at an app that's gone: treat as root
			rootApps.push(app);
		}
	}

	const results = [];
	for (const app of rootApps) {
		const dependentApps = dependentsByRoot.get(app.id) ?? [];
		try {
			//check if app id is in the list of webhookUpdated, if it is, set webhookUpdated to true, otherwise false
			const appNeedsWebhookUpdate = webhookUpdated.includes(app.id);
			const result = await syncSingleApplication(guild, botId, app, dependentApps, appNeedsWebhookUpdate);
			results.push({ appId: app.id, ...result });
		} catch (error) {
			console.error(`Failed to sync verify message for application ${app.id} (${app.name}):`, error);
			results.push({ appId: app.id, action: "error", error: error.message });
		}
	}

	return results;
}

module.exports = { syncApplicationPanels, syncSingleApplication, isValidHexColor };
