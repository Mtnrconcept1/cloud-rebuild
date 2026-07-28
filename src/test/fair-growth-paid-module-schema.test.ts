import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260726021000_add_paid_module_cancelled_at.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const lifecycle = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728090000_fair_growth_module_lifecycle.sql"), "utf8");

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

describe("Fair Growth paid module audited lifecycle", () => {
  it.each(["confirm_fair_growth_module_activation", "pause_fair_growth_module", "resume_fair_growth_module", "cancel_fair_growth_module", "process_fair_growth_module_credit"])("defines the separate %s RPC", (rpc) => {
    expect(lifecycle).toContain(`FUNCTION public.${rpc}`);
  });

  it("enforces ownership, cross-restaurant isolation and admin-only Stripe transitions", () => {
    expect(lifecycle).toContain("public.auth_owns_restaurant(v_row.restaurant_id)");
    expect(lifecycle).toContain("admin_or_service_required");
    expect(lifecycle).toContain("authoritative_stripe_payment_required");
    expect(lifecycle).toContain("authoritative_stripe_credit_required");
  });

  it("freezes pricing, records idempotent audit events and grants minimum execution rights", () => {
    expect(lifecycle).toContain("UNIQUE (paid_module_id, action, idempotency_key)");
    expect(lifecycle).toContain("pricing_version_snapshot");
    expect(lifecycle).toContain("REVOKE ALL ON FUNCTION private_finance.transition_fair_growth_module");
    expect(lifecycle).toMatch(/GRANT EXECUTE ON FUNCTION public\.pause_fair_growth_module\(uuid,text\) TO authenticated/);
    expect(lifecycle).not.toMatch(/pause_fair_growth_module\(uuid,text\) TO service_role/);
  });

  it("exposes paginated admin reconciliation for blocked and orphan Stripe states", () => {
    expect(lifecycle).toContain("admin_get_fair_growth_reconciliation");
    expect(lifecycle).toContain("activation_blocked");
    expect(lifecycle).toContain("stripe_payment_without_local_state");
    expect(lifecycle).toContain("LIMIT LEAST(GREATEST(p_limit, 1), 200)");
  });
});
