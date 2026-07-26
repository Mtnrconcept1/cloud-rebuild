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
      "RAISE EXCEPTION 'A cancelled paid module is missing cancelled_at'",
    );
  });
});
