export const SPONSORED_ATTRIBUTION_KEY = "miamz-sponsored-attribution-v1";
export const SPONSORED_ATTRIBUTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const MAX_ATTRIBUTIONS_PER_RESTAURANT = 12;

export interface SponsoredAttribution {
  campaignId: string;
  clickedAt: string;
}

export type SponsoredAttributionStore = Record<string, SponsoredAttribution[]>;

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntry(value: unknown): SponsoredAttribution | null {
  if (!isRecord(value)) return null;

  const campaignId = typeof value.campaignId === "string" ? value.campaignId.trim() : "";
  const clickedAt = typeof value.clickedAt === "string" ? value.clickedAt.trim() : "";
  if (!campaignId || !clickedAt) return null;

  return { campaignId, clickedAt };
}

export function normalizeSponsoredAttributionStore(value: unknown): SponsoredAttributionStore {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<SponsoredAttributionStore>((store, [restaurantId, rawValue]) => {
    const normalizedRestaurantId = restaurantId.trim();
    if (!normalizedRestaurantId) return store;

    const entries = Array.isArray(rawValue)
      ? rawValue.map(normalizeEntry).filter((entry): entry is SponsoredAttribution => Boolean(entry))
      : [normalizeEntry(rawValue)].filter((entry): entry is SponsoredAttribution => Boolean(entry));

    if (entries.length === 0) return store;

    const deduped = new Map<string, SponsoredAttribution>();
    entries.forEach((entry) => {
      const existing = deduped.get(entry.campaignId);
      if (!existing || Date.parse(entry.clickedAt) >= Date.parse(existing.clickedAt)) {
        deduped.set(entry.campaignId, entry);
      }
    });

    store[normalizedRestaurantId] = [...deduped.values()]
      .sort((a, b) => Date.parse(b.clickedAt) - Date.parse(a.clickedAt))
      .slice(0, MAX_ATTRIBUTIONS_PER_RESTAURANT);
    return store;
  }, {});
}

export function readSponsoredAttributions(storage = getBrowserStorage()): SponsoredAttributionStore {
  if (!storage) return {};

  try {
    const raw = storage.getItem(SPONSORED_ATTRIBUTION_KEY);
    if (!raw) return {};
    return normalizeSponsoredAttributionStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeSponsoredAttributions(
  attributions: SponsoredAttributionStore,
  storage = getBrowserStorage(),
) {
  if (!storage) return;

  try {
    storage.setItem(SPONSORED_ATTRIBUTION_KEY, JSON.stringify(attributions));
  } catch {
    // Silent fail
  }
}

function pruneExpiredAttributions(
  attributions: SponsoredAttributionStore,
  nowMs = Date.now(),
) {
  const pruned = Object.entries(attributions).reduce<SponsoredAttributionStore>((store, [restaurantId, entries]) => {
    const validEntries = entries.filter((entry) => {
      const clickedAtMs = Date.parse(entry.clickedAt);
      return Number.isFinite(clickedAtMs) && (nowMs - clickedAtMs) <= SPONSORED_ATTRIBUTION_MAX_AGE_MS;
    });

    if (validEntries.length > 0) {
      store[restaurantId] = validEntries;
    }

    return store;
  }, {});

  return pruned;
}

export function rememberSponsoredAttribution(
  campaignId: string,
  restaurantId: string,
  nowMs = Date.now(),
  storage = getBrowserStorage(),
) {
  const normalizedCampaignId = campaignId.trim();
  const normalizedRestaurantId = restaurantId.trim();
  if (!normalizedCampaignId || !normalizedRestaurantId) return;

  const attributions = pruneExpiredAttributions(readSponsoredAttributions(storage), nowMs);
  const existingEntries = attributions[normalizedRestaurantId] || [];
  const clickedAt = new Date(nowMs).toISOString();
  const nextEntries = [
    { campaignId: normalizedCampaignId, clickedAt },
    ...existingEntries.filter((entry) => entry.campaignId !== normalizedCampaignId),
  ].slice(0, MAX_ATTRIBUTIONS_PER_RESTAURANT);

  writeSponsoredAttributions(
    {
      ...attributions,
      [normalizedRestaurantId]: nextEntries,
    },
    storage,
  );
}

export function getValidSponsoredAttributions(
  restaurantId: string,
  nowMs = Date.now(),
  storage = getBrowserStorage(),
) {
  const normalizedRestaurantId = restaurantId.trim();
  if (!normalizedRestaurantId) return [];

  const attributions = readSponsoredAttributions(storage);
  const pruned = pruneExpiredAttributions(attributions, nowMs);
  if (JSON.stringify(pruned) !== JSON.stringify(attributions)) {
    writeSponsoredAttributions(pruned, storage);
  }

  return pruned[normalizedRestaurantId] || [];
}

export function clearSponsoredAttributions(
  restaurantId: string,
  campaignIds?: string[],
  storage = getBrowserStorage(),
) {
  const normalizedRestaurantId = restaurantId.trim();
  if (!normalizedRestaurantId) return;

  const attributions = readSponsoredAttributions(storage);
  const existingEntries = attributions[normalizedRestaurantId] || [];
  const campaignIdSet = new Set((campaignIds || []).map((campaignId) => campaignId.trim()).filter(Boolean));

  if (campaignIdSet.size === 0) {
    delete attributions[normalizedRestaurantId];
  } else {
    const nextEntries = existingEntries.filter((entry) => !campaignIdSet.has(entry.campaignId));
    if (nextEntries.length > 0) {
      attributions[normalizedRestaurantId] = nextEntries;
    } else {
      delete attributions[normalizedRestaurantId];
    }
  }

  writeSponsoredAttributions(attributions, storage);
}
