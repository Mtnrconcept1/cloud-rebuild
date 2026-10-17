import { describe, expect, it } from "vitest";
import { assertTokOneSubscriptionSelection, assertTokOneRecurringQuoteAccepted, buildTokOneRecurringQuote, buildTokOnePlanQuote, assertTokOnePlanPriceAccepted } from "../../supabase/functions/_shared/tok-one-recurring-quote";

const fixed = () => ({ livemode: false, status: "active", metadata: { user_id: "caller" }, cancel_at_period_end: true,
  items: { data: [{ quantity: 1, current_period_end: 1800000000, price: { currency: "chf", livemode: false, billing_scheme: "per_unit", unit_amount: 990, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } }], has_more: false },
});
const build = (stripeSubscription: unknown = fixed()) => buildTokOneRecurringQuote({ subscriptionId: "sub-row", stripeMode: "test", userId: "caller", stripeSubscription, now: new Date("2026-10-17T12:00:00Z") });
describe("native TOK One exact recurring quote", () => {
  it("protects new subscription price consent while preserving native callers without an expected recap", () => {
    const plan = { id: "plan", name: "TOK One", price_monthly: 9.90, status: "active" };
    expect(buildTokOnePlanQuote(plan)).toMatchObject({ recurring_amount_cents: 990, interval: "month", trial_days: 14, cancellation_notice_days: 3 });
    const accepted = { expected_plan_id: "plan", expected_recurring_amount_cents: 990, expected_currency: "CHF", expected_interval: "month", expected_interval_count: 1 };
    expect(() => assertTokOnePlanPriceAccepted(plan, {})).not.toThrow();
    expect(() => assertTokOnePlanPriceAccepted(plan, accepted)).not.toThrow();
    expect(() => assertTokOnePlanPriceAccepted({ ...plan, price_monthly: 12 }, accepted)).toThrow("price_changed_requote");
    expect(() => assertTokOnePlanPriceAccepted(plan, { ...accepted, expected_plan_id: "other" })).toThrow("price_changed_requote");
    expect(() => assertTokOnePlanPriceAccepted(plan, { ...accepted, expected_currency: "EUR" })).toThrow("price_changed_requote");
  });
  it("reads fixed CHF billing without mutation or secret/provider identifiers", () => {
    expect(build()).toEqual({ subscription_id: "sub-row", stripe_mode: "test", recurring_amount_cents: 990, currency: "CHF", interval: "month", interval_count: 1, current_period_end: "2027-01-15T08:00:00.000Z", cancel_at_period_end: true, checked_at: "2026-10-17T12:00:00.000Z", requires_confirmation: true, mutation_executed: false });
  });
  it("pins the selected row and preserves callers omitting subscription_id", () => {
    expect(() => assertTokOneSubscriptionSelection("a", undefined)).not.toThrow();
    expect(() => assertTokOneSubscriptionSelection("a", "a")).not.toThrow();
    expect(() => assertTokOneSubscriptionSelection("a", "b")).toThrow("subscription_changed");
  });
  it.each([
    { livemode: true }, { status: "canceled" }, { metadata: { user_id: "another" } },
    { discounts: [{ id: "discount" }] }, { automatic_tax: { enabled: true } }, { schedule: "schedule" },
    { default_tax_rates: ["tax"] }, { pending_update: {} },
    { items: { data: [] } },
  ])("fails closed for unverifiable provider data %j", (patch) => {
    expect(() => build({ ...fixed(), ...patch })).toThrow("price_not_verifiable");
  });
  it.each([{ unit_amount: null }, { unit_amount: 9.9 }, { currency: "eur" }, { billing_scheme: "tiered" }, { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }])("rejects complex or invalid prices %j", (patch) => {
    const value = fixed(); Object.assign(value.items.data[0].price, patch);
    expect(() => build(value)).toThrow("price_not_verifiable");
  });
  it("requires explicit matching amount, currency, interval and selected subscription", () => {
    const quote = build();
    const accepted = { subscription_id: "sub-row", confirmed_by_user: true, expected_recurring_amount_cents: 990, expected_currency: "CHF", expected_interval: "month", expected_interval_count: 1 };
    expect(() => assertTokOneRecurringQuoteAccepted(quote, accepted)).not.toThrow();
    for (const patch of [{ expected_recurring_amount_cents: 991 }, { expected_interval: "year" }, { subscription_id: "other" }, { expected_currency: "EUR" }, { expected_interval_count: 2 }]) {
      expect(() => assertTokOneRecurringQuoteAccepted(quote, { ...accepted, ...patch })).toThrow("price_changed_requote");
    }
    expect(() => assertTokOneRecurringQuoteAccepted(quote, { ...accepted, confirmed_by_user: false })).toThrow("explicit_confirmation_required");
  });
});
