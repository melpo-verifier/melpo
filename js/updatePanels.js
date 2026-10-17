const { Application } = require("../dbObjects.js");
const {
	syncSingleApplication,
	sendOrUpdateMessage,
	sendViaWebhook,
	findVerifyMessage,
	buildRowForApplication,
	buildPanelPayload,
	dispatchMessage,
	DEFAULT_EMBED_COLOR,
} = require("./updatePanelsHelpers/panelSync.js");
const {
	buildV2Components,
	buildBlock,
	buildSelectMenuRow,
	buildV2Button,
	buildV2SectionBlock,
	processActionRowBlock,
	appendBlockToContainer,
	appendBlockToMessage,
	resolveButtonStyle,
} = require("./updatePanelsHelpers/v2ComponentBuilder.js");
const {
	messageNeedsUpdate,
	normalizeComponent,
	normalizeEmoji,
	normalizeColor,
	areComponentsEqual,
	hasCustomId,
} = require("./updatePanelsHelpers/messageComparator.js");
const { resolveColor } = require("discord.js");

const isValidHexColor = (color) => {
	const hexColorRegex = /^#?[0-9A-Fa-f]{6}$/;
	const hexTest = hexColorRegex.test(color);

	if (!hexTest) {
		return false;
	}
	try {
		const test = resolveColor(color) !== null;
		return test;
	} catch {
		return false;
	}
};

/**
 * Loops through all applications in a server to sync their application panels.
 *
 * Panel Logic:
 * - An application is treated as a "root" if it has no mainMessageApplicationId,
 *   references itself (mainMessageApplicationId === app.id), or its mainMessageApplicationId
 *   points at an application that no longer exists in this server.
 * - Every other application is a "dependent" and shows up as an option on its root's
 *   select menu instead of getting its own message.
 *
 * @param {import("discord.js").Guild} guild
 * @param {string} botId
 * @param {Array<string|number>} [webhookUpdated=[]] - Application IDs whose webhook profile updated.
 * @returns {Promise<Array<{ appId: string|number, action: string, messageId?: string, error?: string }>>}
 */
async function syncApplicationPanels(guild, botId, webhookUpdated = []) {
	const applications = await Application.findAll({ where: { server_id: guild.id } });
	const appById = new Map(applications.map((app) => [app.id, app]));

	const dependentsByRoot = new Map();
	const rootApps = [];

	for (const app of applications) {
		const isSelfReferencing = app.mainMessageApplicationId === app.id;
		const referencesValidMain =
			!isSelfReferencing && app.mainMessageApplicationId && appById.has(app.mainMessageApplicationId);

		if (referencesValidMain) {
			const list = dependentsByRoot.get(app.mainMessageApplicationId) ?? [];
			list.push(app);
			dependentsByRoot.set(app.mainMessageApplicationId, list);
		} else {
			rootApps.push(app);
		}
	}

	const results = [];
	for (const app of rootApps) {
		const dependentApps = dependentsByRoot.get(app.id) ?? [];
		try {
			const appNeedsWebhookUpdate = Array.isArray(webhookUpdated) && webhookUpdated.includes(app.id);
			const result = await syncSingleApplication(guild, botId, app, dependentApps, appNeedsWebhookUpdate);
			results.push({ appId: app.id, ...result });
		} catch (error) {
			console.error(`Failed to sync application panel for application ${app.id} (${app.name}):`, error);
			results.push({ appId: app.id, action: "error", error: error.message });
		}
	}

	return results;
}

module.exports = {
	syncApplicationPanels,
	syncSingleApplication,
	sendOrUpdateMessage,
	sendViaWebhook,
	findVerifyMessage,
	buildRowForApplication,
	buildPanelPayload,
	dispatchMessage,
	buildV2Components,
	buildBlock,
	buildSelectMenuRow,
	buildV2Button,
	buildV2SectionBlock,
	processActionRowBlock,
	appendBlockToContainer,
	appendBlockToMessage,
	messageNeedsUpdate,
	normalizeComponent,
	normalizeEmoji,
	normalizeColor,
	areComponentsEqual,
	hasCustomId,
	isValidHexColor,
	resolveButtonStyle,
	DEFAULT_EMBED_COLOR,
};
