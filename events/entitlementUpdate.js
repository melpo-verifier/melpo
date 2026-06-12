const { Events } = require("discord.js");
const { handleEntitlementUpdate } = require("../js/monetization.js");

const eventName = Events.EntitlementUpdate || "entitlementUpdate";

module.exports = {
  name: eventName,
  async execute(entitlement, client) {
    console.log(`[${eventName}] Event received for userId=${entitlement?.userId}, skuId=${entitlement?.skuId}`);
    await handleEntitlementUpdate(entitlement, client);
  }
};
