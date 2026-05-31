import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function readMigration(name: string) {
  return readFileSync(resolve(migrationsDir, name), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const matches = migrationFiles().filter((name) => pattern.test(readMigration(name)));
  expect(matches.length).toBeGreaterThan(0);
  return readMigration(matches[matches.length - 1]);
}

function extractFunction(sql: string, functionName: string) {
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}[\\s\\S]*?\\n\\$\\$;`, "i"),
  );

  expect(match).toBeTruthy();
  return match![0];
}

describe("admin courier profile validation", () => {
  it("adds a privileged RPC that reviews courier profiles and synchronizes the courier role", () => {
    const sql = latestMigrationContaining(/admin_review_courier_profile/i);
    const fn = extractFunction(sql, "admin_review_courier_profile");

    expect(fn).toMatch(/public\.has_role\(v_actor_id,\s*'admin'\)/i);
    expect(fn).toMatch(/v_next_status\s+NOT\s+IN\s+\('approved',\s*'pending_approval',\s*'suspended',\s*'rejected'\)/i);
    expect(fn).toMatch(/UPDATE\s+public\.couriers[\s\S]*SET\s+status\s*=\s*v_next_status/i);
    expect(fn).toMatch(/INSERT\s+INTO\s+public\.user_roles[\s\S]*'courier'::public\.app_role/i);
    expect(fn).toMatch(/DELETE\s+FROM\s+public\.user_roles[\s\S]*'courier'::public\.app_role/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_review_courier_profile/i);
  });

  it("exposes a dedicated courier validation queue in the admin users page", () => {
    const adminUsers = readFileSync(resolve(root, "src/pages/admin/AdminUtilisateurs.tsx"), "utf8");
    const adminHome = readFileSync(resolve(root, "src/pages/admin/AdminHome.tsx"), "utf8");

    expect(adminUsers).toContain('value="couriers"');
    expect(adminUsers).toContain('queryKey: ["admin-couriers"]');
    expect(adminUsers).toContain("admin_review_courier_profile");
    expect(adminUsers).toContain("Profil livreur mis a jour");
    expect(adminHome).toContain("/admin/utilisateurs?tab=couriers");
    expect(adminHome).toContain("Profils livreurs");
  });
});
