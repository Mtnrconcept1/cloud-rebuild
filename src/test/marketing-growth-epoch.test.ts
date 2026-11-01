import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261101200000_marketing_growth_kpi_epoch.sql"), "utf8");
describe("TOK Growth KPI epoch and Geneva noon", () => {
  it("excludes historic events and bounds every seven-day metric", () => {
    expect(sql).toContain("timestamp '2026-11-01 00:00:00' AT TIME ZONE 'Europe/Zurich'");
    expect(sql).toContain("GREATEST(now() - interval '7 days', v_epoch_utc)");
    expect(sql).toContain("'kpi_start_local_date','2026-11-01'");
    for (const key of ["created_at","signed_at","honored_at","touched_at","observed_at","processed_at","paid_at","completed_at"]) {
      expect(sql).toContain(key + " >= v_window_start_utc");
    }
    expect(sql).toContain("f.signed_at >= v_window_start_utc");
    expect(sql).not.toContain("WHERE touched_at >= now() - interval '7 days'");
  });
  it("never creates pre-noon snapshots or repeated morning staging", () => {
    expect(sql).toMatch(/IF now\(\) < v_noon_utc THEN\s+RETURN jsonb_build_object\('status','waiting_noon'/);
    expect(sql.indexOf("IF now() < v_noon_utc THEN")).toBeLessThan(sql.indexOf("UPDATE public.marketing_growth_opportunities q SET"));
    expect(sql).toContain("ON CONFLICT (local_date) DO UPDATE SET");
  });
  it("repairs historical pollution only in post-epoch snapshots, with private RPC", () => {
    expect(sql).toContain("WITH daily_sources AS (");
    expect(sql).toContain("WHERE local_date >= DATE '2026-11-01'");
    expect(sql).toContain("UPDATE public.marketing_growth_snapshots snapshot");
    expect(sql).not.toContain("SET recorded_at =");
    for (const k of ["acquisition_touches","restaurant_contracts_signed","campaign_attributed_conversions","stripe_subscription_invoices_paid","stripe_verified_deals_paid","restaurants_activated"]) {
      expect(sql).toContain("'" + k + "',c." + k);
    }
    expect(sql).toContain("PERFORM public.marketing_require_service_role();");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.service_run_marketing_growth_autopilot(integer)");
    expect(sql).toContain("TO service_role;");
    expect(sql).not.toContain("http_post");
  });
});
