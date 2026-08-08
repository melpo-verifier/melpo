const { Events } = require("discord.js");
const { handleEntitlementDelete } = require("../js/monetization.js");

module.exports = {
	name: Events.EntitlementDelete,
	async execute(entitlement) {
		console.log(
			`[EntitlementDelete] Event received for userId=${entitlement?.userId}, skuId=${entitlement?.skuId}, other data:`,
		);
		console.log(entitlement);
		await handleEntitlementDelete(entitlement);
	},
};
