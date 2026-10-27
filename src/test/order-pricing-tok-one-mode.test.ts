import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

const compiled = ts.transpileModule(
  readFileSync("supabase/functions/_shared/order-pricing.ts", "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
type Row = Record<string, any>;
const restaurantId = "91c4bf32-4f99-4be9-a9fa-0495c731adab";
const itemId = "9947ad5e-774b-40df-aa5d-c11878835dc6";
const activeSubscription = (stripeMode: string): Row => ({ id: `sub-${stripeMode}`, plan_id: "plan", status: "active", stripe_mode: stripeMode, current_period_end: "2026-11-20T12:00:00Z", created_at: "2026-10-20T12:00:00Z" });
const paidTransaction = (stripeMode: string): Row => ({ id: `payment-${stripeMode}`, type: "charge", status: "succeeded", stripe_mode: stripeMode, created_at: "2026-10-20T12:00:00Z", metadata: { checkout_kind: "tok-one", plan_id: "plan", billing_period: "monthly" } });

function pricingHarness(subscriptions: Row[] = [], transactions: Row[] = []) {
  const rows: Record<string, Row[]> = {
    restaurants: [{ id: restaurantId, delivery_available: true, delivery_fee: 5, supports_pickup: true }],
    menu_items: [{ id: itemId, restaurant_id: restaurantId, name: "Plat", price: 30, is_available: true }],
    profiles: [{ user_id: "customer", loyalty_points: 0 }],
    tok_one_subscriptions: subscriptions.map((row) => ({ user_id: "customer", ...row })),
    payment_transactions: transactions.map((row) => ({ user_id: "customer", ...row })),
    user_subscription_plans: [{ id: "plan", free_delivery_min_order: 20 }],
    subscription_benefits: [{ plan_id: "plan", benefit_type: "discount_percentage", value: { percentage: 10 } }],
  };
  const adminClient = {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let limit = Number.POSITIVE_INFINITY;
      const data = () => (rows[table] || []).filter((row) => filters.every(([field, value]) => row[field] === value)).slice(0, limit);
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
        in: () => query, lte: () => query, gte: () => query, order: () => query,
        limit: (value: number) => { limit = value; return query; },
        maybeSingle: async () => ({ data: data()[0] || null, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve),
      };
      return query;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((name: string) => name === "./feature-flags.ts"
    ? { getEffectiveFeatureFlagSet: async () => new Set(["livraison", "emporter"]), assertPaymentMethodAllowed: () => {} }
    : { isTokOneEntitledStatus: (status: string) => status === "active" }, exports);
  return (input: Row = {}) => exports.buildVerifiedOrderPricing({ adminClient, userId: "customer", restaurantId, items: [{ menu_item_id: itemId, quantity: 1 }], deliveryFee: 5, metadata: { delivery_address: "Rue de Lyon 55, 1203 Geneve" }, ...input });
}

afterEach(() => vi.useRealTimers());

describe("Tok One server pricing Stripe mode isolation", () => {
  it.each(["subscription", "recovery"])("does not grant live order benefits from a test %s", async (source) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const price = pricingHarness(source === "subscription" ? [activeSubscription("test")] : [], source === "recovery" ? [paidTransaction("test")] : []);
    expect(await price()).toMatchObject({ tokOneMember: false, tokOneDiscount: 0, tokOneDeliveryDiscount: 0, total: 35 });
  });

  it.each(["subscription", "recovery"])("continues to grant valid live benefits from a %s", async (source) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const price = pricingHarness(source === "subscription" ? [activeSubscription("live")] : [], source === "recovery" ? [paidTransaction("live")] : []);
    expect(await price()).toMatchObject({ tokOneMember: true, tokOneDiscount: 3, tokOneDeliveryDiscount: 5, total: 27 });
  });

  it("ignores a newer test subscription while resolving the live subscription", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const price = pricingHarness([{ ...activeSubscription("test"), status: "cancelled" }, activeSubscription("live")]);
    expect(await price()).toMatchObject({ tokOneMember: true, total: 27 });
  });

  it("does not let untrusted order metadata select test entitlements", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const price = pricingHarness([activeSubscription("test")]);
    expect(await price({ metadata: { delivery_address: "Rue de Lyon 55, 1203 Geneve", stripe_mode: "test" } })).toMatchObject({ tokOneMember: false, total: 35 });
  });

  it.each(["subscription", "recovery"])("supports explicitly selected internal test pricing from a %s", async (source) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const price = pricingHarness(source === "subscription" ? [activeSubscription("test")] : [], source === "recovery" ? [paidTransaction("test")] : []);
    expect(await price({ stripeMode: "test" })).toMatchObject({ tokOneMember: true, total: 27 });
  });

  it("does not grant test pricing benefits from a live subscription or charge", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const price = pricingHarness([activeSubscription("live")], [paidTransaction("live")]);
    expect(await price({ stripeMode: "test" })).toMatchObject({ tokOneMember: false, total: 35 });
  });
});
