interface CardWithId {
  id?: string | number | null;
  restaurant_id?: string | number | null;
  campaign_id?: string | number | null;
  sponsoredCampaignId?: string | number | null;
}

export interface WeightedCampaignLike {
  id?: string | number | null;
  restaurant_id?: string | null;
  total_budget?: number | string | null;
  budget_daily?: number | string | null;
  budget_amount?: number | string | null;
  spent?: number | string | null;
  daily_spent?: number | string | null;
  daily_spent_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  boost_weight?: number | string | null;
  relevance_score?: number | string | null;
  distance_score?: number | string | null;
  engagement_score?: number | string | null;
}

interface SponsoredPlacementOptions {
  topSlots?: number;
  maxItems?: number;
}

interface CampaignWeightOptions {
  now?: Date | number | string;
}

export interface SponsoredCampaignPlacementOptions extends CampaignWeightOptions {
  page?: string;
  maxSlots?: number;
  getPlacementBoost?: (campaign: WeightedCampaignLike, page: string) => number;
}

export interface WeightedCampaignRotationState {
  counts: Record<string, number>;
  lastShownOrder: Record<string, number>;
  sequence: number;
}

export type SponsoredCampaignPlacementStore = Record<string, WeightedCampaignRotationState>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toPositiveNumber(value: unknown) {
  return Math.max(0, toFiniteNumber(value));
}

function toMultiplier(value: unknown, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, numeric);
}

function resolveNow(options?: CampaignWeightOptions) {
  if (options?.now instanceof Date) return options.now;
  if (typeof options?.now === "number" || typeof options?.now === "string") {
    const parsed = new Date(options.now);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

function parseDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getRemainingDays(campaign: WeightedCampaignLike, now: Date) {
  const endsAt = parseDate(campaign.ends_at);
  if (!endsAt) return null;
  if (endsAt.getTime() <= now.getTime()) return 0;
  return Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / MS_PER_DAY));
}

function getTodayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function normalizeRotationState(state?: WeightedCampaignRotationState): WeightedCampaignRotationState {
  return {
    counts: { ...(state?.counts || {}) },
    lastShownOrder: { ...(state?.lastShownOrder || {}) },
    sequence: Number(state?.sequence || 0),
  };
}

function pruneRotationStateToIds(
  state: WeightedCampaignRotationState | undefined,
  activeIds: Set<string>,
): WeightedCampaignRotationState {
  const normalized = normalizeRotationState(state);

  return {
    counts: Object.fromEntries(
      Object.entries(normalized.counts).filter(([id]) => activeIds.has(id)),
    ),
    lastShownOrder: Object.fromEntries(
      Object.entries(normalized.lastShownOrder).filter(([id]) => activeIds.has(id)),
    ),
    sequence: normalized.sequence,
  };
}

function getCampaignRestaurantGroupKey(campaign: WeightedCampaignLike) {
  const relationId = (campaign as Record<string, any>)?.restaurants?.id;
  return campaign.restaurant_id ?? relationId ?? campaign.id ?? null;
}

