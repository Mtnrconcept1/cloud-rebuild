import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726024000_close_remaining_demo_rls_bypass.sql",
  ),
  "utf8",
);

describe("remaining commercial demo blanket RLS cleanup", () => {
  it("is a controlled production no-op and validates every demo policy shape", () => {
    expect(migration).toContain(
      "No remaining public dedicated-demo blanket policies; controlled no-op",
    );
    expect(migration).toContain("v_policy.permissive");
    expect(migration).toContain("ARRAY['authenticated']::name[]");
    expect(migration).toContain("v_policy.cmd IS DISTINCT FROM 'ALL'");
    expect(migration).toContain("'is_dedicated_commercial_demo_actor()'");
  });

  it("drops only remaining public blanket policies", () => {
    expect(migration).toContain("policy.schemaname = 'public'");
    expect(migration).toContain("policy.tablename <> 'user_roles'");
    expect(migration).toContain("'DROP POLICY %I ON %I.%I'");
    expect(migration).not.toContain(
      "DROP POLICY IF EXISTS dedicated_commercial_demo_full_access\n  ON public.user_roles",
    );
    expect(migration).not.toContain("storage.objects");
    expect(migration).not.toContain(
      "CREATE POLICY dedicated_commercial_demo_full_access",
    );
  });

  it("fingerprints every other public policy and RLS flag", () => {
    expect(migration).toContain("pg_temp.tok_demo_public_rls_fingerprint()");
    expect(migration).toContain("relation.relrowsecurity");
    expect(migration).toContain("relation.relforcerowsecurity");
    expect(migration).toContain(
      "policy.policyname <> 'dedicated_commercial_demo_full_access'",
    );
    expect(migration).toContain(
      "A non-blanket policy or public-table RLS setting changed unexpectedly",
    );
  });

  it("makes all twelve blanket-only tables server-only", () => {
    for (const table of [
      "commercial_demo_ai_provider_failures",
      "commercial_demo_ai_requests",
      "commercial_demo_ai_storage_cleanup_queue",
      "commercial_earning_events",
      "commercial_prospect_catalog",
      "finance_outbox",
      "payment_attempts",
      "refund_operations",
      "restaurant_subscription_activation_jobs",
      "restaurant_subscription_payment_events",
      "restaurant_subscription_payment_methods",
      "solidarity_donations",
    ]) {
      expect(migration).toContain(`('${table}')`);
    }
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated",
    );
    expect(migration).toContain(
      "A service-only table still has a client RLS policy",
    );
    expect(migration).toContain(
      "An authenticated table privilege remains on a service-only table",
    );
  });

  it("preserves scoped demo data and mapped restaurant/menu policies", () => {
    for (const policy of [
      "commercial_demo_ai_conversations_select",
      "commercial_demo_ai_generations_select",
      "commercial_demo_ai_messages_select",
      "commercial_demo_catalog_select",
      "commercial_demo_missions_select",
      "commercial_demo_events_select",
      "commercial_demo_sessions_select",
      "commercial_demo_orders_select",
      "commercial_demo_reservations_select",
      "dedicated_commercial_demo_mapped_menu_select",
      "dedicated_commercial_demo_mapped_menu_insert",
      "dedicated_commercial_demo_mapped_menu_update",
      "dedicated_commercial_demo_mapped_menu_delete",
      "dedicated_commercial_demo_shared_restaurant_select",
      "dedicated_commercial_demo_shared_restaurant_update",
    ]) {
      expect(migration).toContain(`'${policy}'`);
    }
    expect(migration).toContain("%dedicated_demo_can_access_restaurant%");
  });

  it("requires the secured RPC paths that replace direct table access", () => {
    for (const rpc of [
      "commercial_demo_create_session",
      "commercial_demo_create_order",
      "commercial_demo_create_reservation",
      "commercial_demo_get_snapshot",
      "commercial_demo_reset_session",
      "commercial_demo_transition",
      "commercial_demo_transition_reservation",
      "get_commercial_prospect_followups",
      "get_commercial_prospect_signup_referral",
      "record_commercial_prospect_followup",
    ]) {
      expect(migration).toContain(`('${rpc}')`);
    }
    expect(migration).toContain("routine.prosecdef");
    expect(migration).toContain("routine.proowner = 'postgres'::regrole");
    expect(migration).toContain("setting LIKE 'search_path=%'");
    expect(migration).toContain("'authenticated'");
    expect(migration).toContain("'EXECUTE'");
  });

  it("does not introduce a new broad grant", () => {
    expect(migration).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
    expect(migration).not.toContain("GRANT ALL PRIVILEGES");
  });
});
