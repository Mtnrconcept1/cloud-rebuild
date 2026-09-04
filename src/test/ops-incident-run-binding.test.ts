import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260904143000_ops_incident_github_run_binding.sql",
);

function readMigration(): string {
  expect(
    existsSync(migrationPath),
    "the additive GitHub run binding migration must exist",
  ).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("ops incident GitHub run binding", () => {
  it("prevents an incident from being rebound to another GitHub run", () => {
    const migration = readMigration();

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.prevent_ops_incident_github_run_rebind()",
    );
    expect(migration).toContain("OLD.github_run_id IS NOT NULL");
    expect(migration).toContain("NEW.github_run_id IS DISTINCT FROM OLD.github_run_id");
    expect(migration).toContain("ops_incident_github_run_rebind_forbidden");
    expect(migration).toContain(
      "BEFORE UPDATE OF github_run_id ON public.ops_incidents",
    );
  });

  it("prevents one GitHub run from being attached to several incidents", () => {
    const migration = readMigration();

    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_incidents_github_run_id",
    );
    expect(migration).toContain("ON public.ops_incidents (github_run_id)");
    expect(migration).toContain("WHERE github_run_id IS NOT NULL");
  });

  it("is additive, idempotent and inaccessible to API roles", () => {
    const migration = readMigration();

    expect(migration).toContain("DROP TRIGGER IF EXISTS");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION private.prevent_ops_incident_github_run_rebind()",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i);
    expect(migration).not.toContain("internal_cron_secret");
  });
});
