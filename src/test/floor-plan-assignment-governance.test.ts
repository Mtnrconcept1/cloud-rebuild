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

describe("floor plan assignment governance", () => {
  it("adds an audited transactional RPC for reservation table assignments", () => {
    const sql = latestMigrationContaining(/restaurant_save_floor_plan_assignments/i);

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_save_floor_plan_assignments/i);
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/public\.auth_can_access_branch\(p_branch_id\)/i);
    expect(sql).toContain("Table capacity is too low for this reservation");
    expect(sql).toMatch(/DELETE\s+FROM\s+public\.reservation_slots/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.reservation_slots/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
  });

  it("routes the dashboard save flow through the RPC instead of direct slot mutations", () => {
    const page = read("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(page).toContain("restaurant_save_floor_plan_assignments");
    expect(page).toContain("changedAssignments");
    expect(page).not.toMatch(/from\("reservation_slots" as any\)\)\s*[\s\S]{0,120}\.delete\(/);
    expect(page).not.toMatch(/from\("reservation_slots" as any\)\)\s*[\s\S]{0,120}\.insert\(/);
  });
});
