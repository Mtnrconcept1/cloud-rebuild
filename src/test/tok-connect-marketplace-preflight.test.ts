import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync("supabase/functions/tok-connect-app-bridge/index.ts", "utf8");
const checkout = readFileSync("supabase/functions/create-checkout/index.ts", "utf8");
const finance = readFileSync("supabase/functions/_shared/marketplace-finance.ts", "utf8");

describe("TOK Connect early Stripe Connect readiness guard", () => {
  it("checks the same authoritative marketplace gate used by native Stripe Checkout", () => {
    expect(bridge).toContain('import { resolveMarketplaceRouting } from "../_shared/marketplace-finance.ts";');
    expect(checkout).toContain("const marketplaceRouting = await resolveMarketplaceRouting({");
    expect(finance).toContain("MARKETPLACE_CONNECT_ROUTING_NOT_READY");
    expect(finance).toContain('stripe_connect_details_submitted');
    expect(finance).toContain('stripe_connect_charges_enabled');
    expect(finance).toContain('stripe_connect_payouts_enabled');
  });

  it("fails before any provisional order, session, or in-progress mutation on rejected finance", () => {
    const guardIndex = bridge.indexOf("  await resolveMarketplaceRouting({");
    const mutationIndex = bridge.indexOf("  mutationStarted = true;", guardIndex);
    const orderIndex = bridge.indexOf('postCustomerTokFunction(req, actor, "validate-order", {', mutationIndex);
    const stripeIndex = bridge.indexOf('postCustomerTokFunction(req, actor, "create-checkout", {', mutationIndex);
    expect(guardIndex).toBeGreaterThan(0);
    expect(mutationIndex).toBeGreaterThan(guardIndex);
    expect(orderIndex).toBeGreaterThan(mutationIndex);
    expect(stripeIndex).toBeGreaterThan(orderIndex);
  });

  it("never runs payment routing before the user accepts the freshly checked total", () => {
    const check = bridge.indexOf("assertTokCartAmountUnchanged(customer_quote.total_cents, input.expected_total_cents!);");
    const guard = bridge.indexOf("  await resolveMarketplaceRouting({", check);
    expect(check).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(check);
    expect(bridge).toContain("grossCents: customer_quote.total_cents,");
    expect(bridge).toContain('stripeMode: "live"');
  });

  it("preserves the native zero-cost Zero Attente exception without a fake charge", () => {
    expect(bridge).toContain('checkoutKind: input.journey === "zero-attente" ? "zero-attente" : "order"');
    expect(finance).toContain('checkoutKind === "zero-attente" && distribution.grossCents === 0');
    expect(finance).toContain('mode: "no_cost" as const');
  });

  it("keeps failures retry-safe only before mutation and never weakens the downstream gate", () => {
    expect(bridge).toContain("retry_safe: !mutationStarted");
    expect(bridge).toContain('postCustomerTokFunction(req, actor, "create-checkout"');
    expect(checkout).toContain("const marketplaceRouting = await resolveMarketplaceRouting({");
    expect(checkout).toContain('destination: marketplaceRouting.destinationAccountId');
  });
});
