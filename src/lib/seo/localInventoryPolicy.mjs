const DEFAULT_POLICY = Object.freeze({
  minCityRestaurants: 3,
  minSpecializedRestaurants: 3,
  maxParentCoverage: 0.8,
});

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function inventoryCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function resolveLocalInventoryPolicy(options = {}) {
  return {
    minCityRestaurants: Math.max(1, positiveNumber(options.minCityRestaurants, DEFAULT_POLICY.minCityRestaurants)),
    minSpecializedRestaurants: Math.max(2, positiveNumber(options.minSpecializedRestaurants, DEFAULT_POLICY.minSpecializedRestaurants)),
    maxParentCoverage: Math.min(1, Math.max(0.1, positiveNumber(options.maxParentCoverage, DEFAULT_POLICY.maxParentCoverage))),
  };
}

export function getLocalInventoryDecision({ pageType, inventoryCount: countValue, parentInventoryCount, policy } = {}) {
  const resolved = resolveLocalInventoryPolicy(policy);
  const minimum = pageType === "city" ? resolved.minCityRestaurants : resolved.minSpecializedRestaurants;
  const count = inventoryCount(countValue);
  const parentCount = inventoryCount(parentInventoryCount);
  const reason = count < minimum
    ? "thin"
    : pageType !== "city" && parentCount > 0 && count >= parentCount * resolved.maxParentCoverage
      ? "parent-duplicate"
      : null;
  return { indexable: reason === null, reason, minimum };
}

function normalizeLocalPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  try {
    const url = new URL(value, "https://www.thetok.ch");
    if (url.origin !== "https://www.thetok.ch" || url.search || url.hash) return null;
    const pathname = url.pathname.replace(/\/+$/, "");
    return /^\/restaurants\/[^/]+(?:\/[^/]+)?$/.test(pathname) ? pathname : null;
  } catch {
    return null;
  }
}

// The document can survive client-side navigation. Its inventory belongs only to
// the route that produced it; applying it to another listing would leak noindex.
// itemListComplete covers this build's selection, not an unbounded remote catalog.
export function parseLocalInventorySnapshot(serialized, pathname) {
  if (typeof serialized !== "string") return null;
  try {
    const snapshot = JSON.parse(serialized);
    const route = normalizeLocalPath(pathname);
    if (!snapshot || snapshot.version !== 1 || !route || normalizeLocalPath(snapshot.path) !== route) return null;
    if (!["city", "cuisine", "district", "intent"].includes(snapshot.pageType)) return null;
    if ((snapshot.pageType === "city") !== /^\/restaurants\/[^/]+$/.test(route)) return null;
    if (snapshot.itemListComplete !== true || typeof snapshot.indexable !== "boolean") return null;
    if (!Number.isSafeInteger(snapshot.inventoryCount) || snapshot.inventoryCount < 0) return null;
    if (snapshot.parentInventoryCount !== null
      && (!Number.isSafeInteger(snapshot.parentInventoryCount) || snapshot.parentInventoryCount < 0)) return null;
    if (!snapshot.policy || typeof snapshot.policy !== "object" || Array.isArray(snapshot.policy)) return null;
    for (const key of Object.keys(DEFAULT_POLICY)) {
      if (typeof snapshot.policy[key] !== "number" || !Number.isFinite(snapshot.policy[key]) || snapshot.policy[key] <= 0) return null;
    }
    const policy = resolveLocalInventoryPolicy(snapshot.policy);
    const decision = getLocalInventoryDecision({ ...snapshot, policy });
    return {
      version: 1,
      path: route,
      pageType: snapshot.pageType,
      inventoryCount: snapshot.inventoryCount,
      parentInventoryCount: snapshot.parentInventoryCount,
      itemListComplete: true,
      policy,
      indexable: snapshot.indexable && decision.indexable,
    };
  } catch {
    return null;
  }
}
