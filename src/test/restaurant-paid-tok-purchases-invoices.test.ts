import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const match = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  expect(match, `No migration contains ${pattern}`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, match || ""), "utf8");
}

describe("restaurant paid TOK purchase invoices", () => {
  it("records paid launch packs, subscriptions and credit packs as paid TOK payable invoices", () => {
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(webhook).toContain("recordRestaurantTokPurchaseInvoiceIfMissing");
    expect(webhook).toContain('itemKind: "launch_pack"');
    expect(webhook).toContain('itemKind: "restaurant_subscription"');
    expect(webhook).toContain('itemKind: "credit_pack"');
    expect(webhook).toContain('status: "paid"');
    expect(webhook).toContain("stripe_checkout_session_id: session.id");
    expect(webhook).toContain("restaurant_invoices");
    expect(webhook).toContain("restaurant_invoice_line_items");
  });

  it("allows paid TOK purchase line kinds in restaurant invoice line items", () => {
    const migration = latestMigrationContaining(/launch_pack[\s\S]*restaurant_subscription[\s\S]*credit_pack/);

    expect(migration).toContain("restaurant_invoice_line_items_kind_check");
    expect(migration).toContain("'launch_pack'");
    expect(migration).toContain("'restaurant_subscription'");
    expect(migration).toContain("'credit_pack'");
    expect(migration).toContain("ALTER TABLE public.restaurant_invoice_line_items");
  });
});
