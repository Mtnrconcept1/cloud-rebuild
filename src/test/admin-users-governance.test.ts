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
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}[\\s\\S]*?\\nEND;\\n\\$\\$;`, "i"),
  );

  expect(match).toBeTruthy();
  return match![0];
}

describe("admin users governance", () => {
  it("adds audited admin RPCs for roles, account status, user details and anomalies", () => {
    const sql = latestMigrationContaining(/admin_user_account_states/i);
    const listFn = extractFunction(sql, "admin_list_users");
    const rolesFn = extractFunction(sql, "admin_set_user_roles");
    const statusFn = extractFunction(sql, "admin_set_user_account_status");
    const detailFn = extractFunction(sql, "admin_get_user_admin_detail");
    const alertsFn = extractFunction(sql, "admin_get_user_governance_alerts");
    const reviewFn = extractFunction(sql, "admin_review_signup_application");

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_user_account_states/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.admin_user_account_states\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/CREATE\s+POLICY[\s\S]*admin_user_account_states[\s\S]*public\.has_role\(auth\.uid\(\),\s*'admin'\)/i);

    expect(listFn).toMatch(/email_confirmed_at/i);
    expect(listFn).toMatch(/account_status/i);
    expect(listFn).toMatch(/anomalies/i);
    expect(listFn).toMatch(/restaurateur_without_restaurant/i);
    expect(listFn).toMatch(/courier_without_profile/i);
    expect(listFn).toMatch(/user_without_role/i);
    expect(listFn).toMatch(/email_unconfirmed/i);

    expect(rolesFn).toMatch(/v_last_admin_removal/i);
    expect(rolesFn).toMatch(/RAISE\s+EXCEPTION\s+'Cannot remove the last admin role/i);
    expect(rolesFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(rolesFn).toMatch(/old_data[\s\S]*new_data/i);

    expect(statusFn).toMatch(/p_status\s+NOT\s+IN\s+\('active',\s*'suspended'\)/i);
    expect(statusFn).toMatch(/NULLIF\(trim\(COALESCE\(p_reason,\s*''\)\),\s*''\)\s+IS\s+NULL/i);
    expect(statusFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);

    expect(detailFn).toMatch(/orders_summary/i);
    expect(detailFn).toMatch(/reservations_summary/i);
    expect(detailFn).toMatch(/incidents_summary/i);
    expect(detailFn).toMatch(/courier_profile/i);
    expect(detailFn).toMatch(/restaurants/i);
    expect(detailFn).toMatch(/recent_history/i);

    expect(alertsFn).toMatch(/restaurateur_without_restaurant/i);
    expect(alertsFn).toMatch(/courier_without_profile/i);
    expect(alertsFn).toMatch(/email_unconfirmed/i);

    expect(reviewFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(reviewFn).toMatch(/signup_application_documents/i);

    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_set_user_account_status\(uuid,\s*text,\s*text\)\s+FROM\s+PUBLIC,\s*anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_user_admin_detail\(uuid\)\s+TO\s+authenticated,\s*service_role/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_user_governance_alerts\(\)\s+TO\s+authenticated,\s*service_role/i);
  });

  it("exposes advanced user governance controls in the admin users screen", () => {
    const source = readFileSync(resolve(root, "src/pages/admin/AdminUtilisateurs.tsx"), "utf8");

    expect(source).toContain("admin_get_user_admin_detail");
    expect(source).toContain("admin_get_user_governance_alerts");
    expect(source).toContain("admin_set_user_account_status");
    expect(source).toContain("UserDetailPanel");
    expect(source).toContain("exportUsersCsv");
    expect(source).toContain("exportApplicationsCsv");
    expect(source).toContain("exportCouriersCsv");
    expect(source).toContain("anomalyFilter");
    expect(source).toContain("createdFilter");
    expect(source).toContain("Fiche utilisateur");
    expect(source).toContain("DialogContent");
    expect(source).toContain("open={Boolean(selectedUserId)}");
    expect(source).toContain("setSelectedUserId(null)");
    expect(source).toContain("<UserDetailPanel userId={selectedUserId} embedded />");
    expect(source).not.toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]");
    expect(source).toContain("Historique");
    expect(source).toContain("Suspendre");
    expect(source).toContain("Réactiver");
    expect(source).toContain("Dernier admin");
  });
});
