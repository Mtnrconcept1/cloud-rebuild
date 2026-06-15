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

  it("shows current subscription, upgrade plans, credit balance and detailed credit spend", () => {
    const page = read("src/pages/dashboard/DashboardAccountBilling.tsx");

    expect(page).toContain("get_restaurant_credit_usage");
    expect(page).toContain("restaurant_subscription_plans");
    expect(page).toContain("restaurant-subscription-upgrade");
    expect(page).toContain("Crédits campagnes");
    expect(page).toContain("Crédits outils IA");
    expect(page).toContain("Crédits photo IA");
    expect(page).toContain("Détail des dépenses de crédits");
    expect(page).toContain("L'upgrade d'abonnement reste disponible");
    expect(page).toContain("Solde");
  });

  it("uses server-side Stripe Checkout and webhook reconciliation for restaurant upgrades", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(checkout).toContain('effectiveKind === "restaurant-subscription-upgrade"');
    expect(checkout).toContain("restaurant_subscription_plans");
    expect(checkout).toContain("previous_stripe_subscription_id");
    expect(checkout).toContain("restaurant_subscription_upgrade_same_plan");
    expect(checkout).toContain("isSubscriptionCheckout");
    expect(checkout).toContain("subscription_data");

    expect(webhook).toContain('checkoutKind === "restaurant-subscription-upgrade"');
    expect(webhook).toContain("syncRestaurantSubscriptionRecord");
    expect(webhook).toContain("restaurant_subscription_upgrade");
    expect(webhook).toContain("previous_stripe_subscription_id");
    expect(webhook).toContain("stripe.subscriptions.cancel");
    expect(webhook).toContain("restaurant_ai_subscriptions");
  });

  it("adds a secure billing credit usage RPC and seeds the dashboard billing feature", () => {
    const migration = latestMigrationContaining(/get_restaurant_credit_usage/);

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage");
    expect(migration).toContain("public.auth_owns_restaurant(p_restaurant_id)");
    expect(migration).toContain("public.has_role(auth.uid(), 'admin')");
    expect(migration).toContain("public.ai_usage_logs");
    expect(migration).toContain("public.ad_campaigns");
    expect(migration).toContain("Crédits campagnes");
    expect(migration).toContain("Crédits outils IA");
    expect(migration).toContain("Crédits photo IA");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage");
    expect(migration).toContain("'dashboard-billing'");
  });
});
