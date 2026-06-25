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
    expect(page).toContain("restaurant_subscription_plans");
    expect(page).toContain("restaurant_credit_packs");
    expect(page).toContain("restaurant-subscription-upgrade");
    expect(page).toContain("restaurant-credit-pack");
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
});
