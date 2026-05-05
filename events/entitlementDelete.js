const { Events } = require("discord.js");
const { handleEntitlementDelete } = require("../js/monetization.js");

const eventName = Events.EntitlementDelete || "entitlementDelete";

module.exports = {
  name: eventName,
  async execute(entitlement) {
    await handleEntitlementDelete(entitlement);
  },
};
