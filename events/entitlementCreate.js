const { Events } = require("discord.js");
const { handleEntitlementCreate } = require("../js/monetization.js");

const eventName = Events.EntitlementCreate || "entitlementCreate";

module.exports = {
  name: eventName,
  async execute(entitlement, client) {
    await handleEntitlementCreate(entitlement, client);
  },
};
