import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = file("supabase/migrations/20261103175914_tok_restaurant_referrals.sql");
const worker = file("supabase/functions/_shared/restaurant-referral-credits.ts");
const balance = file("supabase/functions/_shared/restaurant-referral-balance.ts");
const permissions = file("supabase/migrations/20261104122917_restrict_restaurant_referral_rpc_anonymous_access.sql");
const reconciler = file("supabase/functions/stripe-subscription-reconcile/index.ts");
const auth = file("src/pages/Auth.tsx");
const recovery = file("src/lib/privilegedSignupRecovery.ts");
const dashboard = file("src/pages/dashboard/DashboardParrainage.tsx");
const adminDashboard = file("src/pages/admin/AdminParrainages.tsx");

describe("restaurant parrainage: fraud and finance contracts", () => {
  it("restricts ownership and database mutations to the server", () => {
    expect(sql).toContain("referred_restaurant_id uuid NOT NULL UNIQUE");
    expect(sql).toContain("ALTER TABLE public.restaurant_referrals ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.restaurant_referral_codes ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.restaurant_referral_codes, public.restaurant_referrals FROM PUBLIC, anon, authenticated");
    expect(sql).toMatch(/r\.owner_id = \(SELECT auth\.uid\(\)\)/);
  });

  it("does not expose private dashboards or admin actions to anonymous users", () => {
    expect(permissions).toContain("REVOKE EXECUTE ON FUNCTION public.get_restaurant_referral_dashboard(uuid) FROM PUBLIC, anon");
    expect(permissions).toContain("REVOKE EXECUTE ON FUNCTION public.list_admin_restaurant_referrals(integer) FROM PUBLIC, anon");
    expect(permissions).toContain("REVOKE EXECUTE ON FUNCTION public.reject_admin_restaurant_referral(uuid, text) FROM PUBLIC, anon");
    expect(permissions).not.toContain("is_valid_restaurant_referral_code");
  });

  it("attributes once from signup, not from user-controlled dashboard state", () => {
    expect(sql).toContain("AFTER INSERT OR UPDATE OF metadata ON public.signup_applications");
    expect(sql).toContain("ON CONFLICT (referred_restaurant_id) DO NOTHING");
    expect(sql).toContain("r.owner_id <> NEW.user_id");
    expect(sql).toContain("NEW.business_registration_number");
    expect(sql).toContain("NEW.tax_id");
    expect(auth).toContain("restaurant_referral_code: payload.restaurantReferralCode");
    expect(recovery).toContain("restaurantReferralCode: input.restaurantReferralCode");
  });

  it("requires a paid invoice, a 30-day qualification and no refund before granting", () => {
    expect(sql).toContain("NEW.event_type = 'invoice_paid'");
    expect(sql).toContain("NEW.metadata->>'stripe_mode' = 'live'");
    expect(sql).toContain("NEW.metadata->>'currency' = 'CHF'");
    expect(file("supabase/functions/stripe-webhook/index.ts")).toContain('p_metadata: {\n              event_type: event.type,\n              stripe_mode: event.livemode ? "live" : "test"');
    expect(sql).toContain("eligible_at = COALESCE(NULLIF(NEW.metadata->>'paid_at', '')::timestamptz, NEW.processed_at) + interval '30 days'");
    expect(sql).toContain("AFTER INSERT OR UPDATE OF metadata ON public.restaurant_subscription_payment_events");
    expect(sql).toContain("reverse.event_type = 'payment_reversed'");
    expect(sql).toContain("sub.status = 'active' AND sub.stripe_mode = 'live'");
    expect(sql).toContain("price_monthly_cents_snapshot BETWEEN 1 AND 1000000");
    expect(sql).toContain("status = 'processing'");
    expect(sql).toContain("public.has_role((SELECT auth.uid()), 'admin'::public.app_role)");
    expect(sql).toContain("WHERE id=p_referral_id AND status IN ('pending','qualifying')");
  });

  it("reconciles an ambiguous Stripe operation before creating a new credit", () => {
    const lookupAt = worker.indexOf("let transaction = await findExistingCredit(");
    const chargeAt = worker.indexOf("stripe.customers.createBalanceTransaction");
    expect(lookupAt).toBeGreaterThan(0);
    expect(chargeAt).toBeGreaterThan(lookupAt);
    expect(worker).toContain("tok_restaurant_referral_id");
    expect(worker).toContain("tok-restaurant-referral-");
    expect(worker).toContain('from "./restaurant-referral-balance.ts"');
    expect(balance).toContain("stripe_balance_history_limit");
    expect(worker).toContain('reverse');
    expect(worker).toContain('reversalError');
    expect(worker).toContain('status", "processing"');
    expect(reconciler).toContain("await reconcileRestaurantReferralCredits(actor.adminClient)");
  });

  it("exposes the referral link and its status without payment secrets", () => {
    expect(dashboard).toContain("get_restaurant_referral_dashboard");
    expect(dashboard).toContain("https://www.thetok.ch/auth?type=restaurateur&parrain=");
    expect(dashboard).toContain("QRCode.toDataURL");
    expect(dashboard).toContain("Mois offerts");
    expect(dashboard).not.toContain("STRIPE_SECRET_KEY");
    expect(adminDashboard).toContain("list_admin_restaurant_referrals");
    expect(adminDashboard).toContain("reject_admin_restaurant_referral");
  });
});
