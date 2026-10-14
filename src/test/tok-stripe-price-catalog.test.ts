import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Reusable TOK restaurant Stripe catalog", () => {
  const catalog = read("supabase/functions/_shared/restaurant-stripe-price-catalog.ts");
  const worker = read("supabase/functions/stripe-worker/index.ts");
  const manage = read("supabase/functions/manage-restaurant-subscription/index.ts");

  it("catalogues all four plans for both test/live monthly/yearly modes", () => {
    for (const slug of ["starter", "pro", "premium", "elite"]) {
      expect(catalog).toContain(`"${slug}"`);
    }
    expect((catalog.match(/"price_1/g) || []).length).toBe(16);
    expect(catalog).toContain('price.livemode !== (input.mode === "live")');
    expect(catalog).toContain("price.unit_amount !== input.amountCents");
    expect(catalog).toContain("actualProductId !== productId");
    expect(catalog).toContain("TOK_STRIPE_CATALOG_PRICE_MISMATCH");
  });

  it("reuses verified Stripe prices on activation and plan changes", () => {
    expect(worker).toContain("resolveRestaurantSubscriptionCatalogPrice(runtime.stripe");
    expect(worker).toContain("items: [{ price: stripePriceId }]");
    expect(worker).not.toContain("runtime.stripe.prices.create(");
    expect(manage).toContain("resolveRestaurantSubscriptionCatalogPrice(stripeRuntime.stripe");
    expect(manage).not.toContain("stripeRuntime.stripe.prices.create(");
  });
});
