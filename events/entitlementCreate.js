const { Events } = require("discord.js");
const { handleEntitlementCreate } = require("../js/monetization.js");

module.exports = {
	name: Events.EntitlementCreate,
	async execute(entitlement, client) {
		console.log(
			`[EntitlementCreate] Event received for userId=${entitlement?.userId}, skuId=${entitlement?.skuId}, other data:`,
		);
		console.log(entitlement);
		await handleEntitlementCreate(entitlement, client);
	},
};
