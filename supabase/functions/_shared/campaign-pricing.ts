export type CampaignPricing = {
  cpmRate: number;
  cpcRate: number;
  conversionRate: number;
};

export type CampaignPricingStrategy = "visibility" | "traffic" | "conversion";
export type CampaignPlacementOption = "banner" | "restaurant_cards";
export type CampaignPlacementSelection = Record<CampaignPlacementOption, boolean>;

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
export const CAMPAIGN_PLACEMENT_PREMIUMS: Record<CampaignPlacementOption, number> = {
  restaurant_cards: 0,
  banner: 0.35,
};

export const DEFAULT_CAMPAIGN_PLACEMENTS: CampaignPlacementSelection = {
  banner: false,
  restaurant_cards: true,
};

function toPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readBoolean(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof source[key] === "boolean") return source[key] as boolean;
  }
  return undefined;
}

function getDefaultPlacementsForType(type: unknown): CampaignPlacementSelection {
  const normalizedType = String(type || "").trim().toLowerCase();
  if (normalizedType === "banner") return { banner: true, restaurant_cards: false };
  if (normalizedType === "push") return { banner: false, restaurant_cards: false };
  return { ...DEFAULT_CAMPAIGN_PLACEMENTS };
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalizeCampaignPlacementSelection(
  value: unknown,
  campaignType?: unknown,
): CampaignPlacementSelection {
  const source = isRecord(value) ? value : {};
  const defaults = getDefaultPlacementsForType(campaignType);
  const banner = readBoolean(source, ["banner", "campaign_banner"]);
  const restaurantCards = readBoolean(source, [
    "restaurant_cards",
    "restaurantCards",
    "cards",
    "sponsored_cards",
  ]);
  const normalized = {
    banner: banner ?? defaults.banner,
    restaurant_cards: restaurantCards ?? defaults.restaurant_cards,
  };

  if (!normalized.banner && !normalized.restaurant_cards) {
    return campaignType === "push" ? normalized : { ...DEFAULT_CAMPAIGN_PLACEMENTS };
  }

  return normalized;
}

export function getCampaignPlacementCostMultiplier(placements: unknown, campaignType?: unknown) {
  const normalized = normalizeCampaignPlacementSelection(placements, campaignType);
  const premium = (Object.keys(CAMPAIGN_PLACEMENT_PREMIUMS) as CampaignPlacementOption[])
    .reduce((sum, placement) => (
      normalized[placement] ? sum + CAMPAIGN_PLACEMENT_PREMIUMS[placement] : sum
    ), 0);
  return round(1 + premium, 2);
}

export function calculateCampaignTotalCost(baseBudgetChf: unknown, placements: unknown, campaignType?: unknown) {
  const baseBudget = Math.max(0, Number(baseBudgetChf) || 0);
  return round(baseBudget * getCampaignPlacementCostMultiplier(placements, campaignType));
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
