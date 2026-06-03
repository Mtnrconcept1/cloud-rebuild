import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

function readLatestMigration(fragment: string) {
  const name = readdirSync(migrationsDir)
    .filter((entry) => entry.includes(fragment))
    .sort()
    .at(-1);

  expect(name, `Missing migration containing ${fragment}`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, name!), "utf8");
}

describe("database value constraints", () => {
  it("pins decrement_stock to an explicit security definer search_path", () => {
    const sql = readLatestMigration("pricing_and_stock_constraints");

    expect(sql).toContain("ALTER FUNCTION public.decrement_stock(text, uuid, integer) SET search_path = public");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) TO service_role");
  });

  it("adds positive price and non-negative stock constraints to catalog offer tables", () => {
    const sql = readLatestMigration("pricing_and_stock_constraints");

    expect(sql).toContain("menu_items_price_positive_check");
    expect(sql).toContain("CHECK (price > 0)");
    expect(sql).toContain("anti_waste_offers_prices_positive_check");
    expect(sql).toContain("CHECK (original_price > 0 AND discounted_price > 0 AND discounted_price <= original_price)");
    expect(sql).toContain("anti_waste_offers_quantity_non_negative_check");
    expect(sql).toContain("flash_sales_prices_positive_check");
    expect(sql).toContain("flash_sales_quantity_non_negative_check");
    expect(sql).toContain("chef_table_drops_portions_valid_check");
  });
});
