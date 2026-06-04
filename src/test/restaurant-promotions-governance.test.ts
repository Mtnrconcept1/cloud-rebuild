import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  if (!file) throw new Error(`No migration found for ${pattern}`);
  return readFileSync(resolve(migrationsDir, file), "utf8");
}

describe("restaurant promotion governance", () => {
  it("adds server-side constraints for type, target, value and date ranges", () => {
    const sql = latestMigrationContaining(/restaurant_promotions_value_check/i);

    expect(sql).toMatch(/promotion_type\s+IN\s+\('percentage',\s*'fixed',\s*'free_delivery'\)/i);
    expect(sql).toMatch(/target\s+IN\s+\('all',\s*'new',\s*'returning'\)/i);
    expect(sql).toMatch(/promotion_type\s+=\s+'percentage'[\s\S]*promotion_value\s*>\s*0[\s\S]*promotion_value\s*<=\s*100/i);
    expect(sql).toMatch(/promotion_type\s+=\s+'fixed'[\s\S]*promotion_value\s*>\s*0/i);
    expect(sql).toMatch(/promotion_type\s+=\s+'free_delivery'[\s\S]*promotion_value\s*=\s*0/i);
    expect(sql).toMatch(/end_at\s*>=\s*start_at/i);
    expect(sql).toContain("NOT VALID");
  });

  it("normalizes free delivery promotions to zero value before saving", () => {
    const page = read("src/pages/dashboard/DashboardPromotions.tsx");

    expect(page).toContain('promoType === "free_delivery" ? 0 : Number(promoValue)');
    expect(page).toContain('disabled={promoType === "free_delivery"}');
  });
});
