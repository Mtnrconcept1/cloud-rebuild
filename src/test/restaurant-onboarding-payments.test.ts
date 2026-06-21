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

describe("restaurant onboarding subscription payments", () => {
  it("collects subscription choices during restaurateur signup", () => {
    const auth = read("src/pages/Auth.tsx");
    const validation = read("supabase/functions/submit-signup-application/validation.ts");

    expect(auth).not.toContain("selectedLaunchPackId");
    expect(auth).toContain("selectedSubscriptionPlanId");
    expect(auth).toContain("selectedSubscriptionBillingPeriod");
    expect(auth).not.toContain('formData.append("launch_pack_id"');
    expect(auth).toMatch(/formData\.append\(\s*"subscription_plan_id"/);
    expect(auth).toMatch(/formData\.append\(\s*"subscription_billing_period"/);
    expect(validation).not.toContain("launch_pack_id");
    expect(validation).toContain("subscription_plan_id");
    expect(validation).toContain("subscription_billing_period");
  });

  it("creates a server-side subscription Stripe checkout for onboarding", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(checkout).toContain('effectiveKind === "restaurant-onboarding"');
    expect(checkout).toContain("isSubscriptionCheckout");
    expect(checkout).not.toContain("restaurant_launch_pack_id");
    expect(checkout).toContain("restaurant_subscription_plans");
    expect(checkout).toContain("restaurant_subscription_plan_slug");
    expect(checkout).toContain("campaign_credit_chf");
    expect(checkout).toContain("ai_tool_credits");
    expect(checkout).toContain("ai_photo_credits");
    expect(checkout).toContain("subscription_data");
    expect(checkout).toContain("billing_period");
    expect(checkout).not.toContain('effectiveKind === "restaurant-onboarding" ? "payment"');

    expect(webhook).toContain('checkoutKind === "restaurant-onboarding"');
    expect(webhook).toContain("restaurant_ai_subscriptions");
    expect(webhook).toContain("payment_transactions");
  });

  it("blocks admin approval until the selected subscription is paid", () => {
    const migration = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.signup_restaurateur_onboarding_payment_ready/i,
    );
    const admin = read("src/pages/admin/AdminUtilisateurs.tsx");
    const statusCard = read("src/components/signup/SignupApplicationStatusCard.tsx");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.signup_restaurateur_onboarding_payment_ready");
    expect(migration).toContain("restaurant_subscription_plans");
    expect(migration).toContain("restaurant_ai_subscriptions");
    expect(migration).not.toContain("v_launch_pack_id");
    expect(migration).not.toContain("restaurant_launch_packs rlp");
    expect(migration).toContain("Onboarding payment required before approval");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready");

    expect(admin).toContain("Paiement onboarding");
    expect(admin).toContain("canApproveSignupApplication");
    expect(statusCard).toContain("Payer l'abonnement");
  });
});
