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
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}[\\s\\S]*?\\nEND;\\n\\$\\$;`, "i"),
  );

  expect(match).toBeTruthy();
  return match![0];
}

describe("admin marketplace alerts RPC", () => {
  it("creates persistent alert state and history tables with admin-only policies", () => {
    const sql = latestMigrationContaining(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.marketplace_alert_states/i);

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.marketplace_alert_states/i);
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.marketplace_alert_state_history/i);
    expect(sql).toMatch(/CHECK\s*\(\s*status\s+IN\s+\('new',\s*'in_progress',\s*'resolved',\s*'ignored'\)/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.marketplace_alert_states\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.marketplace_alert_state_history\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/USING\s*\(\s*public\.has_role\(auth\.uid\(\),\s*'admin'\)\s*\)/i);
  });

  it("returns a unified queue covering operations, payments, support, campaigns and platform failures", () => {
    const sql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_get_marketplace_alerts/i,
    );
    const fn = extractFunction(sql, "admin_get_marketplace_alerts");

    expect(fn).toMatch(/RETURNS\s+TABLE\s*\([\s\S]*alert_key\s+text[\s\S]*recommended_action\s+text[\s\S]*metadata\s+jsonb/i);
    expect(fn).toMatch(/public\.has_role\(auth\.uid\(\),\s*'admin'\)/i);
    expect(fn).toContain("order:pending-payment:");
    expect(fn).toContain("order:stuck-fulfillment:");
    expect(fn).toContain("dispatch:no-courier:");
    expect(fn).toContain("reservation:pending:");
    expect(fn).toContain("refund:order:");
    expect(fn).toContain("refund:reservation:");
    expect(fn).toContain("restaurant:incomplete:");
    expect(fn).toContain("campaign:paid-inactive:");
    expect(fn).toContain("campaign:active-unpaid:");
    expect(fn).toContain("support:incident:");
    expect(fn).toContain("edge-function:failure:");
    expect(fn).toContain("payment:orphan-charge:");
    expect(fn).toContain("payment:failed:");
    expect(fn).toMatch(/COALESCE\(s\.status,\s*'new'\)\s+NOT\s+IN\s+\('resolved',\s*'ignored'\)/i);
  });

  it("records admin decisions with mandatory notes for resolved or ignored alerts", () => {
    const sql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_marketplace_alert/i,
    );
    const fn = extractFunction(sql, "admin_update_marketplace_alert");

    expect(fn).toMatch(/public\.has_role\(v_actor_id,\s*'admin'\)/i);
    expect(fn).toMatch(/v_status\s+NOT\s+IN\s+\('new',\s*'in_progress',\s*'resolved',\s*'ignored'\)/i);
    expect(fn).toMatch(/v_status\s+IN\s+\('resolved',\s*'ignored'\)\s+AND\s+v_note\s+IS\s+NULL/i);
    expect(fn).toMatch(/INSERT\s+INTO\s+public\.marketplace_alert_states/i);
    expect(fn).toMatch(/ON\s+CONFLICT\s+\(alert_key\)\s+DO\s+UPDATE/i);
    expect(fn).toMatch(/INSERT\s+INTO\s+public\.marketplace_alert_state_history/i);
    expect(fn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
  });

  it("does not expose marketplace alert RPCs to anonymous callers", () => {
    const sql = latestMigrationContaining(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_marketplace_alerts/i,
    );

    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_marketplace_alerts\(boolean\)\s+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_marketplace_alerts\(boolean\)\s+FROM\s+anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_marketplace_alerts\(boolean\)\s+TO\s+authenticated,\s*service_role/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_update_marketplace_alert\(text,\s*text,\s*text\)\s+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_update_marketplace_alert\(text,\s*text,\s*text\)\s+FROM\s+anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_update_marketplace_alert\(text,\s*text,\s*text\)\s+TO\s+authenticated,\s*service_role/i);
  });
});
