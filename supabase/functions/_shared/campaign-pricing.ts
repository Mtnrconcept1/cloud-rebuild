export type CampaignPricing = {
  cpmRate: number;
  cpcRate: number;
  conversionRate: number;
};

export const DEFAULT_CAMPAIGN_PRICING: CampaignPricing = {
  cpmRate: 8,
  cpcRate: 0.85,
  conversionRate: 9,
};

function toPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
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
  if (eventType === "impression") return Math.round((normalized.cpmRate / 1000) * 1_000_000) / 1_000_000;
  if (eventType === "click") return normalized.cpcRate;
  return normalized.conversionRate;
}
