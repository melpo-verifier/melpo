const { PremiumSubscription } = require("../dbObjects.js");
const { v4: uuidv4 } = require("uuid");

const SUBSCRIPTION_SKUS = {
  "1476941154112114760": "premium_1",
};

async function syncPremiumSubscription(entitlement, isActive, resolvedUserId) {
  const userId = resolvedUserId || entitlement.userId;
  const guildId = entitlement.guildId;
  const tier = SUBSCRIPTION_SKUS[entitlement.skuId] || "premium_1";

  console.log(`[sync] Starting for guild=${guildId} user=${userId} tier=${tier} isActive=${isActive}`);

  if (!guildId) {
    console.log(`[sync] No guildId, skipping`);
    return;
  }

  const { Op } = require("sequelize");
  const subscription = await PremiumSubscription.findOne({
    where: { guild_id: { [Op.contains]: [guildId] }, source: "DISCORD" },
  });

  console.log(`[sync] Existing subscription: ${subscription ? `found (status=${subscription.status})` : "none"}`);

  if (isActive) {
    if (subscription) {
      subscription.purchaser_id = userId;
      subscription.status = "ACTIVE";
      subscription.tier = tier;
      subscription.expires_at = null;
      subscription.processed_ids = [...(subscription.processed_ids || []), entitlement.id];
      await subscription.save();
      console.log(`[sync] Updated existing subscription to ACTIVE`);
    } else {
      await PremiumSubscription.create({
        id: uuidv4(),
        purchaser_id: userId,
        tier,
        guild_id: [guildId],
        source: "DISCORD",
        status: "ACTIVE",
        expires_at: null,
        processed_ids: [entitlement.id],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`[sync] Created new subscription`);
    }
  } else if (subscription) {
    subscription.status = "EXPIRED";
    await subscription.save();
    console.log(`[sync] Marked subscription as EXPIRED`);
  } else {
    console.log(`[sync] isActive=false but no subscription found.`);
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
  // if (!entitlement || entitlement.deleted || entitlement.consumed) return false;

  // if (entitlement.endsAt) {
  //   return entitlement.endsAt.getTime() > Date.now();
  // }
  if(!entitlement) return false;

  return true;
}

async function handleEntitlementCreate(entitlement, client) {
  console.log(`[create] entitlement — skuId=${entitlement?.skuId} guildId=${entitlement?.guildId} userId=${entitlement?.userId}`);
  try {
    if (!entitlement?.skuId) { console.log(`[create] No skuId, skipping`); return; }
    if (!SUBSCRIPTION_SKUS[entitlement.skuId]) { console.log(`[create] skuId not found, skipping`); return; }

    const userId = getUserId(entitlement, client);
    if (!userId) { console.log(`[create] Could not resolve userId, skipping`); return; }

    const isActive = isValid(entitlement);
    console.log(`[create] isValid=${isActive}`);
    await syncPremiumSubscription(entitlement, isActive, userId);
  } catch (error) {
    console.error(`[create] Error:`, error);
  }
}

async function handleEntitlementUpdate(entitlement, client) {
  console.log(`[update] entitlement — skuId=${entitlement?.skuId} guildId=${entitlement?.guildId} userId=${entitlement?.userId}`);
  try {
    if (!entitlement?.skuId) { console.log(`[update] No skuId, skipping`); return; }
    if (!SUBSCRIPTION_SKUS[entitlement.skuId]) { console.log(`[update] skuId not found, skipping`); return; }

    const userId = getUserId(entitlement, client);
    if (!userId) { console.log(`[update] Could not resolve userId, skipping`); return; }

    const isActive = isValid(entitlement);
    console.log(`[update] isValid=${isActive}`);
    await syncPremiumSubscription(entitlement, isActive, userId);
  } catch (error) {
    console.error(`[update] Error:`, error);
  }
}

async function handleEntitlementDelete(entitlement) {
  console.log(`[delete] entitlement — skuId=${entitlement?.skuId} guildId=${entitlement?.guildId}`);
  try {
    if (!entitlement?.skuId || !SUBSCRIPTION_SKUS[entitlement.skuId]) {
      console.log(`[delete] skuId missing or not found, skipping`);
      return;
    }
    await syncPremiumSubscription(entitlement, false, entitlement.userId);
  } catch (error) {
    console.error(`[delete] Error:`, error);
  }
}

module.exports = {
  handleEntitlementCreate,
  handleEntitlementUpdate,
  handleEntitlementDelete,
};