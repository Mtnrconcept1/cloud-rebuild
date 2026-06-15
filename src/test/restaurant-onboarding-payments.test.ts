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

describe("restaurant onboarding pack and subscription payments", () => {
  it("collects launch pack and subscription choices during restaurateur signup", () => {
    const auth = read("src/pages/Auth.tsx");
    const validation = read("supabase/functions/submit-signup-application/validation.ts");

    expect(auth).toContain("selectedLaunchPackId");
    expect(auth).toContain("selectedSubscriptionPlanId");
    expect(auth).toContain("selectedSubscriptionBillingPeriod");
    expect(auth).toContain('formData.append("launch_pack_id"');
    expect(auth).toContain('formData.append("subscription_plan_id"');
    expect(auth).toContain('formData.append("subscription_billing_period"');
    expect(validation).toContain("launch_pack_id");
    expect(validation).toContain("subscription_plan_id");
    expect(validation).toContain("subscription_billing_period");
  });

  it("creates a server-side combined Stripe checkout for onboarding", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(checkout).toContain('effectiveKind === "restaurant-onboarding"');
    expect(checkout).toContain("isSubscriptionCheckout");
    expect(checkout).toContain("restaurant_launch_pack_id");
    expect(checkout).toContain("restaurant_subscription_plans");
    expect(checkout).toContain("restaurant_subscription_plan_slug");
    expect(checkout).toContain("campaign_credit_chf");
    expect(checkout).toContain("ai_tool_credits");
    expect(checkout).toContain("ai_photo_credits");
    expect(checkout).toContain("subscription_data");
    expect(checkout).toContain("billing_period");
    expect(checkout).not.toContain('effectiveKind === "restaurant-onboarding" ? "payment"');

    expect(webhook).toContain('checkoutKind === "restaurant-onboarding"');
    expect(webhook).toContain("restaurant_launch_packs");
    expect(webhook).toContain("restaurant_ai_subscriptions");
    expect(webhook).toContain("payment_transactions");
  });

  it("blocks admin approval until the selected pack and subscription are paid", () => {
    const migration = latestMigrationContaining(/signup_restaurateur_onboarding_payment_ready/);
    const admin = read("src/pages/admin/AdminUtilisateurs.tsx");
    const statusCard = read("src/components/signup/SignupApplicationStatusCard.tsx");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.signup_restaurateur_onboarding_payment_ready");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_subscription_plans");
    expect(migration).toContain("69.00");
    expect(migration).toContain("129.00");
    expect(migration).toContain("199.00");
    expect(migration).toContain("499.00");
    expect(migration).toContain("campaign_credit_chf");
    expect(migration).toContain("ai_tool_credits");
    expect(migration).toContain("ai_photo_credits");
    expect(migration).toContain("restaurant_launch_packs");
    expect(migration).toContain("restaurant_ai_subscriptions");
    expect(migration).toContain("Onboarding payment required before approval");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready");

    expect(admin).toContain("Paiement onboarding");
    expect(admin).toContain("canApproveSignupApplication");
    expect(statusCard).toContain("Payer le pack et l'abonnement");
  });
});
