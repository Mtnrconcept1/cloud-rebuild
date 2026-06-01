import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function latestMigrationContaining(pattern: RegExp) {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));
  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("admin loyalty governance", () => {
  it("adds audited RPCs and metrics for Tok One governance", () => {
    const sql = latestMigrationContaining(/admin_loyalty_change_history/i);

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_loyalty_change_history/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_get_tok_one_metrics/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_save_subscription_plan/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_archive_subscription_plan/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_save_loyalty_tier/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_archive_loyalty_tier/i);
    expect(sql).toMatch(/price cannot be negative/i);
    expect(sql).toMatch(/multiplier is invalid/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_archive_subscription_plan/i);
  });

  it("routes destructive loyalty actions through archived audited RPCs", () => {
    const page = readFileSync(resolve(root, "src/pages/admin/AdminLoyalty.tsx"), "utf8");

    expect(page).toContain("admin_get_tok_one_metrics");
    expect(page).toContain("admin_save_subscription_plan");
    expect(page).toContain("admin_archive_subscription_plan");
    expect(page).toContain("admin_save_loyalty_tier");
    expect(page).toContain("admin_archive_loyalty_tier");
    expect(page).toContain("simulationMarge");
    expect(page).toContain("Revenu mensuel Tok One");
    expect(page).toContain("Impact marge");
    expect(page).toContain("Historique des changements");
    expect(page).not.toContain('.from("user_subscription_plans").delete');
    expect(page).not.toContain('.from("loyalty_tiers").delete');
    expect(page).not.toContain('.from("subscription_benefits").delete');
  });
});
