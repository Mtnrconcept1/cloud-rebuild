export type FairGrowthPlanSlug = "starter" | "pro" | "premium" | "elite";
export type FairGrowthBillingPeriod = "monthly" | "yearly";

export type FairGrowthPlan = {
  slug: FairGrowthPlanSlug;
  publicName: string;
  monthlyPriceChf: number;
  marketplaceCommissionBps: number;
  includedEstablishments: number;
  additionalEstablishmentMonthlyChf: number | null;
};

/**
 * Version tarifaire persistée dans les snapshots restaurateur. Depuis août
 * 2026, la commission des commandes marketplace est fixe et identique pour
 * tous les abonnements : 10 % pour TOK, 90 % pour le restaurant.
 */
export const FAIR_GROWTH_PRICING_VERSION = "flat_marketplace_2026_08";

/**
 * Frais par table honorée. Forfaitaire : ni plafond sur le couvert, ni
 * distinction de source d'acquisition, ni remise selon le plan.
 */
export const RESERVATION_FLAT_FEE_CHF = 5;
export const FAIR_GROWTH_ANNUAL_MONTHS_CHARGED = 11;
export const FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS = 1000;
export const FAIR_GROWTH_STANDARD_VAT_BPS = 810;
export const FAIR_GROWTH_REDUCED_VAT_BPS = 260;

export const FAIR_GROWTH_PLANS: readonly FairGrowthPlan[] = [
  {
    slug: "starter",
    publicName: "Starter",
    monthlyPriceChf: 69,
    marketplaceCommissionBps: FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS,
    includedEstablishments: 1,
    additionalEstablishmentMonthlyChf: null,
  },
  {
    // The persisted slug stays "pro" for backwards compatibility.
    slug: "pro",
    publicName: "Business",
    monthlyPriceChf: 129,
    marketplaceCommissionBps: FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS,
    includedEstablishments: 1,
    additionalEstablishmentMonthlyChf: null,
  },
  {
    slug: "premium",
    publicName: "Premium",
    monthlyPriceChf: 199,
    marketplaceCommissionBps: FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS,
    includedEstablishments: 1,
    additionalEstablishmentMonthlyChf: null,
  },
  {
    slug: "elite",
    publicName: "Elite",
    monthlyPriceChf: 499,
    marketplaceCommissionBps: FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS,
    includedEstablishments: 3,
    additionalEstablishmentMonthlyChf: 149,
  },
] as const;

export function getFairGrowthPlan(slug: string | null | undefined) {
  return FAIR_GROWTH_PLANS.find((plan) => plan.slug === slug) || FAIR_GROWTH_PLANS[0];
}

export function getFairGrowthBillingAmountChf(
  monthlyPriceChf: number,
  billingPeriod: FairGrowthBillingPeriod,
) {
  return billingPeriod === "yearly"
    ? monthlyPriceChf * FAIR_GROWTH_ANNUAL_MONTHS_CHARGED
    : monthlyPriceChf;
}

/**
 * Public/restaurant-facing distribution only. Internal TOK revenue allocation
 * must remain server-side and must never be shipped in the client bundle.
 */
export function calculateFairGrowthOrderDistribution(input: {
  commissionableCents: number;
  tipCents?: number;
  deliveryPassThroughCents?: number;
  marketplaceCommissionBps?: number;
}) {
  const commissionableCents = Math.max(0, Math.round(input.commissionableCents));
  const tipCents = Math.max(0, Math.round(input.tipCents || 0));
  const deliveryPassThroughCents = Math.max(0, Math.round(input.deliveryPassThroughCents || 0));
  const marketplaceCommissionBps = Math.min(
    10_000,
    Math.max(0, Math.round(input.marketplaceCommissionBps ?? FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS)),
  );
  const platformCommissionCents = Math.min(
    commissionableCents,
    Math.round((commissionableCents * marketplaceCommissionBps) / 10_000),
  );

  return {
    grossCents: commissionableCents + tipCents + deliveryPassThroughCents,
    commissionableCents,
    platformCommissionCents,
    restaurantShareCents: commissionableCents - platformCommissionCents + tipCents,
    tipCents,
    deliveryPassThroughCents,
    stripeApplicationFeeCents: platformCommissionCents + deliveryPassThroughCents,
  };
}
