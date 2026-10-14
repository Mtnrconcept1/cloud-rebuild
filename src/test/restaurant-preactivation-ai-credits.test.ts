import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261014110000_restaurant_preactivation_weekly_ai_credits.sql"),
  "utf8",
);
const billingPage = readFileSync(
  resolve(process.cwd(), "src/pages/dashboard/DashboardAccountBilling.tsx"),
  "utf8",
);
const campaignsPage = readFileSync(
  resolve(process.cwd(), "src/pages/dashboard/DashboardCampagnes.tsx"),
  "utf8",
);
const checkout = readFileSync(
  resolve(process.cwd(), "supabase/functions/create-checkout/index.ts"),
  "utf8",
);
const webhook = readFileSync(
  resolve(process.cwd(), "supabase/functions/stripe-webhook/index.ts"),
  "utf8",
);

describe("restaurant AI credits before subscription activation", () => {
  it("uses a non-cumulative weekly 15-credit AI allowance in the Swiss timezone", () => {
    expect(migration).toContain("WHEN p_trial_eligible THEN 15 ELSE 0");
    expect(migration).toContain("date_trunc('week', p_anchor AT TIME ZONE 'Europe/Zurich')");
    expect(migration).toContain("date_trunc('week', v_event.occurred_at AT TIME ZONE 'Europe/Zurich')");
    expect(migration).toContain("v_free_remaining := v_free_limit;");
    expect(migration).toContain("clock_timestamp()");
    expect(migration).toContain("'trial_reset_timezone', 'Europe/Zurich'");
    expect(migration).toContain("'trial_reset_at', v_week_end");
    expect(migration).toContain("'trial_weekly_remaining'");
  });

  it("never releases plan credits until a real active period with activation date", () => {
    expect(migration).toContain("subscription.status = 'active'");
    expect(migration).toContain("subscription.activated_at IS NOT NULL");
    expect(migration).toContain("subscription.current_period_start <= now()");
    expect(migration).toContain("subscription.current_period_end > now()");
    expect(migration).toContain("'subscription_credits_locked', true");
    expect(migration).toContain("get_restaurant_credit_usage_before_fair_growth(");
    expect(migration).not.toMatch(/UPDATE\s+public\.restaurant_ai_subscriptions/i);
  });

  it("credits only successfully paid packs, with 12-month expiry and chronological spending", () => {
    expect(migration).toContain("FROM public.restaurant_credit_purchases");
    expect(migration).toContain("AND status = 'paid'");
    expect(migration).toContain("p_anchor - interval '12 months'");
    expect(migration).toContain("v_paid_expires := array_append");
    expect(migration).toContain("v_paid_expires[v_index] > v_event.occurred_at");
    expect(migration).toContain("ORDER BY occurred_at, CASE WHEN event_type = 'purchase' THEN 0 ELSE 1 END");
    expect(migration).toContain("'topup_balance', v_paid_balance");
  });

  it("spends free credits only on AI and prevents campaign conversion", () => {
    const freeSpendClause = migration.indexOf("IF v_event.event_type = 'ai' THEN");
    const spendPaidClause = migration.indexOf("IF v_to_spend > 0 THEN");
    expect(freeSpendClause).toBeGreaterThan(0);
    expect(spendPaidClause).toBeGreaterThan(freeSpendClause);
    expect(migration).toContain("'campaign_spendable_balance'");
    expect(migration).toContain("TG_TABLE_NAME = 'ad_campaigns'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_old_required_credits");
    expect(campaignsPage).toContain("tokCredit.metadata?.preactivation");
    expect(campaignsPage).toContain("tokCredit.metadata.campaign_spendable_balance");
  });

  it("lets preactivation AI/photo tools use the wallet while preserving feature flags", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(");
    expect(migration).toContain("IF NOT public.is_feature_flag_active(v_feature) THEN");
    expect(migration).toContain("IF NOT v_active THEN");
    expect(migration).toContain("v_wallet := public.get_restaurant_credit_usage(p_restaurant_id)");
    expect(migration).toContain("v_allowed := v_balance >= GREATEST(COALESCE(p_units, 1), 1)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION private_finance.get_restaurant_preactivation_credit_usage");
  });

  it("carries purchased credits already spent before subscription activation", () => {
    expect(migration).toContain("p_spend_before timestamptz DEFAULT NULL");
    expect(migration).toContain("v_first_activation");
    expect(migration).toContain("v_preactivation_paid_spent");
    expect(migration).toContain("v_paid_deduction");
    expect(migration).toContain("'preactivation_paid_spent'");
    expect(migration).toContain("p_anchor - interval '24 months'");
  });

  it("cannot omit or zero out billable AI credit units", () => {
    expect(migration).toContain("NEW.metadata->>'credit_units'");
    expect(migration).toContain("NEW.metadata->>'image_count'");
    expect(migration).toContain("NEW.metadata->>'variant_count'");
    expect(migration).toContain("GREATEST(\n      COALESCE(");
  });

  it("shows weekly free and bought balances without removing Stripe pack checkout", () => {
    expect(billingPage).toContain("15 crédits IA gratuits chaque semaine avant activation");
    expect(billingPage).toContain("weeklyTrialBalance");
    expect(billingPage).toContain("purchasedCreditBalance");
    expect(billingPage).toContain("Achetez des crédits supplémentaires à tout moment");
    expect(billingPage).toContain('"restaurant-credit-pack"');
    expect(checkout).toContain('"restaurant-credit-pack"');
    expect(webhook).toContain('"restaurant_credit_purchases"');
  });
});
