import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261031063000_marketing_growth_autopilot.sql"),
  "utf8",
);
const noonRefreshSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261031214500_marketing_growth_noon_refresh.sql"),
  "utf8",
);
const orchestrator = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-orchestrator/index.ts"),
  "utf8",
);

describe("growth autopilot private CRM workflow", () => {
  it("requires explicit service role and never grants direct browser access", () => {
    expect(sql).toContain("PERFORM public.marketing_require_service_role();");
    expect(sql).toContain("SECURITY DEFINER SET search_path = ''");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.marketing_growth_opportunities FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.service_run_marketing_growth_autopilot(integer)");
    expect(sql).toContain("TO service_role;");
  });

  it("enforces Swiss email opt-in over an older legitimate-interest loophole", () => {
    expect(sql).toContain("WHEN p_channel = ''email''");
    expect(sql).toContain("c.consent_at IS NOT NULL");
    expect(sql).toContain("ELSE (c.lawful_basis IN");
    expect(sql).toContain("Marketing eligibility guard changed");
    expect(sql).not.toContain("GRANT SELECT ON TABLE public.marketing_contacts");
  });

  it("is idempotent, bounded, revocation-aware and does not create external effects", () => {
    expect(sql).toContain("UNIQUE (contact_id, action_kind)");
    expect(sql).toContain("local_date date NOT NULL UNIQUE");
    expect(sql).toContain("p_limit NOT BETWEEN 1 AND 200");
    expect(sql).toContain("global_pause");
    expect(sql).toContain("c.opted_out_at IS NOT NULL");
    expect(sql).toContain("status='converted'");
    expect(sql).toContain("FOR UPDATE OF c SKIP LOCKED");
    expect(sql).toContain("ON CONFLICT (contact_id, action_kind) DO NOTHING");
    expect(sql).toContain("'conversion_rate',NULL");
    expect(sql).toContain("'stripe_subscription_invoices_paid',v_paid_invoices_7d");
    expect(sql).toContain("'stripe_verified_deals_paid',v_paid_deals_7d");
    expect(sql).toContain("'inbound_leads_with_source_unverified',v_leads_with_source_7d");
    expect(sql).toContain("'restaurants_activated',v_activated_restaurants_7d");
    expect(sql).toContain("'paid_metrics_attribution','Unattributed operational receipts");
    expect(sql).not.toContain("http_post");
    expect(sql).not.toContain("resend.com");
    expect(sql).not.toContain("webhook");
  });

  it("refreshes morning aggregates only after Geneva noon without restaging contacts", () => {
    expect(noonRefreshSql).toContain("AT TIME ZONE 'Europe/Zurich'");
    expect(noonRefreshSql).toContain("v_snapshot_recorded_at >= v_noon_utc");
    expect(noonRefreshSql).toContain("now() < v_noon_utc");
    expect(noonRefreshSql).toContain("FOR UPDATE;");
    expect(noonRefreshSql).toContain("IF NOT v_refresh_only THEN");
    expect(noonRefreshSql).toContain("ON CONFLICT (local_date) DO UPDATE SET");
    expect(noonRefreshSql).toContain("recorded_at = now()");
    expect(noonRefreshSql).toContain("metrics = EXCLUDED.metrics");
    expect(noonRefreshSql).toContain("PERFORM public.marketing_require_service_role()");
    expect(noonRefreshSql).toContain("global_pause");
    expect(noonRefreshSql).toContain("GRANT EXECUTE ON FUNCTION public.service_run_marketing_growth_autopilot(integer)");
    expect(noonRefreshSql).toContain("TO service_role;");
    expect(noonRefreshSql).not.toContain("http_post");
    expect(noonRefreshSql).not.toContain("resend.com");
  });

  it("invokes only during approved scheduler runs and does not block the marketing queue", () => {
    expect(orchestrator).toContain('if (action === "run_due") {');
    expect(orchestrator).toContain('"service_run_marketing_growth_autopilot"');
    expect(orchestrator).toContain("Growth recommendations unavailable; marketing dispatch unaffected");
    expect(orchestrator).toContain("growth_status: growth?.status");
    expect(orchestrator).toContain("growth_staged: growth?.staged");
    expect(orchestrator).not.toMatch(/if \(action === "run_item"\)[\s\S]{0,120}service_run_marketing_growth_autopilot/);
  });
});
