const { Events } = require("discord.js");
const { handleEntitlementUpdate } = require("../js/monetization.js");

const eventName = Events.EntitlementUpdate || "entitlementUpdate";

module.exports = {
  name: eventName,
  async execute(entitlement, client) {
    await handleEntitlementUpdate(entitlement, client);
  },
};
