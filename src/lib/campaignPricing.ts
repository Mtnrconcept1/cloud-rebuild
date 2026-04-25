export type CampaignPricing = {
  cpmRate: number;
  cpcRate: number;
  conversionRate: number;
};

export type CampaignBenchmarkSnapshot = {
  metaFoodCpmUsd: number;
  metaFoodCpcUsd: number;
  googleSearchFoodCpcUsd: number;
  googleSearchFoodCpaUsd: number;
  doordashPricingLabel: string;
  uberPricingLabel: string;
  benchmarkCtr: number;
  benchmarkCvr: number;
};

export const DEFAULT_CAMPAIGN_PRICING: CampaignPricing = {
  cpmRate: 8,
  cpcRate: 0.85,
  conversionRate: 9,
};

export const CAMPAIGN_MARKET_BENCHMARKS: CampaignBenchmarkSnapshot = {
  metaFoodCpmUsd: 7.5,
  metaFoodCpcUsd: 0.69,
  googleSearchFoodCpcUsd: 1.18,
  googleSearchFoodCpaUsd: 43.46,
  doordashPricingLabel: "Pay-per-order",
  uberPricingLabel: "Bid-based sponsored listing",
  benchmarkCtr: 0.0219,
  benchmarkCvr: 0.037,
};

function toPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function getCampaignPricing(input?: Partial<CampaignPricing> | null): CampaignPricing {
  const cpmRate = toPositiveNumber(input?.cpmRate);
  const cpcRate = toPositiveNumber(input?.cpcRate);
  const conversionRate = toPositiveNumber(input?.conversionRate);

  return {
    cpmRate: cpmRate || DEFAULT_CAMPAIGN_PRICING.cpmRate,
    cpcRate: cpcRate || DEFAULT_CAMPAIGN_PRICING.cpcRate,
    conversionRate: conversionRate || DEFAULT_CAMPAIGN_PRICING.conversionRate,
  };
}

export function getCampaignEventUnitCost(
  eventType: "impression" | "click" | "conversion",
  pricing?: Partial<CampaignPricing> | null,
  billable = true,
) {
  if (!billable) return 0;

  const normalized = getCampaignPricing(pricing);
  if (eventType === "impression") return round(normalized.cpmRate / 1000, 6);
  if (eventType === "click") return normalized.cpcRate;
  return normalized.conversionRate;
}

export function getCampaignObservedMetrics(input: {
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  spent?: number | null;
}) {
  const impressions = Math.max(0, Number(input.impressions) || 0);
  const clicks = Math.max(0, Number(input.clicks) || 0);
  const conversions = Math.max(0, Number(input.conversions) || 0);
  const spent = Math.max(0, Number(input.spent) || 0);

  return {
    effectiveCpm: impressions > 0 ? round((spent / impressions) * 1000) : 0,
    effectiveCpc: clicks > 0 ? round(spent / clicks) : 0,
    effectiveCpa: conversions > 0 ? round(spent / conversions) : 0,
  };
}

export function projectCampaignBenchmarkOutcomes(
  budgetChf: number,
  pricing?: Partial<CampaignPricing> | null,
  benchmark = CAMPAIGN_MARKET_BENCHMARKS,
) {
  const budget = Math.max(0, Number(budgetChf) || 0);
  const normalized = getCampaignPricing(pricing);
  const ctr = Math.max(0, Number(benchmark.benchmarkCtr) || 0);
  const cvr = Math.max(0, Number(benchmark.benchmarkCvr) || 0);

  const blendedCostPerImpression =
    (normalized.cpmRate / 1000)
    + (ctr * normalized.cpcRate)
    + (ctr * cvr * normalized.conversionRate);

  if (budget <= 0 || blendedCostPerImpression <= 0) {
    return {
      projectedImpressions: 0,
      projectedClicks: 0,
      projectedConversions: 0,
      blendedCostPerThousand: 0,
    };
  }

  const projectedImpressions = Math.floor(budget / blendedCostPerImpression);
  const projectedClicks = Math.floor(projectedImpressions * ctr);
  const projectedConversions = round(projectedClicks * cvr, 1);

  return {
    projectedImpressions,
    projectedClicks,
    projectedConversions,
    blendedCostPerThousand: round(blendedCostPerImpression * 1000),
  };
}
