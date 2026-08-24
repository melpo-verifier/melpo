const { Events } = require("discord.js");
const { handleEntitlementUpdate } = require("../js/monetization.js");

module.exports = {
	name: Events.EntitlementUpdate,
	async execute(entitlement, client) {
		console.log(
			`[EntitlementUpdate] Event received for userId=${entitlement?.userId}, skuId=${entitlement?.skuId}, other data:`,
		);
		console.log(entitlement);
		await handleEntitlementUpdate(entitlement, client);
	},
};
