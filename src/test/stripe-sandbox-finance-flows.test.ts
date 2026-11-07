import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

// Execute the production finance functions (not a duplicate implementation)
// with a controlled, in-memory Supabase dependency. No live payment or DB writes.
const source = readFileSync("supabase/functions/_shared/marketplace-finance.ts", "utf8");
function between(start: string, end: string) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Missing marketplace finance source segment: ${start}`);
  return source.slice(first, last);
}
const types = between("type MarketplaceMoneyBasis = {", "type FairGrowthPricingSnapshot");
const integers = between("function toInteger(", "function toNullableInteger(");
const calculations = between("export function calculateMarketplaceSplit(", "async function resolveFairGrowthPricingSnapshot").replaceAll("export function ", "function ");
const routing = between("export async function resolveMarketplaceRouting(", "const SEALED_FINANCE_FIELDS").replace("export async function ", "async function ");
const transpile = (code: string) => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const money = new Function(transpile(`
const TOK_PLATFORM_FEE_BPS = 1000;
const TOK_DEVELOPER_SHARE_BPS = 1000;
const TOK_ORDER_DEVELOPER_SHARE_BPS = 100;
${types}
${integers}
${calculations}
return { calculateMarketplaceSplit, calculateDeveloperRevenueSplit, calculateOrderPaymentDistribution };
`))() as {
  calculateMarketplaceSplit: (gross: number, bps?: number, basis?: Record<string, number>) => Record<string, number>;
  calculateDeveloperRevenueSplit: (gross: number, bps?: number) => Record<string, number>;
  calculateOrderPaymentDistribution: (gross: number, bps?: number, basis?: Record<string, number>) => Record<string, number>;
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const route = new Function(
  "HttpError", "normalizeKind", "MARKETPLACE_CHECKOUT_KINDS",
  "calculateMarketplaceSplit", "calculateDeveloperRevenueSplit",
  "calculateOrderPaymentDistribution", "resolveFairGrowthPricingSnapshot", "TOK_DEVELOPER_SHARE_BPS", "FAIR_GROWTH_PRICING_VERSION",
  transpile(`${routing}
return resolveMarketplaceRouting;`),
)(
  HttpError,
  (value: unknown) => String(value || "").trim().toLowerCase(),
  new Set(["order", "zero-attente", "chefs-table", "match-group"]),
  money.calculateMarketplaceSplit,
  money.calculateDeveloperRevenueSplit,
  money.calculateOrderPaymentDistribution,
  async () => ({
    platformFeeBps: 1000, pricingPlanId: null, pricingPlanSlug: null,
    pricingVersion: "flat_marketplace_2026_08", pricingRateSource: "runtime_default",
  }),
  1000,
  "flat_marketplace_2026_08",
) as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

const restaurant = {
  id: "00000000-0000-4000-8000-000000000111",
  stripe_account_id: "acct_tok_test_fixture_only",
  stripe_connect_details_submitted: true,
  stripe_connect_charges_enabled: true,
  stripe_connect_payouts_enabled: true,
  stripe_connect_requirements_due: [],
};
function client(enabled: boolean, info: Record<string, unknown> | null = restaurant) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "finance_runtime_config") {
              return { data: { connect_routing_enabled: enabled }, error: null };
            }
            if (table === "restaurants") return { data: info, error: null };
            throw new Error(`Unexpected table: ${table}`);
          },
        }),
      }),
    }),
  };
}
const common = { restaurantId: restaurant.id, grossCents: 1000, checkoutKind: "order" };

describe("Stripe Test — TOK marketplace finance acceptance scenarios", () => {
  it("10 CHF order: restaurant 9.00, TOK 0.90, developer 0.10 (before Stripe fees)", () => {
    const split = money.calculateOrderPaymentDistribution(1000);
    expect(split).toMatchObject({
      grossCents: 1000,
      commissionableCents: 1000,
      platformFeeCents: 100,
      stripeApplicationFeeCents: 100,
      restaurantTransferCents: 900,
      restaurantShareCents: 900,
      developerShareCents: 10,
      tokNetRevenueCents: 90,
    });
  });

  it("preserves 100% of tips and correctly excludes delivery pass-through from platform commission", () => {
    const split = money.calculateOrderPaymentDistribution(12000, 1000, {
      commissionableCents: 10000, tipCents: 1000, deliveryPassThroughCents: 1000,
    });
    expect(split).toMatchObject({
      grossCents: 12000, platformFeeCents: 1000,
      stripeApplicationFeeCents: 2000, restaurantShareCents: 10000,
      restaurantTransferCents: 10000, developerShareCents: 100,
      tokNetRevenueCents: 900,
    });
  });

  it("rejects an impossible commission basis rather than paying excess shares", () => {
    expect(() => money.calculateOrderPaymentDistribution(1000, 1000, {
      commissionableCents: 950, tipCents: 100, deliveryPassThroughCents: 50,
    })).toThrow("INVALID_MARKETPLACE_MONEY_BASIS");
  });

  it("does not create a commission or transfer for free Zero Attente", async () => {
    const res = await route({ ...common, checkoutKind: "zero-attente", grossCents: 0,
      stripeMode: "live", adminClient: client(false) });
    expect(res).toMatchObject({
      enabled: false, mode: "no_cost", destinationAccountId: null,
      stripeApplicationFeeCents: 0, restaurantTransferCents: 0,
    });
  });

  it("fails closed with HTTP 503 for real payments while Connect routing is off", async () => {
    await expect(route({ ...common, stripeMode: "live", adminClient: client(false) }))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("MARKETPLACE_CONNECT_ROUTING_NOT_READY") });
  });

  it("does not pretend test-mode legacy checkout has an automatic transfer", async () => {
    const res = await route({ ...common, stripeMode: "test", adminClient: client(false) });
    expect(res).toMatchObject({ enabled: false, mode: "legacy_manual", destinationAccountId: null });
  });

  it("routes verified connected accounts with the correct test destination and fee", async () => {
    const res = await route({ ...common, stripeMode: "test", adminClient: client(true) });
    expect(res).toMatchObject({
      enabled: true, mode: "stripe_connect_destination",
      destinationAccountId: restaurant.stripe_account_id,
      stripeApplicationFeeCents: 100, restaurantTransferCents: 900,
    });
  });

  it("refuses unverified connected accounts even when the global switch is enabled", async () => {
    const unverified = { ...restaurant, stripe_connect_payouts_enabled: false };
    await expect(route({ ...common, stripeMode: "test", adminClient: client(true, unverified) }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("refuses Stripe accounts with outstanding verification requirements", async () => {
    const due = { ...restaurant, stripe_connect_requirements_due: ["external_account"] };
    await expect(route({ ...common, stripeMode: "test", adminClient: client(true, due) }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("supports restaurant order, Zero Attente, chef table and match-group checkout kinds", async () => {
    for (const checkoutKind of ["order", "zero-attente", "chefs-table", "match-group"]) {
      const res = await route({ ...common, checkoutKind, stripeMode: "test", adminClient: client(true) });
      expect(res).toMatchObject({
        enabled: true,
        destinationAccountId: restaurant.stripe_account_id,
        platformFeeCents: 100,
      });
    }
  });

  it("non-marketplace TOK-owned payment doesn't transfer to a restaurant", async () => {
    const res = await route({ ...common, checkoutKind: "subscription", stripeMode: "test", adminClient: client(true) });
    expect(res).toMatchObject({ enabled: false, mode: "tok_owned", destinationAccountId: null });
  });
});
