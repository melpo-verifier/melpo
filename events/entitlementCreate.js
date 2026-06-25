const { Events } = require("discord.js");
const { handleEntitlementCreate } = require("../js/monetization.js");

const eventName = Events.EntitlementCreate || "entitlementCreate";

module.exports = {
	name: eventName,
	async execute(entitlement, client) {
		console.log(`[${eventName}] Event received for userId=${entitlement?.userId}, skuId=${entitlement?.skuId}`);
		await handleEntitlementCreate(entitlement, client);
	},
};
