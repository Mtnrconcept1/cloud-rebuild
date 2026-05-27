import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

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

describe("signup and admin moderation SQL", () => {
  it("keeps client signup document-free and immediately approved", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_signup_application/i);
    const syncSignupApplication = extractFunction(sql, "sync_signup_application");

    expect(syncSignupApplication).toContain("v_required_docs text[] := ARRAY[]::text[]");
    expect(syncSignupApplication).toContain("CASE WHEN v_role_text = 'client' THEN 'approved'");
    expect(syncSignupApplication).toContain("IF array_length(v_required_docs, 1) IS NOT NULL THEN");
  });

  it("does not grant privileged signup roles before admin approval", () => {
    const syncSql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_signup_application/i);
    const syncSignupApplication = extractFunction(syncSql, "sync_signup_application");
    const handleUserSql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_new_user/i);
    const handleNewUser = extractFunction(handleUserSql, "handle_new_user");

    expect(syncSignupApplication).not.toMatch(/INSERT\s+INTO\s+public\.user_roles[\s\S]*VALUES\s*\(\s*v_actor_id\s*,\s*p_requested_role\s*\)/i);
    expect(handleNewUser).not.toMatch(/v_requested_role\s+IN\s+\('restaurateur',\s*'courier'\)/i);
  });

  it("grants and revokes the requested role from the admin review RPC", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_review_signup_application/i);
    const reviewSignupApplication = extractFunction(sql, "admin_review_signup_application");

    expect(reviewSignupApplication).toMatch(/INSERT\s+INTO\s+public\.user_roles[\s\S]*VALUES\s*\(\s*v_application\.user_id\s*,\s*v_application\.requested_role\s*\)/i);
    expect(reviewSignupApplication).toMatch(/DELETE\s+FROM\s+public\.user_roles[\s\S]*requested_role/i);
    expect(reviewSignupApplication).toContain("v_next_status = 'approved'");
  });

  it("exposes signup moderation directly from the admin home", () => {
    const adminHome = readFileSync(resolve(process.cwd(), "src/pages/admin/AdminHome.tsx"), "utf8");
    const adminUsers = readFileSync(resolve(process.cwd(), "src/pages/admin/AdminUtilisateurs.tsx"), "utf8");

    expect(adminHome).toContain("/admin/utilisateurs?tab=applications");
    expect(adminUsers).toContain("useSearchParams");
    expect(adminUsers).toContain("value={activeAdminTab}");
  });
});
