import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const scanner = readFileSync(
  "supabase/functions/ops-incident-native-scan/index.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260726062000_ops_incident_native_cron.sql",
  "utf8",
);
const config = readFileSync("supabase/config.toml", "utf8");

describe("native incident scan readiness", () => {
  it("accepts only the Vault-backed internal scheduler identity", () => {
    expect(scanner).toContain("authenticateRequest(req, { allowSchedulerSecret: true })");
    expect(scanner).toContain('actor.authMode !== "scheduler_secret"');
    expect(scanner).toContain("scheduler_identity_required");
    expect(scanner).not.toContain("allowServiceRole: true");
  });

  it("calls the existing control plane without exposing its secret", () => {
    expect(scanner).toContain('getEnv("OPS_CONTROL_SECRET")');
    expect(scanner).toContain('"x-ops-control-secret": controlSecret');
    expect(scanner).toContain('JSON.stringify({ action: "scan" })');
    expect(scanner).toContain('"User-Agent": "TOK-Native-Incident-Scanner/1.0"');
    expect(scanner).toContain("incident_scan_upstream_failed");
    expect(scanner).not.toContain("jsonResponse({ controlSecret");
    expect(scanner).not.toContain("message: controlSecret");
  });

  it("keeps the internal scan alive with the service-role fallback when no secret is provisioned", () => {
    // The dedicated OPS_CONTROL_SECRET only exists after the secret-sync
    // workflow runs; until then the scan authenticates the project-internal
    // hop with the auto-provisioned service-role key instead of failing 503
    // every five minutes.
    expect(scanner).toContain('getEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(scanner).toContain("ops_control_credentials_not_configured");
    expect(scanner).toContain("Authorization: `Bearer ${serviceRoleKey}`");

    const control = readFileSync(
      "supabase/functions/ops-incident-control/index.ts",
      "utf8",
    );
    expect(control).toContain("assertScanAuthorized");
    expect(control).toContain("authenticateRequest(req, { allowServiceRole: true })");
    expect(control).toContain("actor.isServiceRole");
  });

  it("schedules a five-minute scan with the existing Vault secret", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron");
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_net");
    expect(migration).toContain("tok-ops-incident-native-scan");
    expect(migration).toContain("*/5 * * * *");
    expect(migration).toContain("x-internal-cron-secret");
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("internal_cron_secret");
    expect(migration).toContain("ops-incident-native-scan");
    expect(migration).not.toContain("service_role");
    expect(migration).not.toContain("OPS_CONTROL_SECRET");
  });

  it("keeps gateway JWT verification disabled only because the handler verifies the scheduler", () => {
    expect(config).toMatch(
      /\[functions\.ops-incident-native-scan\]\s+verify_jwt = false/,
    );
    expect(scanner).toContain("allowSchedulerSecret: true");
    expect(scanner).toContain("writeAuditLog");
  });
});
