export type FairGrowthPlanSlug = "starter" | "pro" | "premium" | "elite";
export type FairGrowthBillingPeriod = "monthly" | "yearly";

export type FairGrowthPlan = {
  slug: FairGrowthPlanSlug;
  publicName: string;
  monthlyPriceChf: number;
  acquiredReservationFeeChf: number;
  marketplaceCommissionBps: number;
  includedEstablishments: number;
  additionalEstablishmentMonthlyChf: number | null;
};

export type FairGrowthModule = {
  slug:
    | "no-show-shield"
    | "marketing-autopilot"
    | "margin-waste-pilot"
    | "ai-phone-receptionist"
    | "direct-order-saver"
    | "ai-reputation"
    | "gift-cards-experiences";
  name: string;
  monthlyPriceChf: number | null;
  variableFeeBps?: number;
  successfulReservationFeeChf?: number;
  paymentCostPassthrough?: boolean;
  availabilityStatus: "on_request" | "pilot";
  activationMode: "manual";
  description: string;
};

export const FAIR_GROWTH_PRICING_VERSION = "fair_growth_2026_07";
export const FAIR_GROWTH_ANNUAL_MONTHS_CHARGED = 11;
export const FAIR_GROWTH_RESERVATION_REVENUE_CAP_BPS = 700;
export const FAIR_GROWTH_DEVELOPER_ORDER_BPS = 100;
export const FAIR_GROWTH_DEVELOPER_TOK_REVENUE_BPS = 1000;
export const FAIR_GROWTH_STANDARD_VAT_BPS = 810;
export const FAIR_GROWTH_REDUCED_VAT_BPS = 260;

export const FAIR_GROWTH_PLANS: readonly FairGrowthPlan[] = [
  {
    slug: "starter",
    publicName: "Starter",
    monthlyPriceChf: 69,
    acquiredReservationFeeChf: 5,
    marketplaceCommissionBps: 990,
    includedEstablishments: 1,
    additionalEstablishmentMonthlyChf: null,
  },
  {
    // The persisted slug stays "pro" for backwards compatibility.
    slug: "pro",
    publicName: "Business",
    monthlyPriceChf: 129,
    acquiredReservationFeeChf: 4.5,
    marketplaceCommissionBps: 890,
    includedEstablishments: 1,
    additionalEstablishmentMonthlyChf: null,
  },
  {
    slug: "premium",
    publicName: "Premium",
    monthlyPriceChf: 199,
    acquiredReservationFeeChf: 4,
    marketplaceCommissionBps: 790,
    includedEstablishments: 1,
    additionalEstablishmentMonthlyChf: null,
  },
  {
    slug: "elite",
    publicName: "Elite",
    monthlyPriceChf: 499,
    acquiredReservationFeeChf: 3,
    marketplaceCommissionBps: 690,
    includedEstablishments: 3,
    additionalEstablishmentMonthlyChf: 149,
  },
] as const;

export const FAIR_GROWTH_MODULES: readonly FairGrowthModule[] = [
  {
    slug: "no-show-shield",
    availabilityStatus: "on_request",
    activationMode: "manual",
    name: "No-Show Shield",
    monthlyPriceChf: 39,
    description: "Empreinte, rappels et scoring du risque de no-show.",
  },
  {
    slug: "marketing-autopilot",
    availabilityStatus: "on_request",
    activationMode: "manual",
    name: "Marketing Autopilot IA",
    monthlyPriceChf: 79,
    description: "Campagnes et relances IA pilotées par les résultats.",
  },
  {
    slug: "margin-waste-pilot",
    availabilityStatus: "on_request",
    activationMode: "manual",
    name: "Margin & Waste Pilot",
    monthlyPriceChf: 59,
    description: "Recommandations de marge, stock et réduction du gaspillage.",
  },
  {
    slug: "ai-phone-receptionist",
    availabilityStatus: "pilot",
    activationMode: "manual",
    name: "Réceptionniste téléphonique IA",
    monthlyPriceChf: 49,
    successfulReservationFeeChf: 1.5,
    description: "Projet pilote d’accueil téléphonique et de prise de réservation assistée, après validation technique.",
  },
  {
    slug: "direct-order-saver",
    availabilityStatus: "pilot",
    activationMode: "manual",
    name: "Direct Order Saver",
    monthlyPriceChf: 149,
    variableFeeBps: 150,
    description: "Projet pilote de commande directe à commission réduite, après validation technique.",
  },
  {
    slug: "ai-reputation",
    availabilityStatus: "on_request",
    activationMode: "manual",
    name: "Réputation IA",
    monthlyPriceChf: 29,
    description: "Suivi des avis, brouillons de réponse et alertes.",
  },
  {
    slug: "gift-cards-experiences",
    availabilityStatus: "pilot",
    activationMode: "manual",
    name: "Cartes-cadeaux et expériences",
    monthlyPriceChf: null,
    variableFeeBps: 300,
    paymentCostPassthrough: true,
    description: "Projet pilote de cartes-cadeaux et d’expériences, après validation du parcours de paiement.",
  },
] as const;

export const FAIR_GROWTH_FREE_RESERVATION_SOURCES = [
  "restaurant_website",
  "qr_code",
  "instagram",
  "google",
  "customer_file",
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

export function calculateCappedReservationFeeChf(
  acquiredReservationFeeChf: number,
  attributedTableRevenueChf: number,
) {
  const feeCents = Math.max(0, Math.round(acquiredReservationFeeChf * 100));
  const revenueCents = Math.max(0, Math.round(attributedTableRevenueChf * 100));
  const cappedFeeCents = Math.round(
    revenueCents * FAIR_GROWTH_RESERVATION_REVENUE_CAP_BPS / 10_000,
  );
  return Math.min(feeCents, cappedFeeCents) / 100;
}

export function calculateFairGrowthOrderDistribution(input: {
  commissionableCents: number;
  tipCents?: number;
  deliveryPassThroughCents?: number;
  marketplaceCommissionBps: number;
}) {
  const commissionableCents = Math.max(0, Math.round(input.commissionableCents));
  const tipCents = Math.max(0, Math.round(input.tipCents || 0));
  const deliveryPassThroughCents = Math.max(0, Math.round(input.deliveryPassThroughCents || 0));
  const marketplaceCommissionBps = Math.min(10_000, Math.max(0, Math.round(input.marketplaceCommissionBps)));
  const platformCommissionCents = Math.min(
    commissionableCents,
    Math.round((commissionableCents * marketplaceCommissionBps) / 10_000),
  );
  const developerShareCents = Math.min(
    platformCommissionCents,
    Math.round((commissionableCents * FAIR_GROWTH_DEVELOPER_ORDER_BPS) / 10_000),
  );

  return {
    grossCents: commissionableCents + tipCents + deliveryPassThroughCents,
    commissionableCents,
    platformCommissionCents,
    developerShareCents,
    tokNetRevenueCents: platformCommissionCents - developerShareCents,
    restaurantShareCents: commissionableCents - platformCommissionCents + tipCents,
    tipCents,
    deliveryPassThroughCents,
    stripeApplicationFeeCents: platformCommissionCents + deliveryPassThroughCents,
  };
}

export function calculateDirectOrderSaverBreakEvenChf(
  comparisonCommissionBps = FAIR_GROWTH_PLANS[0].marketplaceCommissionBps,
) {
  const saverVariableBps = 150;
  const differenceBps = comparisonCommissionBps - saverVariableBps;
  if (differenceBps <= 0) return Number.POSITIVE_INFINITY;
  return 149 / (differenceBps / 10_000);
}
