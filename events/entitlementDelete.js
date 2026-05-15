const { Events } = require("discord.js");
const { handleEntitlementDelete } = require("../js/monetization.js");

const eventName = Events.EntitlementDelete || "entitlementDelete";

module.exports = {
  name: eventName,
  async execute(entitlement) {
    console.log(`[${eventName}] Event received for userId=${entitlement?.userId}, skuId=${entitlement?.skuId}`);
    await handleEntitlementDelete(entitlement);
  },
};
