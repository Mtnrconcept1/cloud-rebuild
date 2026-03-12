interface CardWithId {
  id?: string | number | null;
}

export interface WeightedCampaignLike {
  id?: string | number | null;
  restaurant_id?: string | null;
  total_budget?: number | null;
  budget_daily?: number | null;
}

interface SponsoredPlacementOptions {
  topSlots?: number;
  maxItems?: number;
}

export interface WeightedCampaignRotationState {
  counts: Record<string, number>;
  lastShownOrder: Record<string, number>;
  sequence: number;
}

export function getCampaignBudgetWeight(campaign: WeightedCampaignLike): number {
  const totalBudget = Number(campaign?.total_budget || 0);
  if (totalBudget > 0) return totalBudget;

  const dailyBudget = Number(campaign?.budget_daily || 0);
  if (dailyBudget > 0) return dailyBudget;

  return 1;
}

export function pickWeightedCampaign<T extends WeightedCampaignLike>(
  campaigns: T[],
  state?: WeightedCampaignRotationState,
): { campaign: T | null; state: WeightedCampaignRotationState } {
  const normalizedState: WeightedCampaignRotationState = {
    counts: { ...(state?.counts || {}) },
    lastShownOrder: { ...(state?.lastShownOrder || {}) },
    sequence: Number(state?.sequence || 0),
  };

  const eligibleCampaigns = (campaigns || []).filter((campaign): campaign is T => {
    return campaign != null && campaign.id !== undefined && campaign.id !== null;
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

  const totalWeight = eligibleCampaigns.reduce((sum, campaign) => sum + getCampaignBudgetWeight(campaign), 0) || 1;

  const sortedCandidates = [...eligibleCampaigns].sort((left, right) => {
    const leftId = String(left.id);
    const rightId = String(right.id);
    const leftCount = normalizedState.counts[leftId] || 0;
    const rightCount = normalizedState.counts[rightId] || 0;
    const leftWeight = getCampaignBudgetWeight(left);
    const rightWeight = getCampaignBudgetWeight(right);
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

export function prioritizeSponsoredCards<T extends CardWithId>(
  organicCards: T[],
  sponsoredCards: T[],
  options: SponsoredPlacementOptions = {},
): T[] {
  const topSlots = Math.max(0, options.topSlots ?? 3);
  const maxItems = typeof options.maxItems === "number" ? Math.max(0, options.maxItems) : undefined;

  const organic = (organicCards || []) as T[];
  const sponsored = (sponsoredCards || []) as T[];

  if (!sponsored.length) {
    return typeof maxItems === "number" ? organic.slice(0, maxItems) : organic;
  }

  const seenSponsoredIds = new Set<string | number>();
  const uniqueSponsored = sponsored.filter((card) => {
    if (card == null) return false;
    const { id } = card;
    if (id === undefined || id === null) return true;
    if (seenSponsoredIds.has(id)) return false;
    seenSponsoredIds.add(id);
    return true;
  });

  const sponsoredIds = new Set(
    uniqueSponsored
      .map((card) => card.id)
      .filter((id): id is string | number => id !== undefined && id !== null),
  );

  const organicWithoutSponsored = organic.filter((card) => {
    if (card == null) return false;
    const { id } = card;
    if (id === undefined || id === null) return true;
    return !sponsoredIds.has(id);
  });

  const prioritizedSponsored = uniqueSponsored.slice(0, topSlots);
  const overflowSponsored = uniqueSponsored.slice(topSlots);
  const merged = [...prioritizedSponsored, ...organicWithoutSponsored, ...overflowSponsored];

  return typeof maxItems === "number" ? merged.slice(0, maxItems) : merged;
}
