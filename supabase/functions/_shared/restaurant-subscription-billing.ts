export const FAIR_GROWTH_ANNUAL_MONTHS_CHARGED = 11;
export const FAIR_GROWTH_ANNUAL_SERVICE_MONTHS = 12;
export const FAIR_GROWTH_ANNUAL_FEATURE_FLAG = "billing-fair-growth-annual";
export const FAIR_GROWTH_STANDARD_VAT_BPS = 810;

export type RestaurantSubscriptionBillingPeriod = "monthly" | "yearly";

export function parseRestaurantSubscriptionBillingPeriod(
  value: unknown,
): RestaurantSubscriptionBillingPeriod | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "monthly" || normalized === "yearly") return normalized;
  return null;
}

export function getRestaurantSubscriptionStripeInterval(
  billingPeriod: RestaurantSubscriptionBillingPeriod,
): "month" | "year" {
  return billingPeriod === "yearly" ? "year" : "month";
}

export function getRestaurantSubscriptionAmountCents(
  monthlyPriceChf: unknown,
  billingPeriod: RestaurantSubscriptionBillingPeriod,
): number {
  const monthlyAmountCents = Math.round(Number(monthlyPriceChf) * 100);
  if (!Number.isSafeInteger(monthlyAmountCents) || monthlyAmountCents <= 0) return 0;
  return billingPeriod === "yearly"
    ? monthlyAmountCents * FAIR_GROWTH_ANNUAL_MONTHS_CHARGED
    : monthlyAmountCents;
}

export function isFairGrowthAnnualBillingEnabled(activeFlags: Set<string>): boolean {
  return activeFlags.has(FAIR_GROWTH_ANNUAL_FEATURE_FLAG);
}


export type RestaurantSubscriptionPricingPlan = {
  price_monthly_chf: unknown;
  annual_months_charged: unknown;
  acquired_reservation_fee_cents: unknown;
  marketplace_commission_bps: unknown;
  included_establishments: unknown;
  additional_establishment_price_cents: unknown;
  reservation_revenue_cap_bps: unknown;
  developer_order_bps: unknown;
  developer_tok_revenue_bps: unknown;
  pricing_version: unknown;
};

function requireIntegerInRange(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`INVALID_FAIR_GROWTH_PLAN_FIELD:${name}`);
  }
  return parsed;
}

export function buildRestaurantSubscriptionPricingSnapshot(
  plan: RestaurantSubscriptionPricingPlan,
  billingPeriod: RestaurantSubscriptionBillingPeriod,
) {
  const priceMonthlyCents = Math.round(Number(plan.price_monthly_chf) * 100);
  if (!Number.isSafeInteger(priceMonthlyCents) || priceMonthlyCents <= 0) {
    throw new Error("INVALID_FAIR_GROWTH_PLAN_FIELD:price_monthly_chf");
  }

  const annualMonthsCharged = requireIntegerInRange(
    plan.annual_months_charged,
    "annual_months_charged",
    1,
    12,
  );
  if (
    billingPeriod === "yearly"
    && annualMonthsCharged !== FAIR_GROWTH_ANNUAL_MONTHS_CHARGED
  ) {
    throw new Error("INVALID_FAIR_GROWTH_PLAN_FIELD:annual_months_charged");
  }

  const billingAmountCents = priceMonthlyCents
    * (billingPeriod === "yearly" ? annualMonthsCharged : 1);
  const billingVatCents = Math.round(
    (billingAmountCents * FAIR_GROWTH_STANDARD_VAT_BPS)
      / (10_000 + FAIR_GROWTH_STANDARD_VAT_BPS),
  );
  const additionalEstablishmentPrice = plan.additional_establishment_price_cents;
  const additionalEstablishmentPriceCents = additionalEstablishmentPrice == null
    ? null
    : requireIntegerInRange(
      additionalEstablishmentPrice,
      "additional_establishment_price_cents",
      1,
      100_000_000,
    );
  const pricingVersion = String(plan.pricing_version || "").trim();
  if (!pricingVersion) {
    throw new Error("INVALID_FAIR_GROWTH_PLAN_FIELD:pricing_version");
  }

  return {
    price_monthly_chf_snapshot: priceMonthlyCents / 100,
    billing_amount_chf_snapshot: billingAmountCents / 100,
    price_monthly_cents_snapshot: priceMonthlyCents,
    billing_amount_cents_snapshot: billingAmountCents,
    billing_net_cents_snapshot: billingAmountCents - billingVatCents,
    billing_vat_cents_snapshot: billingVatCents,
    vat_rate_bps_snapshot: FAIR_GROWTH_STANDARD_VAT_BPS,
    annual_months_charged_snapshot: annualMonthsCharged,
    acquired_reservation_fee_cents_snapshot: requireIntegerInRange(
      plan.acquired_reservation_fee_cents,
      "acquired_reservation_fee_cents",
      0,
      100_000,
    ),
    marketplace_commission_bps_snapshot: requireIntegerInRange(
      plan.marketplace_commission_bps,
      "marketplace_commission_bps",
      0,
      10_000,
    ),
    included_establishments_snapshot: requireIntegerInRange(
      plan.included_establishments,
      "included_establishments",
      1,
      100,
    ),
    additional_establishment_price_cents_snapshot: additionalEstablishmentPriceCents,
    reservation_revenue_cap_bps_snapshot: requireIntegerInRange(
      plan.reservation_revenue_cap_bps,
      "reservation_revenue_cap_bps",
      0,
      10_000,
    ),
    developer_order_bps_snapshot: requireIntegerInRange(
      plan.developer_order_bps,
      "developer_order_bps",
      0,
      10_000,
    ),
    developer_tok_revenue_bps_snapshot: requireIntegerInRange(
      plan.developer_tok_revenue_bps,
      "developer_tok_revenue_bps",
      0,
      10_000,
    ),
    pricing_version_snapshot: pricingVersion,
  };
}
