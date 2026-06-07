import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const file = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  if (!file) throw new Error(`No migration found for ${pattern}`);
  return readFileSync(resolve(migrationsDir, file), "utf8");
}

describe("restaurant special offer governance", () => {
  it("adds audited RPCs for Anti-Gaspi and Flash Sale writes", () => {
    const sql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_upsert_anti_waste_offer/i,
    );

    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+archived_at/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_upsert_anti_waste_offer/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_update_anti_waste_offer_status/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_archive_anti_waste_offer/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_upsert_flash_sale/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_update_flash_sale_status/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_archive_flash_sale/i);
    expect(sql).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.anti_waste_offers\s+FROM\s+authenticated/i);
    expect(sql).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.flash_sales\s+FROM\s+authenticated/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
  });

  it("routes dashboard writes through RPCs instead of direct table mutations", () => {
    const antiWaste = read("src/pages/dashboard/DashboardOffres.tsx");
    const flashSales = read("src/pages/dashboard/DashboardVentesFlash.tsx");

    expect(antiWaste).toContain("restaurant_upsert_anti_waste_offer");
    expect(antiWaste).toContain("restaurant_update_anti_waste_offer_status");
    expect(antiWaste).toContain("restaurant_archive_anti_waste_offer");
    expect(antiWaste).toContain('.is("archived_at", null)');
    expect(antiWaste).not.toMatch(/anti_waste_offers"[\s\S]{0,180}\.(insert|update|delete)\(/);

    expect(flashSales).toContain("restaurant_upsert_flash_sale");
    expect(flashSales).toContain("restaurant_update_flash_sale_status");
    expect(flashSales).toContain("restaurant_archive_flash_sale");
    expect(flashSales).toContain('.is("archived_at", null)');
    expect(flashSales).not.toMatch(/flash_sales"[\s\S]{0,180}\.(insert|update|delete)\(/);
  });
});
