const {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	WebhookClient,
	MessageFlags,
	resolveColor,
} = require("discord.js");
const { GuildWebhook } = require("../../dbObjects.js");
const { decryptData } = require("../DBFunctions.js");
const { buildV2Components } = require("./v2ComponentBuilder.js");
const { messageNeedsUpdate, hasCustomId } = require("./messageComparator.js");

const DEFAULT_EMBED_COLOR = "#3f7ff1";

function buildRowForApplication(app, dependentApps = []) {
	if (dependentApps && dependentApps.length > 0) {
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
		new ButtonBuilder().setCustomId(`verifybutton_${app.id}_main`).setLabel("Apply").setStyle(ButtonStyle.Success),
	);
}

function buildPanelPayload(panelConfig, application, dependentApps) {
	const isV2 = panelConfig.format === "v2" || Array.isArray(panelConfig.blocks);

	if (isV2) {
		const v2Components = buildV2Components(panelConfig, application);
		return {
			isV2: true,
			sendPayload: { components: v2Components, flags: MessageFlags.IsComponentsV2 },
			renderContext: { isV2: true, v2Components },
		};
	}

	const imageUrl =
		panelConfig.imageUrl ||
		(typeof panelConfig.image === "string" ? panelConfig.image : panelConfig.image?.url) ||
		null;

	let color = DEFAULT_EMBED_COLOR;
	try {
		if (panelConfig.color) color = resolveColor(panelConfig.color);
	} catch {
		color = DEFAULT_EMBED_COLOR;
	}

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(panelConfig.title?.slice(0, 256) ?? null)
		.setDescription(panelConfig.description ?? null)
		.setImage(imageUrl);

	const row = buildRowForApplication(application, dependentApps);

	return {
		isV2: false,
		sendPayload: { embeds: [embed], components: [row] },
		renderContext: { isV2: false, embed, row },
	};
}

// Scans recent messages to find existing panels
async function findVerifyMessage(verifyChannelObj, botId, applicationId) {
	const verificationMessages = await verifyChannelObj.messages.fetch({ limit: 50 }).catch(() => null);
	if (!verificationMessages) return null;

	const targetCustomIds = [`verifybutton_${applicationId}`, `verifyselect_${applicationId}`];

	return (
		verificationMessages.find(
			(m) =>
				(m.author.id === botId || m.webhookId !== null) &&
				!m.interaction &&
				(m.embeds.length > 0 ||
					(m.flags && Boolean(m.flags.bitfield & MessageFlags.IsComponentsV2)) ||
					m.components.length > 0) &&
				hasCustomId(m.components, targetCustomIds),
		) ?? null
	);
}

// Message send or edit via channel or webhook
async function dispatchMessage({
	target,
	payload,
	renderContext,
	existingMessageId,
	application,
	isV2,
	forceRecreate = false,
	findFallback = null,
}) {
	let existingMessage = null;

	if (existingMessageId) {
		try {
			existingMessage = await target.fetchMessage(existingMessageId);
		} catch {
			existingMessage = null;
		}
	}

	if (!existingMessage && findFallback) {
		existingMessage = await findFallback();
	}

	if (existingMessage) {
		const isExistingV2 = Boolean(
			(existingMessage.flags?.bitfield ?? existingMessage.flags) & MessageFlags.IsComponentsV2,
		);

		if (isExistingV2 !== isV2 || forceRecreate) {
			await target.delete(existingMessage).catch(() => {});
			existingMessage = null;
			await application.update({ verifymessage_id: null });
		}
	}

	if (!existingMessage) {
		const newMessage = await target.send(payload);
		return { messageId: newMessage?.id, action: target.createdAction };
	}

	if (messageNeedsUpdate(existingMessage, renderContext)) {
		try {
			await target.edit(existingMessage, payload);
			return { messageId: existingMessage.id, action: target.updatedAction };
		} catch (editError) {
			console.error(`Failed to edit message ${existingMessage.id} for app ${application.id}:`, editError);
			return { messageId: existingMessage.id, action: "error", error: editError.message };
		}
	}

	return { messageId: existingMessage.id, action: "no_changes" };
}

