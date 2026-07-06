import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const stripeClientSource = readFileSync(resolve(root, "supabase/functions/_shared/stripe-client.ts"), "utf8");
const createCheckoutSource = readFileSync(resolve(root, "supabase/functions/create-checkout/index.ts"), "utf8");
const stripeWebhookSource = readFileSync(resolve(root, "supabase/functions/stripe-webhook/index.ts"), "utf8");
const manageTokOneSource = readFileSync(resolve(root, "supabase/functions/manage-tok-one-subscription/index.ts"), "utf8");
const tokOneSharedSource = readFileSync(resolve(root, "supabase/functions/_shared/tok-one.ts"), "utf8");
const tokOnePageSource = readFileSync(resolve(root, "src/pages/TokOne.tsx"), "utf8");
const secretsScriptSource = readFileSync(resolve(root, "scripts/write-supabase-secrets-env.mjs"), "utf8");
const workflowSource = readFileSync(resolve(root, ".github/workflows/deploy-production.yml"), "utf8");
const migrationSource = readFileSync(
  resolve(root, "supabase/migrations/20260605183251_tok_one_stripe_test_mode_support.sql"),
  "utf8",
);

describe("Tok One Stripe test mode", () => {
  it("keeps Tok One Stripe secrets server-side and prefers dedicated Tok One keys for new checkout", () => {
    expect(stripeClientSource).toContain("STRIPE_TOK_ONE_TEST_SECRET_KEY");
    expect(stripeClientSource).toContain("STRIPE_TOK_ONE_SECRET_KEY");
    expect(stripeClientSource).toContain("STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET");
    expect(stripeClientSource).toContain("STRIPE_TOK_ONE_TEST_WEBHOOK_SIGNING_SECRET");
    expect(stripeClientSource).toContain('kind === "tok-one"');
    expect(stripeClientSource).toContain('names: ["STRIPE_TOK_ONE_SECRET_KEY", "STRIPE_TOK_ONE_TEST_SECRET_KEY", "STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE"]');
    expect(stripeClientSource).toContain('purpose: "Tok One Stripe secret"');
    expect(stripeClientSource).toContain("getTokOneStripeRuntimeForCheckoutSession");
    expect(stripeClientSource).toContain('sessionId.startsWith("cs_test_")');
    expect(stripeClientSource).toContain('sessionId.startsWith("cs_live_")');
    expect(stripeClientSource).toContain("inferStripeRuntimeMode");
    expect(stripeClientSource).not.toContain("VITE_STRIPE_TOK_ONE_TEST_SECRET_KEY");
  });

  it("keeps test checkout-session sync pinned to a test Stripe runtime with compatible fallbacks", () => {
    const testRuntimeBlock = stripeClientSource.slice(
      stripeClientSource.indexOf('if (mode === "test")'),
      stripeClientSource.indexOf('if (mode === "live")'),
    );

    expect(testRuntimeBlock).toContain('names: ["STRIPE_TOK_ONE_TEST_SECRET_KEY", "STRIPE_TOK_ONE_SECRET_KEY", "STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE"]');
    expect(testRuntimeBlock).toContain('purpose: "Tok One Stripe test secret"');
    expect(testRuntimeBlock).toContain('expectedMode: "test"');
  });

  it("creates Tok One Checkout sessions with the dedicated runtime and records the Stripe mode", () => {
    expect(createCheckoutSource).toContain("getStripeRuntimeForCheckoutKind(effectiveKind)");
    expect(createCheckoutSource).toContain("const stripe = stripeRuntime.stripe");
    expect(createCheckoutSource).toContain("stripe_mode: stripeRuntime.mode");
    expect(createCheckoutSource).toContain('effectiveKind === "tok-one"');
    expect(createCheckoutSource).toContain("isSubscriptionCheckout");
    expect(createCheckoutSource).toContain('mode: isSubscriptionCheckout ? "subscription" : "payment"');
    expect(createCheckoutSource).toContain("subscription_data");
  });

  it("verifies Tok One test webhooks and syncs subscription events with live/test mode", () => {
    expect(stripeWebhookSource).toContain("getStripeWebhookSigningSecrets");
    expect(stripeWebhookSource).toContain('checkoutKind === "tok-one"');
    expect(stripeWebhookSource).toContain('getTokOneStripeRuntime(event.livemode ? "live" : "test")');
    expect(stripeWebhookSource).toContain("stripeMode: tokOneStripeRuntime.mode");
    expect(stripeWebhookSource).toContain("stripeCheckoutSessionId: session.id");
    expect(stripeWebhookSource).toContain('stripeMode: event.livemode ? "live" : "test"');
  });

  it("activates Tok One on the success return by syncing the checkout session server-side", () => {
    expect(manageTokOneSource).toContain('"sync_checkout_session"');
    expect(manageTokOneSource).toContain("getTokOneStripeRuntimeForCheckoutSession(sessionId)");
    expect(manageTokOneSource).toContain("checkout.sessions.retrieve(sessionId");
    expect(manageTokOneSource).toContain('metadata.checkout_kind !== "tok-one"');
    expect(manageTokOneSource).toContain("metadata.user_id !== actor.userId");
    expect(manageTokOneSource).toContain('session.status !== "complete"');
    expect(manageTokOneSource).toContain("syncTokOneSubscriptionRecord");
    expect(tokOnePageSource).toContain('action: "sync_checkout_session"');
    expect(tokOnePageSource).toContain("session_id: sessionId");
  });

  it("syncs the new Tok One Stripe secret names in production without storing values", () => {
    expect(secretsScriptSource).toContain('"STRIPE_TOK_ONE_TEST_SECRET_KEY"');
    expect(secretsScriptSource).toContain('"STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET"');
    expect(secretsScriptSource).toContain('"STRIPE_SECRET_KEY_LIVE"');
    expect(workflowSource).toContain("STRIPE_TOK_ONE_TEST_SECRET_KEY: ${{ secrets.STRIPE_TOK_ONE_TEST_SECRET_KEY }}");
    expect(workflowSource).toContain("STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET: ${{ secrets.STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET }}");
    expect(workflowSource).toContain("STRIPE_SECRET_KEY_LIVE: ${{ secrets.STRIPE_SECRET_KEY }}");
    expect(workflowSource).not.toMatch(/sk_test_[A-Za-z0-9]/);
    expect(workflowSource).not.toMatch(/whsec_[A-Za-z0-9]/);
  });

  it("stores Stripe mode and checkout session identifiers on Tok One subscriptions", () => {
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS stripe_mode text NOT NULL DEFAULT 'live'/i);
    expect(migrationSource).toMatch(/CHECK \(stripe_mode IN \('live', 'test'\)\)/i);
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text/i);
    expect(migrationSource).toContain("idx_tok_one_subscriptions_stripe_checkout_session_id");
  });

  it("syncs Tok One periods from Stripe Basil subscription items and trial dates", () => {
    expect(tokOneSharedSource).toContain("resolveTokOneSubscriptionPeriod");
    expect(tokOneSharedSource).toContain("subscription.items?.data");
    expect(tokOneSharedSource).toContain("current_period_start");
    expect(tokOneSharedSource).toContain("current_period_end");
    expect(tokOneSharedSource).toContain("subscription.trial_end");
    expect(tokOneSharedSource).toContain("period.currentPeriodStart");
    expect(tokOneSharedSource).toContain("period.currentPeriodEnd");
    expect(tokOneSharedSource).not.toContain("current_period_end: toIsoFromUnix(subscription.current_period_end, fallbackDate)");
  });

  it("renders Tok One benefit cards as accessible expandable controls keyed by benefit id", () => {
    expect(tokOnePageSource).toContain('id: "free_delivery"');
    expect(tokOnePageSource).toContain("details:");
    expect(tokOnePageSource).toContain("aria-expanded={isExpanded}");
    expect(tokOnePageSource).toContain("aria-controls={detailsId}");
    expect(tokOnePageSource).toContain("aria-hidden={!isExpanded}");
    expect(tokOnePageSource).toContain("benefit.details.map");
    expect(tokOnePageSource).toContain("key={benefit.id}");
    expect(tokOnePageSource).toContain("expandedBenefit === benefit.id");
  });
});
