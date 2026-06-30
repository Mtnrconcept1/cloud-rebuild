import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const match = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  if (!match) return "";
  return readFileSync(resolve(migrationsDir, match), "utf8");
}

describe("restaurant account and billing dashboard", () => {
  it("adds a dedicated restaurateur account and billing tab behind a feature flag", () => {
    const app = read("src/App.tsx");
    const layout = read("src/components/DashboardLayout.tsx");
    const featureCatalog = read("src/lib/featureCatalog.ts");

    expect(app).toContain("DashboardAccountBilling");
    expect(app).toContain('hasFeature("dashboard-billing")');
    expect(app).toContain('path="/dashboard/mon-compte-facturation"');

    expect(layout).toContain('to: "/dashboard/mon-compte-facturation"');
    expect(layout).toContain('label: "Mon compte/Facturation"');
    expect(layout).toContain('feature: "dashboard-billing"');

    expect(featureCatalog).toContain('name: "dashboard-billing"');
    expect(featureCatalog).toContain('routeTargets: ["/dashboard/mon-compte-facturation"]');
  });

  it("shows subscription, upgrade plans, balances, top-up packs and credit spend", () => {
    const page = read("src/pages/dashboard/DashboardAccountBilling.tsx");

    expect(page).toContain("get_restaurant_credit_usage");
    expect(page).toContain("get_restaurant_subscription_self_service_state");
    expect(page).toContain("restaurant_subscription_plans");
    expect(page).toContain("restaurant_credit_packs");
    expect(page).toContain("restaurant-subscription-upgrade");
    expect(page).toContain("restaurant-credit-pack");
    expect(page).toContain("manage-restaurant-subscription");
    expect(page).toContain("Résilier en fin de période");
    expect(page).toContain("Programmer ce plan");
    expect(page).toContain("Recharger des crédits TOK");
    expect(page).toContain("Crédits TOK");
    expect(page).toContain("tok_credits");
    expect(page).toContain("CreditPackCard");
    expect(page).toContain("BillingCreditEntry");
    expect(page).toContain("Solde");
  });

  it("uses server-side Stripe Checkout and webhook reconciliation for upgrades and credit packs", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(checkout).toContain('effectiveKind === "restaurant-subscription-upgrade"');
    expect(checkout).toContain('effectiveKind === "restaurant-credit-pack"');
    expect(checkout).toContain("restaurant_subscription_plans");
    expect(checkout).toContain("restaurant_credit_packs");
    expect(checkout).toContain("restaurant_credit_purchases");
    expect(checkout).toContain("previous_stripe_subscription_id");
    expect(checkout).toContain("restaurant_subscription_upgrade_same_plan");
    expect(checkout).toContain("isSubscriptionCheckout");
    expect(checkout).toContain("subscription_data");

    expect(webhook).toContain('checkoutKind === "restaurant-subscription-upgrade"');
    expect(webhook).toContain('checkoutKind === "restaurant-credit-pack"');
    expect(webhook).toContain("syncRestaurantSubscriptionRecord");
    expect(webhook).toContain("restaurant_credit_purchases");
    expect(webhook).toContain("restaurant_subscription_upgrade");
    expect(webhook).toContain("previous_stripe_subscription_id");
    expect(webhook).toContain("stripe.subscriptions.cancel");
    expect(webhook).toContain("restaurant_ai_subscriptions");
  });

  it("lets restaurateurs cancel at period end or schedule a downgrade without changing current entitlements immediately", () => {
    const page = read("src/pages/dashboard/DashboardAccountBilling.tsx");
    const manage = read("supabase/functions/manage-restaurant-subscription/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(page).toContain("Annuler le changement programmé");
    expect(page).toContain("Votre abonnement actuel reste actif avec ses avantages jusqu'à la fin de la période payée");
    expect(page).toContain('type: "downgrade"');
    expect(page).toContain('type: "cancel"');

    expect(manage).toContain("requireRestaurantAccess(actor, restaurantId)");
    expect(manage).toContain("cancel_at_period_end: true");
    expect(manage).toContain('pending_restaurant_subscription_change: "cancel_at_period_end"');
    expect(manage).toContain('pending_restaurant_subscription_change: "downgrade_at_period_end"');
    expect(manage).toContain("subscriptionSchedules.create");
    expect(manage).toContain("subscriptionSchedules.update");
    expect(manage).toContain('proration_behavior: "none"');
    expect(manage).toContain("scheduled_plan_change");

    expect(webhook).toContain("buildRestaurantScheduledPlanChange");
    expect(webhook).toContain("cancel_at_period_end: Boolean(subscription.cancel_at_period_end)");
    expect(webhook).toContain("stripe_subscription_schedule_id");
    expect(webhook).toContain("scheduled_plan_change");
  });

  it("adds secure credit-pack tables and enriches the billing credit usage RPC", () => {
    const migration = latestMigrationContaining(/CREATE TABLE IF NOT EXISTS public\.restaurant_credit_packs/);

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_credit_packs");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_credit_purchases");
    expect(migration).toContain("restaurant_credit_packs_active_select");
    expect(migration).toContain("restaurant_credit_purchases_owner_admin_select");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage");
    expect(migration).toContain("public.auth_owns_restaurant(p_restaurant_id)");
    expect(migration).toContain("public.has_role(auth.uid(), 'admin')");
    expect(migration).toContain("public.ai_usage_logs");
    expect(migration).toContain("public.ad_campaigns");
    expect(migration).toContain("restaurant_credit_purchases rcp");
    expect(migration).toContain("payment_method, '')) = 'credits'");
    expect(migration).toContain("THEN 5 END");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage");
  });

  it("adds non-destructive subscription self-service schema and RPC guards", () => {
    const migration = latestMigrationContaining(/get_restaurant_subscription_self_service_state/);

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS cancel_at_period_end");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS scheduled_plan_change");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS stripe_subscription_schedule_id");
    expect(migration).toContain("CHECK (billing_period IN ('monthly', 'yearly'))");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_restaurant_subscription_self_service_state");
    expect(migration).toContain("public.auth_owns_restaurant(p_restaurant_id)");
    expect(migration).toContain("public.has_role(auth.uid(), 'admin')");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.get_restaurant_subscription_self_service_state");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_restaurant_subscription_self_service_state");
  });
});
