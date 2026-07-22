import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync("supabase/functions/admin-restaurant-adjustment/index.ts", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260722120000_restaurant_stripe_adjustments.sql", "utf8");

describe("restaurant Stripe adjustment guards", () => {
  it("requires an admin and a payout-ready connected account", () => {
    expect(edgeSource).toContain('requireRole(actor, ["admin"])');
    expect(edgeSource).toContain("stripe_connect_payouts_enabled");
    expect(edgeSource).toContain("stripe_connect_requirements_due");
    expect(edgeSource).toContain("restaurant.is_demo");
  });

  it("creates an idempotent Stripe transfer with traceable metadata", () => {
    expect(edgeSource).toContain("stripe.transfers.create");
    expect(edgeSource).toContain("restaurant-adjustment:${idempotencyKey}");
    expect(edgeSource).toContain("adjustment_id: adjustment.id");
    expect(edgeSource).toContain('action: "create_restaurant_stripe_adjustment"');
  });

  it("keeps the adjustment ledger private and constrained", () => {
    expect(migrationSource).toContain("ALTER TABLE public.restaurant_stripe_adjustments ENABLE ROW LEVEL SECURITY");
    expect(migrationSource).toContain("idempotency_key uuid NOT NULL UNIQUE");
    expect(migrationSource).toContain("REVOKE ALL ON TABLE public.restaurant_stripe_adjustments FROM PUBLIC, anon, authenticated");
    expect(migrationSource).toContain("amount_cents > 0 AND amount_cents <= 10000000");
  });
});
