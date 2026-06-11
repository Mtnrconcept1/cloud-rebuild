export type CampaignPricing = {
  cpmRate: number;
  cpcRate: number;
  conversionRate: number;
};

export type CampaignPricingStrategy = "visibility" | "traffic" | "conversion";
export type CampaignPlacementOption = "banner" | "restaurant_cards";
export type CampaignPlacementSelection = Record<CampaignPlacementOption, boolean>;

export type CampaignBenchmarkSnapshot = {
  metaFoodCpmUsd: number;
  metaFoodCpcUsd: number;
  googleSearchFoodCpcUsd: number;
  googleSearchFoodCpaUsd: number;
  doordashPricingLabel: string;
  uberPricingLabel: string;
};

export type CampaignStrategyConfig = {
  key: CampaignPricingStrategy;
  label: string;
  shortLabel: string;
  description: string;
  recommendationHint: string;
  pricing: CampaignPricing;
  benchmarkCtr: number;
  benchmarkCvr: number;
  reachRatio: number;
  pageBoosts: Record<string, number>;
};

export type CampaignPlannerEstimate = {
  totalBudget: number;
  durationDays: number;
  dailyBudget: number;
  estimatedPeopleReached: number;
  projectedImpressions: number;
  projectedClicks: number;
  projectedConversions: number;
  blendedCostPerThousand: number;
  estimatedCpc: number;
  estimatedCpa: number;
};

export const CAMPAIGN_PLACEMENT_CONFIG: Record<CampaignPlacementOption, {
  key: CampaignPlacementOption;
  label: string;
  description: string;
  costPremium: number;
}> = {
  restaurant_cards: {
    key: "restaurant_cards",
    label: "Cartes restaurant",
    description: "Affichage dans les resultats et les rails de restaurants.",
    costPremium: 0,
  },
  banner: {
    key: "banner",
    label: "Banniere",
    description: "Affichage dans une bannière sponsorisée visible sur la page ciblée.",
    costPremium: 0.35,
  },
};

export const DEFAULT_CAMPAIGN_PLACEMENTS: CampaignPlacementSelection = {
  banner: false,
  restaurant_cards: true,
};

export const CAMPAIGN_MARKET_BENCHMARKS: CampaignBenchmarkSnapshot = {
  metaFoodCpmUsd: 7.5,
  metaFoodCpcUsd: 0.69,
  googleSearchFoodCpcUsd: 1.18,
  googleSearchFoodCpaUsd: 43.46,
  doordashPricingLabel: "Pay-per-order",
  uberPricingLabel: "Bid-based sponsored listing",
};

export const CAMPAIGN_STRATEGY_CONFIG: Record<CampaignPricingStrategy, CampaignStrategyConfig> = {
  visibility: {
    key: "visibility",
    label: "Visibilite",
    shortLabel: "Visibilite",
    description: "Touchez un maximum de personnes autour de votre restaurant.",
    recommendationHint: "Idéal pour faire connaître votre adresse et vos nouveautés.",
    pricing: {
      cpmRate: 6.5,
      cpcRate: 1.05,
      conversionRate: 12,
    },
    benchmarkCtr: 0.015,
    benchmarkCvr: 0.022,
    reachRatio: 0.72,
    pageBoosts: {
      home: 1.25,
      search: 1,
      flash_sales: 0.85,
      anti_waste: 0.85,
    },
  },
  traffic: {
    key: "traffic",
    label: "Trafic",
    shortLabel: "Trafic",
    description: "Faites venir plus de visiteurs sur votre fiche et vos offres.",
    recommendationHint: "Bon compromis pour generer des ouvertures de fiche et des clics.",
    pricing: {
      cpmRate: 8,
      cpcRate: 0.75,
      conversionRate: 10,
    },
    benchmarkCtr: 0.028,
    benchmarkCvr: 0.032,
    reachRatio: 0.61,
    pageBoosts: {
      home: 1.05,
      search: 1.3,
      flash_sales: 0.95,
      anti_waste: 0.95,
    },
  },
  conversion: {
    key: "conversion",
    label: "Conversion",
    shortLabel: "Conversion",
    description: "Cherchez d abord des commandes et réservations attribuables.",
    recommendationHint: "Le moteur privilegie les signaux qui menent a une action concrete.",
    pricing: {
      cpmRate: 9.5,
      cpcRate: 0.95,
      conversionRate: 7.5,
    },
    benchmarkCtr: 0.026,
    benchmarkCvr: 0.052,
    reachRatio: 0.52,
    pageBoosts: {
      home: 0.9,
      search: 1.1,
      flash_sales: 1.35,
      anti_waste: 1.35,
    },
  },
};

export const DEFAULT_CAMPAIGN_PRICING: CampaignPricing = CAMPAIGN_STRATEGY_CONFIG.conversion.pricing;

function toPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
  if (normalizedType === "banner") {
    return { banner: true, restaurant_cards: false };
  }
  if (normalizedType === "push") {
    return { banner: false, restaurant_cards: false };
  }
  return { ...DEFAULT_CAMPAIGN_PLACEMENTS };
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

export function campaignSupportsPlacement(
  campaign: { channels?: unknown; type?: unknown } | null | undefined,
  placement: CampaignPlacementOption,
) {
  return normalizeCampaignPlacementSelection(campaign?.channels, campaign?.type)[placement];
}

