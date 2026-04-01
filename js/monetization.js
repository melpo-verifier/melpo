const { UserBilling } = require("../dbObjects.js");

const DEFAULT_TIER = "normal";
const MAX_PROCESSED_IDS = 100;

const SUBSCRIPTION_SKUS = {
  "1476934433364906248": "normal",
};

const CONSUMABLE_SKUS = {
  "1476983795902058677": 12,
};

function isSubscriptionSku(skuId) {
  return !!(skuId && SUBSCRIPTION_SKUS[skuId]);
}

function getTierForSku(skuId) {
  return (skuId && SUBSCRIPTION_SKUS[skuId]) || DEFAULT_TIER;
}

function getCreditsForSku(skuId) {
  const credits = skuId ? CONSUMABLE_SKUS[skuId] : 0;
  return Number.isFinite(credits) ? credits : 0;
}

function isEntitlementValid(entitlement) {
  if (!entitlement || entitlement.deleted || entitlement.consumed) return false;

  if (entitlement.endsAt) {
    return entitlement.endsAt.getTime() > Date.now();
  }

  return true;
}

function getUserIdFromEntitlement(entitlement, client) {
  if (entitlement?.userId) return entitlement.userId;

  if (entitlement?.guildId && client?.guilds?.cache) {
    const guild = client.guilds.cache.get(entitlement.guildId);
    return guild?.ownerId || null;
  }

  return null;
}

function findActiveSubscriptionEntitlement(client, userId, guildId) {
  const cache = client?.application?.entitlements?.cache;
  if (!cache) return null;

  return cache.find((ent) => {
    if (!isSubscriptionSku(ent.skuId) || !isEntitlementValid(ent)) return false;
    if (userId && ent.userId === userId) return true;
    if (!userId && guildId && ent.guildId === guildId) return true;
    return false;
  }) || null;
}

async function getOrCreateBillingRecord(userId) {
  if (!userId) return null;

  const [record] = await UserBilling.findOrCreate({
    where: { user_id: userId },
  });

  return record;
}

async function updateSubscription(userId, isActive, tier) {
  const record = await getOrCreateBillingRecord(userId);
  if (!record) return;

  const nextTier = isActive ? tier : DEFAULT_TIER;
  if (record.has_active_subscription === isActive && record.subscription_tier === nextTier) {
    return;
  }

  record.has_active_subscription = isActive;
  record.subscription_tier = nextTier;
  await record.save();
}

function hasProcessedId(record, entitlementId) {
  if (!record || !entitlementId) return false;
  const processed = Array.isArray(record.processed_entitlement_ids) ? record.processed_entitlement_ids : [];
  return processed.includes(entitlementId);
}

function addProcessedId(record, entitlementId) {
  if (!record || !entitlementId) return;
  const processed = Array.isArray(record.processed_entitlement_ids) ? [...record.processed_entitlement_ids] : [];
  if (!processed.includes(entitlementId)) {
    processed.push(entitlementId);
  }
  record.processed_entitlement_ids = processed.slice(-MAX_PROCESSED_IDS);
}

async function addCredits(userId, entitlementId, credits) {
  if (!userId || !entitlementId || credits <= 0) return;

  const record = await getOrCreateBillingRecord(userId);
  if (!record || hasProcessedId(record, entitlementId)) return;

  record.custom_bot_credits += credits;
  addProcessedId(record, entitlementId);
  await record.save();
}

async function handleEntitlementCreate(entitlement, client) {
  try {
    if (!entitlement?.skuId) return;

    const userId = getUserIdFromEntitlement(entitlement, client);
    if (!userId) return;

    if (isSubscriptionSku(entitlement.skuId)) {
      const isActive = isEntitlementValid(entitlement);
      const tier = getTierForSku(entitlement.skuId);
      await updateSubscription(userId, isActive, tier);
      return;
    }

    const credits = getCreditsForSku(entitlement.skuId);
    if (credits <= 0 || !isEntitlementValid(entitlement)) return;

    await addCredits(userId, entitlement.id, credits);
  } catch (error) {
    console.error("Error handling entitlement create:", error);
  }
}

async function handleEntitlementUpdate(entitlement, client) {
  try {
    if (!entitlement?.skuId) return;

    const userId = getUserIdFromEntitlement(entitlement, client);
    if (!userId) return;

    if (isSubscriptionSku(entitlement.skuId)) {
      const isActive = isEntitlementValid(entitlement);
      const tier = getTierForSku(entitlement.skuId);
      await updateSubscription(userId, isActive, tier);
      return;
    }

    const credits = getCreditsForSku(entitlement.skuId);
    if (credits <= 0 || !isEntitlementValid(entitlement)) return;

    const record = await getOrCreateBillingRecord(userId);
    if (record && !hasProcessedId(record, entitlement.id)) {
      await addCredits(userId, entitlement.id, credits);
    }
  } catch (error) {
    console.error("Error handling entitlement update:", error);
  }
}

async function handleEntitlementDelete(entitlement, client) {
  try {
    if (!entitlement?.skuId || !isSubscriptionSku(entitlement.skuId)) return;

    const userId = getUserIdFromEntitlement(entitlement, client);
    if (!userId) return;

    const active = findActiveSubscriptionEntitlement(client, userId, entitlement.guildId);
    if (active) {
      const tier = getTierForSku(active.skuId);
      await updateSubscription(userId, true, tier);
      return;
    }

    await updateSubscription(userId, false, DEFAULT_TIER);
  } catch (error) {
    console.error("Error handling entitlement delete:", error);
  }
}

module.exports = {
  handleEntitlementCreate,
  handleEntitlementUpdate,
  handleEntitlementDelete,
};