async function sendViaWebhook(
	webhook,
	name,
	avatarURL,
	application,
	appNeedsWebhookUpdate,
	panelContext,
	verifyChannelObj = null,
	botId = null,
) {
	const webhookData = decryptData(String(webhook.encrypted_token));
	if (!webhookData?.id || !webhookData.token) {
		throw new Error(`Invalid webhook data for channel ${webhook.channel_id}`);
	}

	const client = new WebhookClient({ id: webhookData.id, token: webhookData.token });

	try {
		const target = {
			createdAction: "webhook_created",
			updatedAction: "webhook_updated",
			fetchMessage: (id) => client.fetchMessage(id),
			send: (data) => client.send(data),
			edit: (msg, data) => client.editMessage(msg.id, data),
			delete: (msg) => client.deleteMessage(msg.id),
		};

		const payload = {
			username: name,
			avatarURL,
			withComponents: true,
			...panelContext.sendPayload,
		};

		return await dispatchMessage({
			target,
			payload,
			renderContext: panelContext.renderContext,
			existingMessageId: application.verifymessage_id,
			application,
			isV2: panelContext.isV2,
			forceRecreate: appNeedsWebhookUpdate,
			findFallback: verifyChannelObj && botId ? () => findVerifyMessage(verifyChannelObj, botId, application.id) : null,
		});
	} finally {
		client.destroy();
	}
}

async function sendOrUpdateMessage({
	application,
	dependentApps = [],
	verifyChannelObj,
	botId,
	panelConfig = {},
	appNeedsWebhookUpdate = false,
}) {
	const panelContext = buildPanelPayload(panelConfig, application, dependentApps);

	// If branding is enabled, attempt via guild webhook
	if (application.branding_enabled === true) {
		const webhook = await GuildWebhook.findOne({ where: { channel_id: verifyChannelObj.id } });
		if (webhook) {
			try {
				const name = application.custom_name || "Melpo Verifier";
				const avatarURL = application.custom_avatar_url || null;
				return await sendViaWebhook(
					webhook,
					name,
					avatarURL,
					application,
					appNeedsWebhookUpdate,
					panelContext,
					verifyChannelObj,
					botId,
				);
			} catch (error) {
				console.error("Error sending webhook, falling back to bot message:", error.message);
			}
		}
	}

	const target = {
		createdAction: "created",
		updatedAction: "updated",
		fetchMessage: async (id) => {
			const fetched = await verifyChannelObj.messages.fetch(id);
			return fetched && (fetched.author?.id === botId || fetched.webhookId !== null) ? fetched : null;
		},
		send: (data) => verifyChannelObj.send(data),
		edit: (msg, data) => msg.edit(data),
		delete: (msg) => msg.delete(),
	};

	return await dispatchMessage({
		target,
		payload: panelContext.sendPayload,
		renderContext: panelContext.renderContext,
		existingMessageId: application.verifymessage_id,
		application,
		isV2: panelContext.isV2,
		forceRecreate: false,
		findFallback: () => findVerifyMessage(verifyChannelObj, botId, application.id),
	});
}

// Syncs a single application's panel and updates verifymessage_id
async function syncSingleApplication(guild, botId, application, dependentApps = [], appNeedsWebhookUpdate = false) {
	if (!application.verifychannel) {
		return { action: "skipped_no_channel" };
	}

	const verifyChannelObj = await guild.channels.fetch(application.verifychannel).catch(() => null);
	if (!verifyChannelObj) {
		return { action: "skipped_channel_missing" };
	}

	const rawEmbedConfig = application.verifychannelembed || {};

	const result = await sendOrUpdateMessage({
		application,
		dependentApps,
		verifyChannelObj,
		botId,
		panelConfig: rawEmbedConfig,
		appNeedsWebhookUpdate,
	});

	if (result.messageId && result.messageId !== application.verifymessage_id) {
		await application.update({ verifymessage_id: result.messageId });
	}

	return result;
}

module.exports = {
	syncSingleApplication,
	sendOrUpdateMessage,
	sendViaWebhook,
	findVerifyMessage,
	buildRowForApplication,
	buildPanelPayload,
	dispatchMessage,
	DEFAULT_EMBED_COLOR,
};
