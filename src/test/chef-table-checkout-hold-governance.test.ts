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

describe("chef table checkout hold governance", () => {
  it("reserves chef table portions before redirecting to Stripe and releases stale sessions", () => {
    const migration = readMigrationContaining(/chef_table_checkout_holds/i);
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const helper = read("supabase/functions/_shared/chefs-table.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.chef_table_checkout_holds");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_chef_table_checkout_hold");
    expect(migration).toContain("remaining_portions = remaining_portions - v_quantity");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.consume_chef_table_checkout_hold");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.release_chef_table_checkout_hold");

    expect(checkout).toContain("create_chef_table_checkout_hold");
    expect(checkout).toContain("chefTableHoldItems.push");
    expect(checkout).toContain("chef_table_hold_count");
    expect(checkout).toContain("stripe.checkout.sessions.expire(session.id)");

    expect(helper).toContain("hasHeldDropPortion");
    expect(helper).toContain("consumeHeldDropPortions");
    expect(helper).toContain("consume_chef_table_checkout_hold");
    expect(webhook).toContain("release_chef_table_checkout_hold");
    expect(webhook).toContain("chef_table_hold_release_failed");
  });
});
