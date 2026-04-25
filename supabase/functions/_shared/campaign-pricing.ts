export type CampaignPricing = {
  cpmRate: number;
  cpcRate: number;
  conversionRate: number;
};

export type CampaignPricingStrategy = "visibility" | "traffic" | "conversion";

export const CAMPAIGN_STRATEGY_PRICING: Record<CampaignPricingStrategy, CampaignPricing> = {
  visibility: {
    cpmRate: 6.5,
    cpcRate: 1.05,
    conversionRate: 12,
  },
  traffic: {
    cpmRate: 8,
    cpcRate: 0.75,
    conversionRate: 10,
  },
  conversion: {
    cpmRate: 9.5,
    cpcRate: 0.95,
    conversionRate: 7.5,
  },
};

export const DEFAULT_CAMPAIGN_PRICING: CampaignPricing = CAMPAIGN_STRATEGY_PRICING.conversion;

function toPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function normalizeCampaignPricingStrategy(value: unknown, fallback: CampaignPricingStrategy = "conversion"): CampaignPricingStrategy {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "visibility" || normalized === "traffic" || normalized === "conversion") {
    return normalized;
  }
  return fallback;
}

export function getCampaignPricing(
  input?: Partial<CampaignPricing> | null,
  strategy: CampaignPricingStrategy | unknown = "conversion",
): CampaignPricing {
  const normalizedStrategy = normalizeCampaignPricingStrategy(strategy);
  const defaults = CAMPAIGN_STRATEGY_PRICING[normalizedStrategy];
  const cpmRate = toPositiveNumber(input?.cpmRate);
  const cpcRate = toPositiveNumber(input?.cpcRate);
  const conversionRate = toPositiveNumber(input?.conversionRate);

  return {
    cpmRate: cpmRate || defaults.cpmRate,
    cpcRate: cpcRate || defaults.cpcRate,
    conversionRate: conversionRate || defaults.conversionRate,
  };
}

export function getCampaignEventUnitCost(
  eventType: "impression" | "click" | "conversion",
  pricing?: Partial<CampaignPricing> | null,
  billable = true,
  strategy: CampaignPricingStrategy | unknown = "conversion",
) {
  if (!billable) return 0;

  const normalized = getCampaignPricing(pricing, strategy);
  if (eventType === "impression") return Math.round((normalized.cpmRate / 1000) * 1_000_000) / 1_000_000;
  if (eventType === "click") return normalized.cpcRate;
  return normalized.conversionRate;
}
