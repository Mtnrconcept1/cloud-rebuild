import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("admin dashboard log reset governance", () => {
  it("adds an admin-only reset RPC with a confirmation code and auditable reset history", () => {
    const setupSql = latestMigrationContaining(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_dashboard_log_reset_history/i);
    const rpcSql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_reset_dashboard_logs/i);

    expect(setupSql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_dashboard_log_reset_history/i);
    expect(setupSql).toMatch(/ALTER\s+TABLE\s+public\.admin_dashboard_log_reset_history\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(setupSql).toMatch(/public\.has_role\(auth\.uid\(\),\s*'admin'\)/i);
    expect(setupSql).toContain("DO $reset_dashboard_logs$");
    expect(setupSql).toMatch(/VALUES\s*\(\s*NULL,\s*v_edge_count,\s*v_data_count,\s*v_ai_count\s*\)/i);

    expect(rpcSql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_reset_dashboard_logs/i);
    expect(rpcSql).toMatch(/SECURITY\s+DEFINER/i);
    expect(rpcSql).toMatch(/public\.has_role\(v_actor_id,\s*'admin'\)/i);
    expect(rpcSql).toContain("Tok2026$$");
    expect(rpcSql).toMatch(/DELETE\s+FROM\s+public\.edge_function_audit_logs\s+WHERE\s+id\s+IS\s+NOT\s+NULL/i);
    expect(rpcSql).toMatch(/DELETE\s+FROM\s+public\.audit_log\s+WHERE\s+id\s+IS\s+NOT\s+NULL/i);
    expect(rpcSql).toMatch(/DELETE\s+FROM\s+public\.ai_usage_logs\s+WHERE\s+id\s+IS\s+NOT\s+NULL/i);
    expect(rpcSql).not.toMatch(/DELETE\s+FROM\s+public\.edge_function_audit_logs\s*;/i);
    expect(rpcSql).not.toMatch(/DELETE\s+FROM\s+public\.audit_log\s*;/i);
    expect(rpcSql).not.toMatch(/DELETE\s+FROM\s+public\.ai_usage_logs\s*;/i);
    expect(rpcSql).toMatch(/INSERT\s+INTO\s+public\.admin_dashboard_log_reset_history/i);
    expect(rpcSql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_reset_dashboard_logs\(text\)\s+FROM\s+PUBLIC/i);
    expect(rpcSql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_reset_dashboard_logs\(text\)\s+FROM\s+anon/i);
    expect(rpcSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_reset_dashboard_logs\(text\)\s+TO\s+authenticated,\s+service_role/i);
  });

  it("exposes the reset action only through the dedicated admin control", () => {
    const button = read("src/components/admin/AdminLogResetButton.tsx");
    const adminHome = read("src/pages/admin/AdminHome.tsx");
    const adminAuditLogs = read("src/pages/admin/AdminAuditLogs.tsx");

    expect(button).toContain("admin_reset_dashboard_logs");
    expect(button).toContain("p_confirmation_code");
    expect(button).toContain("admin-audit-logs");
    expect(button).toContain("admin-audit-logs-full");
    expect(button).toContain("Remise");
    expect(button).not.toContain("Tok2026$$");
    expect(adminHome).toContain("AdminLogResetButton");
    expect(adminAuditLogs).toContain("AdminLogResetButton");
  });
});
