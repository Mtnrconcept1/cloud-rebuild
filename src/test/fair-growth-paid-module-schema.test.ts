import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260726021000_add_paid_module_cancelled_at.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");

describe("Fair Growth paid module cancellation schema", () => {
  it("adds the timestamp required by the request lifecycle", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS cancelled_at timestamptz",
    );
    expect(migration).toContain(
      "request_fair_growth_module(uuid,text)",
    );
    expect(migration).toContain(
      "pg_get_functiondef",
    );
  });

  it("backfills cancelled rows and verifies the final schema", () => {
    expect(migration).toContain(
      "WHERE status = 'cancelled'",
    );
    expect(migration).toContain(
      "AND cancelled_at IS NULL",
    );
    expect(migration).toContain(
      "timestamp with time zone",
    );
    expect(migration).toContain(
      "Postflight failed: a cancelled module has no cancelled_at timestamp",
    );
  });

  it("preserves ACL, RLS, policies, constraints and indexes", () => {
    expect(migration).toContain(
      "CREATE TEMP TABLE tok_paid_modules_prechange",
    );
    expect(migration).toContain(
      "policy_fingerprint",
    );
    expect(migration).toContain(
      "constraint_fingerprint",
    );
    expect(migration).toContain(
      "index_fingerprint",
    );
    expect(migration).toContain(
      "grants, RLS, policies, constraints or indexes changed unexpectedly",
    );
  });
});