export function getCampaignDeliveryScore(campaign: WeightedCampaignLike, options?: CampaignWeightOptions): number {
  const now = resolveNow(options);
  const remainingDays = getRemainingDays(campaign, now);
  if (remainingDays === 0) return 0;

  const totalBudget = toPositiveNumber(campaign.total_budget);
  const fallbackBudget = toPositiveNumber(campaign.budget_amount);
  const dailyBudget = toPositiveNumber(campaign.budget_daily);
  const spent = toPositiveNumber(campaign.spent);
  const remainingBudget = totalBudget > 0
    ? Math.max(0, totalBudget - spent)
    : Math.max(fallbackBudget, dailyBudget);

  if ((totalBudget > 0 || fallbackBudget > 0 || dailyBudget > 0) && remainingBudget <= 0) {
    return 0;
  }

  const pacingBudget = remainingDays && remainingBudget > 0
    ? remainingBudget / remainingDays
    : remainingBudget;
  const dailyBudgetPlan = dailyBudget > 0 ? dailyBudget : pacingBudget;
  const dailySpent = campaign.daily_spent_date === getTodayKey(now) ? toPositiveNumber(campaign.daily_spent) : 0;
  const dailyBudgetRemaining = dailyBudgetPlan > 0 ? Math.max(0, dailyBudgetPlan - dailySpent) : pacingBudget;

  if ((dailyBudget > 0 || dailyBudgetPlan > 0) && dailyBudgetRemaining <= 0) {
    return 0;
  }

  const baseScore = Math.max(0, Math.min(
    pacingBudget > 0 ? pacingBudget : Number.POSITIVE_INFINITY,
    dailyBudgetRemaining > 0 ? dailyBudgetRemaining : Number.POSITIVE_INFINITY,
  ));
  const normalizedBaseScore = Number.isFinite(baseScore) && baseScore > 0 ? baseScore : 1;
  const boostWeight = Math.max(0.1, toMultiplier(campaign.boost_weight, 1));
  const relevance = toMultiplier(campaign.relevance_score, 1);
  const distance = toMultiplier(campaign.distance_score, 1);
  const engagement = toMultiplier(campaign.engagement_score, 1);

  return normalizedBaseScore * boostWeight * relevance * distance * engagement;
}

export function getCampaignBudgetWeight(campaign: WeightedCampaignLike, options?: CampaignWeightOptions): number {
  const poolWeight = Number((campaign as Record<string, unknown>).__poolWeight || 0);
  if (poolWeight > 0) return poolWeight;
  return getCampaignDeliveryScore(campaign, options);
}

export function pickWeightedCampaign<T extends WeightedCampaignLike>(
  campaigns: T[],
  state?: WeightedCampaignRotationState,
  options?: CampaignWeightOptions,
): { campaign: T | null; state: WeightedCampaignRotationState } {
  const normalizedState: WeightedCampaignRotationState = {
    counts: { ...(state?.counts || {}) },
    lastShownOrder: { ...(state?.lastShownOrder || {}) },
    sequence: Number(state?.sequence || 0),
  };

  const eligibleCampaigns = (campaigns || []).filter((campaign): campaign is T => {
    return campaign != null
      && campaign.id !== undefined
      && campaign.id !== null
      && getCampaignBudgetWeight(campaign, options) > 0;
  });

  if (eligibleCampaigns.length === 0) {
    return { campaign: null, state: normalizedState };
  }

  if (eligibleCampaigns.length === 1) {
    const campaign = eligibleCampaigns[0];
    const campaignId = String(campaign.id);
    normalizedState.sequence += 1;
    normalizedState.counts[campaignId] = (normalizedState.counts[campaignId] || 0) + 1;
    normalizedState.lastShownOrder[campaignId] = normalizedState.sequence;
    return { campaign, state: normalizedState };
  }

  const totalShows = eligibleCampaigns.reduce((sum, campaign) => {
    const campaignId = String(campaign.id);
    return sum + (normalizedState.counts[campaignId] || 0);
  }, 0);

  const totalWeight = eligibleCampaigns.reduce((sum, campaign) => sum + getCampaignBudgetWeight(campaign, options), 0) || 1;

  const sortedCandidates = [...eligibleCampaigns].sort((left, right) => {
    const leftId = String(left.id);
    const rightId = String(right.id);
    const leftCount = normalizedState.counts[leftId] || 0;
    const rightCount = normalizedState.counts[rightId] || 0;
    const leftWeight = getCampaignBudgetWeight(left, options);
    const rightWeight = getCampaignBudgetWeight(right, options);
    const leftShare = leftWeight / totalWeight;
    const rightShare = rightWeight / totalWeight;
    const leftDeficit = ((totalShows + 1) * leftShare) - leftCount;
    const rightDeficit = ((totalShows + 1) * rightShare) - rightCount;

    if (rightDeficit !== leftDeficit) return rightDeficit - leftDeficit;
    if (leftCount !== rightCount) return leftCount - rightCount;

    const leftLastShown = normalizedState.lastShownOrder[leftId] || 0;
    const rightLastShown = normalizedState.lastShownOrder[rightId] || 0;
    if (leftLastShown !== rightLastShown) return leftLastShown - rightLastShown;

    if (rightWeight !== leftWeight) return rightWeight - leftWeight;
    return leftId.localeCompare(rightId);
  });

  const campaign = sortedCandidates[0];
  const campaignId = String(campaign.id);
  normalizedState.sequence += 1;
  normalizedState.counts[campaignId] = (normalizedState.counts[campaignId] || 0) + 1;
  normalizedState.lastShownOrder[campaignId] = normalizedState.sequence;

  return { campaign, state: normalizedState };
}

