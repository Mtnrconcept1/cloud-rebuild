import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TOK centralized OpenAI credit and cost controls", () => {
  const weeklySql = read("supabase/migrations/20261014110000_restaurant_preactivation_weekly_ai_credits.sql");
  const reportingSql = read("supabase/migrations/20261014113000_admin_ai_restaurant_cost_report.sql");
  const dashboard = read("src/components/admin/AdminAiRestaurantCosts.tsx");

  it("only exposes the 15-credit weekly trial before the first paid subscription activation", () => {
    expect(weeklySql).toContain("CASE WHEN p_trial_eligible THEN 15 ELSE 0 END");
    expect(weeklySql).toContain("AT TIME ZONE 'Europe/Zurich'");
    expect(weeklySql).toContain("subscription.activated_at IS NOT NULL");
    expect(weeklySql).toContain("subscription.current_period_end > now()");
    expect(weeklySql).toContain("'subscription_credits_locked', true");
    expect(weeklySql).toContain("'trial_reset_at', v_week_end");
  });

  it("does not finance campaigns with free trial credits and preserves 12-month paid packs", () => {
    expect(weeklySql).toContain("v_event.event_type = 'ai'");
    expect(weeklySql).toContain("'campaign_spendable_balance'");
    expect(weeklySql).toContain("v_paid_expires[v_index] > v_event.occurred_at");
    expect(weeklySql).toContain("p_anchor - interval '12 months'");
    expect(weeklySql).toContain("pg_advisory_xact_lock");
    expect(weeklySql).toContain("v_old_required_credits");
    expect(weeklySql).not.toMatch(/DELETE FROM public[.]restaurant_credit_purchases/i);
  });

  it("protects private cost analytics with backend admin-role checks and bounded pagination", () => {
    expect(reportingSql).toContain("SECURITY DEFINER");
    expect(reportingSql).toContain("SET search_path = ''");
    expect(reportingSql).toContain("public.has_role(auth.uid(), 'admin')");
    expect(reportingSql).toContain("RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'");
    expect(reportingSql).toContain("p_limit NOT BETWEEN 1 AND 100");
    expect(reportingSql).toContain("p_days NOT BETWEEN 1 AND 366");
    expect(reportingSql).toContain("LIMIT p_limit OFFSET p_offset");
    expect(reportingSql).toContain("FROM PUBLIC, anon, authenticated");
    expect(reportingSql).toContain("TO authenticated, service_role");
  });

  it("labels historical costs as estimates, never as provider invoices or TOK margins", () => {
    expect(reportingSql).toContain("'cost_type', 'estimated_only'");
    expect(reportingSql).toContain("public.ai_usage_logs");
    expect(reportingSql).toContain("estimated_cost_chf");
    expect(reportingSql).toContain("unattributed_requests");
    expect(dashboard).toContain("Coût fournisseur estimé");
    expect(dashboard).toContain("non du relevé de facturation OpenAI");
    expect(dashboard).toContain("ne constitue ni le coût facturé définitif ni une marge commerciale");
    expect(dashboard).toContain("getSupabase().rpc as any");
  });

  it("never exposes an OpenAI or service-role secret through the admin browser", () => {
    expect(dashboard).not.toContain("Deno.env");
    expect(dashboard).not.toContain("OPENAI_API_KEY");
    expect(dashboard).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(read("supabase/functions/_shared/openai.ts")).toContain("OPENAI_API_KEY");
    expect(read("src/pages/admin/AdminAiOperations.tsx")).toContain("<AdminAiRestaurantCosts />");
  });
});
