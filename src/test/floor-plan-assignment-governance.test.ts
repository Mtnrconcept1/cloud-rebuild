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
  it("defines an authorized, audited and replayable workspace RPC", () => {
    // Cible la migration qui *définit* la fonction : une simple mention (un
    // commentaire d'une migration plus récente, par exemple) ne doit pas
    // détourner la recherche vers un fichier qui ne la déclare pas.
    const sql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_save_floor_plan_workspace_v3\s*\(/i,
    );

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_save_floor_plan_workspace_v3\s*\(/i);
    expect(sql).toContain("p_expected_snapshot jsonb");
    expect(sql).toContain("p_request_id text");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/public\.auth_can_access_branch\(p_branch_id\)/i);
    expect(sql).toContain("FLOOR_PLAN_REVISION_CONFLICT");
    expect(sql).toContain("FLOOR_PLAN_REQUEST_ID_REUSED");
    expect(sql).toContain("private.floor_plan_save_operations");
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.restaurant_save_floor_plan_workspace_v3\([^;]+\) FROM PUBLIC, anon;/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.restaurant_save_floor_plan_workspace_v3\([^;]+\) TO authenticated;/i);
  });

  it("routes dashboard persistence through v3 and prohibits direct room or assignment writes", () => {
    const page = read("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(page).toContain('"restaurant_save_floor_plan_workspace_v3"');
    expect(page).toContain("buildFloorPlanWorkspaceRequest");
    expect(page).not.toContain('"restaurant_save_floor_plan_assignments"');
    for (const table of ["reservation_tables", "reservation_table_layout_overrides", "reservation_slots"]) {
      const directWrite = new RegExp(`\\.from\\(\\s*["']${table}["'][^)]*\\)\\s*\\)*\\s*\\.(?:insert|update|upsert|delete)\\s*\\(`);
      expect(page, `Direct writes to ${table} bypass the atomic workspace RPC`).not.toMatch(directWrite);
    }
  });

  it("paginates reservations inside a bounded service date window", () => {
    const page = read("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(page).toContain('.gte("date", reservationDateBounds.startIso)');
    expect(page).toContain('.lt("date", reservationDateBounds.endIso)');
    expect(page).toContain(".range(offset, offset + FLOOR_PLAN_RESERVATIONS_LIMIT - 1)");
    expect(page).not.toContain(".limit(FLOOR_PLAN_RESERVATIONS_LIMIT)");
  });
});
