import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = "supabase/demo-migrations/20260908013000_unlimit_commercial_demo_ai_presentation.sql";

describe("commercial demo unlimited AI presentation mode", () => {
  it("removes daily presentation quotas without removing operational safeguards", () => {
    const absolutePath = resolve(root, migrationPath);
    expect(existsSync(absolutePath)).toBe(true);
    if (!existsSync(absolutePath)) return;

    const migration = readFileSync(absolutePath, "utf8");
    expect(migration).toContain("commercial_demo_ai_claim_request");
    expect(migration).toContain("commercial-demo-openai");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_global_processing >= 12");
    expect(migration).toContain("v_session_processing >= 2");
    expect(migration).toContain("circuit_open");
    expect(migration).toContain("provider_attempt_count");
    expect(migration).toContain("budget_reserved_chf");
    expect(migration).not.toContain("budget_exhausted");
    expect(migration).not.toContain("v_daily_user_count > 60");
    expect(migration).not.toContain("v_daily_global_count > 600");
  });
});