export function orderWeightedCampaigns<T extends WeightedCampaignLike>(
  campaigns: T[],
  state?: WeightedCampaignRotationState,
  options?: CampaignWeightOptions,
): { campaigns: T[]; state: WeightedCampaignRotationState } {
  let nextState: WeightedCampaignRotationState = {
    counts: { ...(state?.counts || {}) },
    lastShownOrder: { ...(state?.lastShownOrder || {}) },
    sequence: Number(state?.sequence || 0),
  };
  const remaining = [...(campaigns || [])];
  const ordered: T[] = [];

  while (remaining.length > 0) {
    const result = pickWeightedCampaign(remaining, nextState, options);
    nextState = result.state;
    if (!result.campaign) break;

    ordered.push(result.campaign);
    const selectedId = String(result.campaign.id);
    const selectedIndex = remaining.findIndex((campaign) => String(campaign.id) === selectedId);
    if (selectedIndex === -1) break;
    remaining.splice(selectedIndex, 1);
  }

  return { campaigns: ordered, state: nextState };
}

export function selectSponsoredCampaignPlacements<T extends WeightedCampaignLike>(
  campaigns: T[],
  store: SponsoredCampaignPlacementStore = {},
  options: SponsoredCampaignPlacementOptions = {},
): { campaigns: Array<T & { __poolWeight?: number }>; store: SponsoredCampaignPlacementStore } {
  const maxSlots = Math.min(3, Math.max(0, options.maxSlots ?? 3));
  const page = options.page || "default";
  const nextStore: SponsoredCampaignPlacementStore = { ...(store || {}) };

  if (!campaigns?.length || maxSlots === 0) {
    return { campaigns: [], store: nextStore };
  }

  const weightedCampaigns = campaigns
    .map((campaign) => {
      const placementBoost = options.getPlacementBoost
        ? Number(options.getPlacementBoost(campaign, page))
        : 1;
      const safePlacementBoost = Number.isFinite(placementBoost) ? Math.max(0, placementBoost) : 1;
      const score = getCampaignDeliveryScore(campaign, options) * safePlacementBoost;

      return {
        ...campaign,
        __poolWeight: score,
      };
    })
    .filter((campaign): campaign is T & { __poolWeight: number } => {
      return campaign != null
        && campaign.id !== undefined
        && campaign.id !== null
        && Number(campaign.__poolWeight || 0) > 0;
    });

  if (weightedCampaigns.length === 0) {
    return { campaigns: [], store: nextStore };
  }

  const groupedByRestaurant = new Map<string, Array<T & { __poolWeight: number }>>();
  for (const campaign of weightedCampaigns) {
    const key = getCampaignRestaurantGroupKey(campaign);
    if (key === undefined || key === null) continue;
    const restaurantKey = String(key);
    const group = groupedByRestaurant.get(restaurantKey) || [];
    group.push(campaign);
    groupedByRestaurant.set(restaurantKey, group);
  }

  const candidates: Array<{
    restaurantKey: string;
    restaurantStateKey: string;
    campaign: T & { __poolWeight: number };
    nextRestaurantState: WeightedCampaignRotationState;
  }> = [];

  for (const [restaurantKey, group] of groupedByRestaurant.entries()) {
    const restaurantStateKey = `restaurant:${restaurantKey}`;
    const result = pickWeightedCampaign(group, nextStore[restaurantStateKey], options);
    if (!result.campaign) continue;

    candidates.push({
      restaurantKey,
      restaurantStateKey,
      campaign: result.campaign,
      nextRestaurantState: result.state,
    });
  }

  if (candidates.length === 0) {
    return { campaigns: [], store: nextStore };
  }

  const candidateIds = new Set(candidates.map((candidate) => String(candidate.campaign.id)));
  const poolStateKey = `pool:${page}`;
  let poolState = pruneRotationStateToIds(nextStore[poolStateKey], candidateIds);
  const remaining = [...candidates];
  const visible: typeof candidates = [];

  while (remaining.length > 0 && visible.length < maxSlots) {
    const result = pickWeightedCampaign(
      remaining.map((candidate) => candidate.campaign),
      poolState,
      options,
    );
    poolState = result.state;
    if (!result.campaign) break;

    const selectedId = String(result.campaign.id);
    const selectedIndex = remaining.findIndex((candidate) => String(candidate.campaign.id) === selectedId);
    if (selectedIndex === -1) break;

    visible.push(remaining[selectedIndex]);
    remaining.splice(selectedIndex, 1);
  }

  nextStore[poolStateKey] = poolState;
  for (const selected of visible) {
    nextStore[selected.restaurantStateKey] = selected.nextRestaurantState;
  }

  return {
    campaigns: visible.map((selected) => selected.campaign),
    store: nextStore,
  };
}

