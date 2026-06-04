import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function readMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const match = readdirSync(migrationsDir).find((name) => {
    if (!name.endsWith(".sql")) return false;
    return pattern.test(readFileSync(resolve(migrationsDir, name), "utf8"));
  });
  expect(match).toBeTruthy();
  return readFileSync(resolve(migrationsDir, match!), "utf8");
}

describe("zero attente checkout finalization governance", () => {
  it("uses one shared finalization helper from webhook and recovery function", () => {
    const helper = read("supabase/functions/_shared/zero-attente.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    const recovery = read("supabase/functions/create-zero-attente-reservation/index.ts");

    expect(helper).toContain("export async function finalizeZeroAttenteCheckout");
    expect(helper).toContain("recordZeroAttenteChargeIfMissing");
    expect(helper).toContain("apply_reservation_loyalty_points");
    expect(helper).toContain("metadata->>checkout_session_id");

    expect(webhook).toContain("finalizeZeroAttenteCheckout({");
    expect(recovery).toContain("finalizeZeroAttenteCheckout({");
    expect(webhook).not.toContain("function buildReservationNote");
    expect(webhook).not.toContain("function buildPreorderItems");
  });

  it("creates and releases a pending capacity hold before redirecting to Stripe", () => {
    const migration = readMigrationContaining(/create_zero_attente_checkout_hold/i);
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_zero_attente_checkout_hold");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("checkout_session_state");
    expect(migration).toContain("status NOT IN ('cancelled', 'no_show')");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.create_zero_attente_checkout_hold");

    expect(checkout).toContain("create_zero_attente_checkout_hold");
    expect(checkout).toContain("stripe.checkout.sessions.expire(session.id)");
    expect(checkout).toContain("zero_attente_hold_reservation_id");
    expect(webhook).toContain('case "checkout.session.expired"');
    expect(webhook).toContain("zero_attente_hold_release_failed");
    expect(webhook).toContain('checkout_session_state: "expired"');
  });
});
