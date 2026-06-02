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

describe("admin production health", () => {
  it("adds an admin-only production health RPC with cron, edge, Stripe and advisor coverage", () => {
    const sql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_get_production_health/i,
    );
    const fn = extractFunction(sql, "admin_get_production_health");

    expect(fn).toMatch(/RETURNS\s+jsonb/i);
    expect(fn).toMatch(/public\.has_role\(auth\.uid\(\),\s*'admin'\)/i);
    expect(fn).toContain("to_regclass('cron.job')");
    expect(fn).toContain("to_regclass('cron.job_run_details')");
    expect(fn).toContain("send-email-worker");
    expect(fn).toContain("tok-close-due-match-groups");
    expect(fn).toContain("tok-sync-social-post-promotions");
    expect(fn).toContain("tok-reconcile-paid-order-checkouts");
    expect(fn).toContain("stripe-webhook");
    expect(fn).toContain("create-checkout");
    expect(fn).toContain("complete-order-checkout");
    expect(fn).toContain("reconcile-paid-order-checkouts");
    expect(fn).toContain("capture-due-match-groups");
    expect(fn).toContain("reconcile-match-group-authorizations");
    expect(fn).toContain("internal_cron_secret");
    expect(fn).toContain("get_payment_integrity_anomalies");
    expect(fn).toContain("admin_supabase_advisor_snapshots");
    expect(fn).toContain("paidOrdersNotFinalized");
    expect(fn).toContain("notificationQueue");
    expect(fn).toContain("notification_deliveries");
    expect(fn).toContain("email_queue");
  });

  it("stores compact Supabase advisor snapshots for the admin health panel", () => {
    const sql = latestMigrationContaining(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_supabase_advisor_snapshots/i,
    );
    const fn = extractFunction(sql, "admin_record_supabase_advisor_snapshot");

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_supabase_advisor_snapshots/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.admin_supabase_advisor_snapshots\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/USING\s*\(\s*public\.has_role\(auth\.uid\(\),\s*'admin'\)\s*\)/i);
    expect(fn).toMatch(/jsonb_array_elements\(v_advisors\)/i);
    expect(fn).toMatch(/LIMIT\s+60/i);
    expect(fn).toContain("security_count");
    expect(fn).toContain("performance_count");
  });

  it("does not expose production health RPCs to anonymous callers", () => {
    const sql = latestMigrationContaining(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_production_health/i,
    );

    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_production_health\(\)\s+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_production_health\(\)\s+FROM\s+anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_production_health\(\)\s+TO\s+authenticated,\s*service_role/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_record_supabase_advisor_snapshot\(jsonb,\s*text\)\s+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_record_supabase_advisor_snapshot\(jsonb,\s*text\)\s+FROM\s+anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_record_supabase_advisor_snapshot\(jsonb,\s*text\)\s+TO\s+authenticated,\s*service_role/i);
  });

  it("wires the admin audit page to the production health RPC with French labels", () => {
    const page = readFileSync(resolve(root, "src/pages/admin/AdminAuditLogs.tsx"), "utf8");

    expect(page).toContain("admin_get_production_health");
    expect(page).toContain("Santé production");
    expect(page).toContain("Cron jobs");
    expect(page).toContain("Edge Functions critiques");
    expect(page).toContain("Stripe webhook");
    expect(page).toContain("Supabase advisors");
    expect(page).toContain("Variables critiques");
    expect(page).toContain("À surveiller");
    expect(page).toContain("Intégrité paiements");
  });
});
