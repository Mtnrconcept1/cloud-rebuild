import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRestaurantSubscriptionCatalogPrice } from "../../supabase/functions/_shared/restaurant-stripe-price-catalog";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const starter = {
  planId: "537770ef-5b8c-4324-be2a-5feaf680db0c",
  slug: "starter",
  mode: "live" as const,
  interval: "month" as const,
  amountCents: 6900,
};
const price = {
  id: "price_1UQDzJGTQigE34suqk1aFMIm",
  active: true,
  livemode: true,
  currency: "chf",
  unit_amount: 6900,
  product: "prod_VR6BQMeEzxe31F",
  recurring: { interval: "month" },
};
function fakeStripe(overrides: Partial<typeof price> = {}) {
  return { prices: { retrieve: async (id: string) => ({ ...price, id, ...overrides }) } };
}

describe("Reusable TOK restaurant Stripe catalog", () => {
  const catalog = read("supabase/functions/_shared/restaurant-stripe-price-catalog.ts");
  const worker = read("supabase/functions/stripe-worker/index.ts");
  const manage = read("supabase/functions/manage-restaurant-subscription/index.ts");

  it("catalogues all four plans for both test/live monthly/yearly modes", () => {
    for (const slug of ["starter", "pro", "premium", "elite"]) {
      expect(catalog).toContain(`"${slug}"`);
    }
    expect((catalog.match(/"price_1/g) || []).length).toBe(16);
  });

  it("accepts a verified live monthly price and test annual price", async () => {
    await expect(resolveRestaurantSubscriptionCatalogPrice(fakeStripe(), starter))
      .resolves.toBe("price_1UQDzJGTQigE34suqk1aFMIm");
    await expect(resolveRestaurantSubscriptionCatalogPrice(fakeStripe({
      active: true,
      livemode: false,
      currency: "chf",
      unit_amount: 548900,
      product: "prod_VRAofgeXORgaqT",
      recurring: { interval: "year" },
    }), {
      planId: "c0b54278-1314-483c-9632-5a3f1d06b7c5",
      slug: "elite",
      mode: "test",
      interval: "year",
      amountCents: 548900,
    })).resolves.toBe("price_1UQITQGTQigE34suozZax6Nq");
  });

  it("rejects product, price, mode, interval, currency and inactive mismatches", async () => {
    const invalidPrices: Partial<typeof price>[] = [
      { active: false },
      { livemode: false },
      { currency: "eur" },
      { unit_amount: 7000 },
      { product: "prod_wrong" },
      { recurring: { interval: "year" } },
    ];
    for (const mismatch of invalidPrices) {
      await expect(resolveRestaurantSubscriptionCatalogPrice(fakeStripe(mismatch), starter))
        .rejects.toThrow("TOK_STRIPE_CATALOG_PRICE_MISMATCH");
    }
  });

  it("rejects an unknown plan, altered amount and invalid cents", async () => {
    await expect(resolveRestaurantSubscriptionCatalogPrice(fakeStripe(), {
      ...starter, planId: "another-plan",
    })).rejects.toThrow("TOK_STRIPE_CATALOG_UNKNOWN_PLAN");
    await expect(resolveRestaurantSubscriptionCatalogPrice(fakeStripe(), {
      ...starter, amountCents: 7000,
    })).rejects.toThrow("TOK_STRIPE_CATALOG_PRICE_MISMATCH");
    await expect(resolveRestaurantSubscriptionCatalogPrice(fakeStripe(), {
      ...starter, amountCents: NaN,
    })).rejects.toThrow("TOK_STRIPE_CATALOG_INVALID_AMOUNT");
  });

  it("reuses prices without creating one per activation or plan change", () => {
    expect(worker).toContain("resolveRestaurantSubscriptionCatalogPrice(runtime.stripe");
    expect(worker).toContain("items: [{ price: stripePriceId }]");
    expect(worker).not.toContain("runtime.stripe.prices.create(");
    expect(manage).toContain("resolveRestaurantSubscriptionCatalogPrice(stripeRuntime.stripe");
    expect(manage).not.toContain("stripeRuntime.stripe.prices.create(");
  });
});
