import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261014140000_mtnr_internal_unlimited_openai.sql"),
  "utf8",
);

describe("MTNR internal unlimited OpenAI entitlement", () => {
  it("grants only the verified user and their owned restaurant", () => {
    expect(sql).toContain("2e27851c-5301-48e5-a046-1b949b918e7d");
    expect(sql).toContain("mtnrconcept@gmail.com");
    expect(sql).toContain("fe046974-2945-4cf5-89cb-9c52ff354b93");
    expect(sql).toContain("r.owner_id = u.id");
    expect(sql).toContain("grant_row.user_id = auth.uid()");
  });

  it("keeps entitlement in a private RLS-enabled table and grants no financial credit", () => {
    expect(sql).toContain("private_finance.internal_unlimited_openai_grants");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).not.toMatch(/INSERT INTO\s+public\.restaurant_credit_(?:packs|purchases)/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.restaurant_ai_subscriptions/i);
  });

  it("preserves standard trial credits and removes only the AI limit", () => {
    expect(sql).toContain("get_restaurant_credit_usage_before_internal_ai_grant");
    expect(sql).toContain("check_restaurant_ai_quota_before_internal_ai_grant");
    expect(sql).toContain("v_result->>'reason' = 'feature_disabled'");
    expect(sql).toContain("'internal_unlimited_openai', true");
    expect(sql).toContain("'limit', -1");
  });

  it("never lets free OpenAI entitlements pay for ads", () => {
    expect(sql).toContain("guard_internal_unlimited_campaign_spend");
    expect(sql).toContain("public.get_restaurant_credit_usage_before_internal_ai_grant(v_restaurant_id)");
    expect(sql).toContain("'campaign_spendable_balance'");
    expect(sql).toContain("public.tok_credit_balance_from_usage(v_usage)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("USING ERRCODE = 'P0001'");
  });

  it("preserves paid OpenAI API logs while guarding other restaurant actors", () => {
    expect(sql).toContain("guard_internal_unlimited_ai_usage");
    expect(sql).toContain("private_finance.has_internal_unlimited_openai_grant(v_restaurant_id, NEW.user_id)");
    expect(sql).toContain("NEW.metadata->>'credit_units'");
    expect(sql).toContain("lower(COALESCE(NEW.status, '')) <> 'success'");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.ai_usage_logs/i);
  });
});
