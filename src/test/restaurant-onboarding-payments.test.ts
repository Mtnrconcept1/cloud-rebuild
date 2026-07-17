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
    const submitSignup = read("supabase/functions/submit-signup-application/index.ts");
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
    expect(auth).toContain("commercialReferralToken");
    expect(auth).toContain('formData.append(\n    "commercial_referral_token"');
    expect(auth).toContain("COMMERCIAL_REFERRAL_SESSION_KEY");
    expect(submitSignup).toContain("invalid_commercial_referral_token");
    expect(submitSignup).toContain("commercial_referral_token");
  });

  it("saves a card during onboarding and defers the Stripe subscription", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    const worker = read("supabase/functions/stripe-worker/index.ts");

    expect(checkout).toContain('effectiveKind === "restaurant-onboarding"');
    expect(checkout).toContain("isRestaurantOnboardingSetup");
    expect(checkout).not.toContain("restaurant_launch_pack_id");
    expect(checkout).toContain("restaurant_subscription_plans");
    expect(checkout).toContain("restaurant_subscription_plan_slug");
    expect(checkout).toContain('sessionParams.mode = "setup"');
    expect(checkout).toContain("stripe.customers.create");
    expect(checkout).not.toContain("onboarding_checkout_bucket");
    expect(checkout).toContain('payment_attempt_version: "2"');
    expect(checkout).toContain("assertRestaurantOnboardingSetupSessionIntegrity");
    expect(checkout).toContain("authoritative_total_cents");
    expect(checkout).not.toContain('customer_creation = "always"');
    expect(checkout).toContain("setup_intent_data");
    expect(checkout).toContain("lineItems = []");
    expect(checkout).toContain("billing_period");
    expect(checkout).toContain('if (!signupApplicationId) throw new HttpError(400, "signup_application_id requis")');
    expect(checkout).toContain("signup_application_id: signupApplicationId");

    expect(webhook).toContain('checkoutKind === "restaurant-onboarding"');
    expect(webhook).toContain("setupIntents.retrieve");
    expect(webhook).toContain("finalizePaymentAttempt");
    expect(webhook).toContain("record_restaurant_onboarding_payment_method_ready");
    expect(webhook).toContain("record_restaurant_subscription_invoice_paid");
    expect(webhook).toContain("record_restaurant_subscription_payment_reversed");
    expect(webhook).toContain("record_restaurant_subscription_cancelled_before_payment");
    expect(webhook).toContain('event.type === "invoice.payment_action_required"');
    expect(webhook).toContain("restaurant_subscription_stale_event_ignored");
    expect(webhook).toContain("restaurant_subscription_stale_invoice_failure_ignored");
    expect(webhook).not.toContain('.upsert(payload, { onConflict: "restaurant_id" })');

    expect(worker).toContain("claim_restaurant_subscription_activation_jobs");
    expect(worker).toContain("subscriptions.create");
    expect(worker).toContain("tok-restaurant-activation-subscription:");
    expect(worker).toContain("complete_restaurant_subscription_activation_job");
    expect(worker).toContain("fail_restaurant_subscription_activation_job");
  });

  it("blocks admin approval until the reusable payment method is ready", () => {
    const migration = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.signup_restaurateur_onboarding_payment_ready/i,
    );
    const admin = read("src/pages/admin/AdminUtilisateurs.tsx");
    const statusCard = read("src/components/signup/SignupApplicationStatusCard.tsx");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.signup_restaurateur_onboarding_payment_ready");
    expect(migration).toContain("restaurant_ai_subscriptions");
    expect(migration).toContain("payment_method_ready_at");
    expect(migration).toContain("payment_method_ready");
    expect(migration).toContain("restaurant_subscription_payment_methods");
    expect(migration).toContain("get_commercial_prospect_signup_referral");
    expect(migration).toContain("commercial_signup_referral");
    expect(migration).toContain("deferred_subscription_contract_snapshot_is_immutable");
    expect(migration).toContain("stale_failure_ignored");
    expect(migration).toContain("subscription.stripe_subscription_id IS NULL");
    expect(migration).toContain("queue_subscription_activation_on_reservation");
    expect(migration).toContain("queue_subscription_activation_on_order");
    expect(migration).toContain("record_restaurant_subscription_invoice_paid");
    expect(migration).not.toContain("v_launch_pack_id");
    expect(migration).not.toContain("restaurant_launch_packs rlp");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready");

    expect(admin).toContain("canApproveSignupApplication");
    expect(admin).toContain("Carte enregistrée");
    expect(statusCard).toContain("Enregistrer la carte sans débit");
    expect(statusCard).toContain("Aucun débit n’est effectué");
    expect(statusCard).toContain("Abonnement déjà démarré");
    expect(statusCard).toContain("Mettre à jour la carte et relancer le paiement");
    expect(statusCard).toContain("onboardingPaymentRecoveryRequired");
    expect(statusCard).toContain('["paid", "active", "trialing"]');
  });
});
