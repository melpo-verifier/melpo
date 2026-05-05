const { PremiumSubscription } = require("../dbObjects.js");

const SUBSCRIPTION_SKUS = {
  "1476934433364906248": "Premium_1",
};

async function syncPremiumSubscription(entitlement, isActive) {
  const userId = entitlement.userId;
  const guildId = entitlement.guildId;
  const tier = SUBSCRIPTION_SKUS[entitlement.skuId] || "Premium_1";

  if (!guildId) return;

  let subscription = await PremiumSubscription.findOne({
    where: {
      guild_id: guildId,
      source: "DISCORD"
    }
  });

  if (isActive) {
    if (subscription) {
      // Update existing
      subscription.purchaser_id = userId;
      subscription.status = "ACTIVE";
      subscription.tier = tier;
      // subscription.expires_at = entitlement.endsAt || null;
      subscription.expires_at = null
      subscription.processed_ids = [...(subscription.processed_ids || []), entitlement.id]
      await subscription.save();
    } else {
      // Create new
      await PremiumSubscription.create({
        purchaser_id: userId,
        tier: tier,
        guild_id: guildId,
        source: "DISCORD",
        status: "ACTIVE",
        // expires_at: entitlement.endsAt || null,
        expires_at: null,
        processed_ids: [entitlement.id],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  } else if (subscription) {
    subscription.status = "EXPIRED";
    await subscription.save();
  }
}

function getUserId(entitlement, client) {
  if (entitlement?.userId) return entitlement.userId;

  if (entitlement?.guildId && client?.guilds?.cache) {
    const guild = client.guilds.cache.get(entitlement.guildId);
    return guild?.ownerId || null;
  }

  return null;
}

function isValid(entitlement) {
  if (!entitlement || entitlement.deleted || entitlement.consumed) return false;

  if (entitlement.endsAt) {
    return entitlement.endsAt.getTime() > Date.now();
  }

  return true;
}

async function handleEntitlementCreate(entitlement, client) {
  try {
    if (!entitlement?.skuId) return;

    const userId = getUserId(entitlement, client);
    if (!userId) return;

    if (SUBSCRIPTION_SKUS[entitlement.skuId]) {
      const isActive = isValid(entitlement);
      await syncPremiumSubscription(entitlement, isActive);
      return;
    }
  } catch (error) {
    console.error("Error handling entitlement create:", error);
  }
}

async function handleEntitlementUpdate(entitlement, client) {
  try {
    if (!entitlement?.skuId) return;

    const userId = getUserId(entitlement, client);
    if (!userId) return;

    if (SUBSCRIPTION_SKUS[entitlement.skuId]) {
      const isActive = isValid(entitlement);
      await syncPremiumSubscription(entitlement, isActive);
      return;
    }
  } catch (error) {
    console.error("Error handling entitlement update:", error);
  }
}

async function handleEntitlementDelete(entitlement) {
  try {
    if (!entitlement?.skuId || !SUBSCRIPTION_SKUS[entitlement.skuId]) return;

    //expire subscription
    await syncPremiumSubscription(entitlement, false);
    
    console.log(`[Discord] Entitlement deleted for Guild: ${entitlement.guildId}`);
  } catch (error) {
    console.error("Error handling entitlement delete:", error);
  }
}

module.exports = {
  handleEntitlementCreate,
  handleEntitlementUpdate,
  handleEntitlementDelete,
};