export function getCampaignPlacementCostMultiplier(
  placements: unknown,
  campaignType?: unknown,
) {
  const normalized = normalizeCampaignPlacementSelection(placements, campaignType);
  const premium = (Object.keys(CAMPAIGN_PLACEMENT_CONFIG) as CampaignPlacementOption[])
    .reduce((sum, placement) => (
      normalized[placement] ? sum + CAMPAIGN_PLACEMENT_CONFIG[placement].costPremium : sum
    ), 0);
  return round(1 + premium, 2);
}

export function calculateCampaignTotalCost(
  baseBudgetChf: unknown,
  placements: unknown,
  campaignType?: unknown,
) {
  const baseBudget = Math.max(0, Number(baseBudgetChf) || 0);
  return round(baseBudget * getCampaignPlacementCostMultiplier(placements, campaignType));
}

export function calculateCampaignBaseBudget(
  totalBudgetChf: unknown,
  placements: unknown,
  campaignType?: unknown,
) {
  const totalBudget = Math.max(0, Number(totalBudgetChf) || 0);
  const multiplier = getCampaignPlacementCostMultiplier(placements, campaignType);
  return multiplier > 0 ? round(totalBudget / multiplier) : totalBudget;
}

export function normalizeCampaignPricingStrategy(value: unknown, fallback: CampaignPricingStrategy = "conversion"): CampaignPricingStrategy {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "visibility" || normalized === "traffic" || normalized === "conversion") {
    return normalized;
  }
  return fallback;
}

export function getCampaignStrategyConfig(strategy: CampaignPricingStrategy | unknown) {
  const normalized = normalizeCampaignPricingStrategy(strategy);
  return CAMPAIGN_STRATEGY_CONFIG[normalized];
}

export function getCampaignPricing(
  input?: Partial<CampaignPricing> | null,
  strategy: CampaignPricingStrategy | unknown = "conversion",
): CampaignPricing {
  const defaults = getCampaignStrategyConfig(strategy).pricing;
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

export function estimateCampaignPlan(input: {
  totalBudgetChf: number;
  durationDays: number;
  strategy: CampaignPricingStrategy | unknown;
  pricing?: Partial<CampaignPricing> | null;
}) {
  const totalBudget = Math.max(0, Number(input.totalBudgetChf) || 0);
  const durationDays = Math.max(1, Math.round(Number(input.durationDays) || 1));
  const config = getCampaignStrategyConfig(input.strategy);
  const pricing = getCampaignPricing(input.pricing, config.key);
  const blendedCostPerImpression =
    (pricing.cpmRate / 1000)
    + (config.benchmarkCtr * pricing.cpcRate)
    + (config.benchmarkCtr * config.benchmarkCvr * pricing.conversionRate);

  if (totalBudget <= 0 || blendedCostPerImpression <= 0) {
    return {
      totalBudget,
      durationDays,
      dailyBudget: 0,
      estimatedPeopleReached: 0,
      projectedImpressions: 0,
      projectedClicks: 0,
      projectedConversions: 0,
      blendedCostPerThousand: 0,
      estimatedCpc: 0,
      estimatedCpa: 0,
    } satisfies CampaignPlannerEstimate;
  }

  const projectedImpressions = Math.floor(totalBudget / blendedCostPerImpression);
  const projectedClicks = Math.floor(projectedImpressions * config.benchmarkCtr);
  const projectedConversions = round(projectedClicks * config.benchmarkCvr, 1);
  const estimatedPeopleReached = Math.floor(projectedImpressions * config.reachRatio);

  return {
    totalBudget,
    durationDays,
    dailyBudget: round(totalBudget / durationDays),
    estimatedPeopleReached,
    projectedImpressions,
    projectedClicks,
    projectedConversions,
    blendedCostPerThousand: round(blendedCostPerImpression * 1000),
    estimatedCpc: projectedClicks > 0 ? round(totalBudget / projectedClicks) : 0,
    estimatedCpa: projectedConversions > 0 ? round(totalBudget / projectedConversions) : 0,
  } satisfies CampaignPlannerEstimate;
}

export function projectCampaignBenchmarkOutcomes(
  budgetChf: number,
  pricing?: Partial<CampaignPricing> | null,
  benchmark = CAMPAIGN_MARKET_BENCHMARKS,
) {
  return estimateCampaignPlan({
    totalBudgetChf: budgetChf,
    durationDays: 7,
    strategy: "traffic",
    pricing: {
      cpmRate: pricing?.cpmRate || DEFAULT_CAMPAIGN_PRICING.cpmRate,
      cpcRate: pricing?.cpcRate || DEFAULT_CAMPAIGN_PRICING.cpcRate,
      conversionRate: pricing?.conversionRate || DEFAULT_CAMPAIGN_PRICING.conversionRate,
    },
  });
}

export function getCampaignStrategyPlacementBoost(strategy: CampaignPricingStrategy | unknown, page: string) {
  const config = getCampaignStrategyConfig(strategy);
  return Number(config.pageBoosts[page] || 1);
}

export function recommendCampaignStrategy(input: {
  type?: string | null;
  targetPages?: string[] | null;
  hasFlashSales?: boolean;
  hasAntiWaste?: boolean;
  hasPriorConversions?: boolean;
}) {
  const type = String(input.type || "").trim().toLowerCase();
  const pages = (input.targetPages || []).map((page) => String(page || "").trim().toLowerCase());

  if (input.hasFlashSales || input.hasAntiWaste || pages.includes("flash_sales") || pages.includes("anti_waste")) {
    return "conversion" as const;
  }

  if (pages.includes("search")) {
    return "traffic" as const;
  }

  if (type === "banner" || pages.includes("home")) {
    return "visibility" as const;
  }

  if (input.hasPriorConversions) {
    return "conversion" as const;
  }

  return "traffic" as const;
}
