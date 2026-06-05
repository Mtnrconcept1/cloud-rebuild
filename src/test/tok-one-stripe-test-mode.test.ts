import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const stripeClientSource = readFileSync(resolve(root, "supabase/functions/_shared/stripe-client.ts"), "utf8");
const createCheckoutSource = readFileSync(resolve(root, "supabase/functions/create-checkout/index.ts"), "utf8");
const stripeWebhookSource = readFileSync(resolve(root, "supabase/functions/stripe-webhook/index.ts"), "utf8");
const manageTokOneSource = readFileSync(resolve(root, "supabase/functions/manage-tok-one-subscription/index.ts"), "utf8");
const tokOnePageSource = readFileSync(resolve(root, "src/pages/TokOne.tsx"), "utf8");
const secretsScriptSource = readFileSync(resolve(root, "scripts/write-supabase-secrets-env.mjs"), "utf8");
const workflowSource = readFileSync(resolve(root, ".github/workflows/deploy-production.yml"), "utf8");
const migrationSource = readFileSync(
  resolve(root, "supabase/migrations/20260605183251_tok_one_stripe_test_mode_support.sql"),
  "utf8",
);

describe("Tok One Stripe test mode", () => {
  it("keeps the Tok One Stripe test key server-side and scoped to Edge Functions", () => {
    expect(stripeClientSource).toContain("STRIPE_TOK_ONE_TEST_SECRET_KEY");
    expect(stripeClientSource).toContain("STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET");
    expect(stripeClientSource).toContain("STRIPE_TOK_ONE_TEST_WEBHOOK_SIGNING_SECRET");
    expect(stripeClientSource).toContain('kind === "tok-one"');
    expect(stripeClientSource).toContain('names: ["STRIPE_TOK_ONE_TEST_SECRET_KEY"]');
    expect(stripeClientSource).toContain('purpose: "Tok One Stripe test secret"');
    expect(stripeClientSource).toContain('expectedMode: "test"');
    expect(stripeClientSource).toContain("inferStripeRuntimeMode");
    expect(stripeClientSource).not.toContain("VITE_STRIPE_TOK_ONE_TEST_SECRET_KEY");
  });

  it("creates Tok One Checkout sessions with the dedicated runtime and records the Stripe mode", () => {
    expect(createCheckoutSource).toContain("getStripeRuntimeForCheckoutKind(effectiveKind)");
    expect(createCheckoutSource).toContain("const stripe = stripeRuntime.stripe");
    expect(createCheckoutSource).toContain("stripe_mode: stripeRuntime.mode");
    expect(createCheckoutSource).toContain('mode: effectiveKind === "tok-one" ? "subscription" : "payment"');
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
    expect(workflowSource).toContain("STRIPE_TOK_ONE_TEST_SECRET_KEY: ${{ secrets.STRIPE_TOK_ONE_TEST_SECRET_KEY }}");
    expect(workflowSource).toContain("STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET: ${{ secrets.STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET }}");
    expect(workflowSource).not.toMatch(/sk_test_[A-Za-z0-9]/);
    expect(workflowSource).not.toMatch(/whsec_[A-Za-z0-9]/);
  });

  it("stores Stripe mode and checkout session identifiers on Tok One subscriptions", () => {
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS stripe_mode text NOT NULL DEFAULT 'live'/i);
    expect(migrationSource).toMatch(/CHECK \(stripe_mode IN \('live', 'test'\)\)/i);
    expect(migrationSource).toMatch(/ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text/i);
    expect(migrationSource).toContain("idx_tok_one_subscriptions_stripe_checkout_session_id");
  });
});