function getSponsoredCardKey(card: CardWithId) {
  return card.campaign_id ?? card.sponsoredCampaignId ?? card.id ?? null;
}

function getRestaurantCardKey(card: CardWithId) {
  return card.restaurant_id ?? card.id ?? null;
}

export function prioritizeSponsoredCards<T extends CardWithId>(
  organicCards: T[],
  sponsoredCards: T[],
  options: SponsoredPlacementOptions = {},
): T[] {
  const topSlots = Math.min(3, Math.max(0, options.topSlots ?? 3));
  const maxItems = typeof options.maxItems === "number" ? Math.max(0, options.maxItems) : undefined;

  const organic = (organicCards || []) as T[];
  const sponsored = (sponsoredCards || []) as T[];

  if (!sponsored.length || topSlots === 0) {
    return typeof maxItems === "number" ? organic.slice(0, maxItems) : organic;
  }

  const seenSponsoredIds = new Set<string | number>();
  const uniqueSponsored = sponsored.filter((card) => {
    if (card == null) return false;
    const key = getSponsoredCardKey(card);
    if (key === undefined || key === null) return true;
    if (seenSponsoredIds.has(key)) return false;
    seenSponsoredIds.add(key);
    return true;
  });

  const sponsoredRestaurantIds = new Set<string | number>();
  const prioritizedSponsored: T[] = [];

  for (const card of uniqueSponsored) {
    const restaurantKey = getRestaurantCardKey(card);
    if (restaurantKey !== undefined && restaurantKey !== null) {
      if (sponsoredRestaurantIds.has(restaurantKey)) continue;
      sponsoredRestaurantIds.add(restaurantKey);
    }

    prioritizedSponsored.push(card);
    if (prioritizedSponsored.length >= topSlots) break;
  }

  const organicWithoutSponsored = organic.filter((card) => {
    if (card == null) return false;
    const restaurantKey = getRestaurantCardKey(card);
    if (restaurantKey === undefined || restaurantKey === null) return true;
    return !sponsoredRestaurantIds.has(restaurantKey);
  });

  const merged = [...prioritizedSponsored, ...organicWithoutSponsored];

  return typeof maxItems === "number" ? merged.slice(0, maxItems) : merged;
}
