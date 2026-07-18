export const FAIR_GROWTH_ANNUAL_MONTHS_CHARGED = 11;
export const FAIR_GROWTH_ANNUAL_SERVICE_MONTHS = 12;
export const FAIR_GROWTH_ANNUAL_FEATURE_FLAG = "billing-fair-growth-annual";

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
