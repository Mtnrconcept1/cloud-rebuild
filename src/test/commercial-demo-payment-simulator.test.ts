import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dedicated commercial demo Stripe Test checkout", () => {
  const edge = read("supabase/functions/commercial-demo-checkout/index.ts");
  const journey = read("src/lib/commercialDemoJourney.ts");
  const workspace = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
  const experience = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const secretsWriter = read("scripts/write-commercial-demo-secrets-env.mjs");
  const workflow = read(".github/workflows/deploy-production.yml");
  const config = read("supabase/config.toml");
  const liveCheckout = read("supabase/functions/create-checkout/index.ts");
  const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");

  it("authenticates only a commercial or admin actor on the isolated demo route", () => {
    expect(edge).toContain("if (!isCommercialDemoCheckoutRequestAllowed(req))");
    expect(edge).toContain("COMMERCIAL_DEMO_HOST_REQUIRED");
    expect(edge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(edge).toContain('actor.roles.includes("commercial")');
    expect(edge).toContain('actor.roles.includes("admin")');
    expect(edge).toContain('.from("commercial_demo_accounts")');
    expect(edge).toContain('.eq("is_active", true)');
    expect(edge).toContain("restaurant.is_demo !== true");
    expect(edge).toContain("restaurant.is_active !== true");
    expect(edge).toContain('restaurant.status !== "demo"');
    expect(edge).toContain("restaurant.stripe_account_id");
    expect(config).toContain("[functions.commercial-demo-checkout]\nverify_jwt = false");
  });

  it("uses authoritative demo order data with Stripe Test only", () => {
    expect(edge).toContain('"commercial_demo_get_checkout_order"');
    expect(edge).toContain("{ p_session_id: demoSessionId }");
    expect(edge).toContain("order.total_amount_cents");
    expect(edge).toContain('order.currency !== "chf"');
    expect(edge).toContain('order.stripe_mode !== "test"');
    expect(edge).toContain("getCommercialDemoStripeRuntime");
    expect(edge).toContain('stripeRuntime.mode !== "test"');
    expect(edge).toContain('"STRIPE_SECRET_KEY_TEST"');
    expect(edge).toContain('"STRIPE_TOK_ONE_TEST_SECRET_KEY"');
    expect(edge).toContain("stripe.checkout.sessions.create");
    expect(edge).toContain("stripe.checkout.sessions.retrieve");
    expect(edge).toContain("stripeSession.livemode !== false");
    expect(edge).not.toContain('from("orders")');
    expect(edge).not.toContain('from("financial_ledger")');
    expect(edge).not.toContain('from("payment_transactions")');
  });

  it("creates an idempotent cs_test checkout and confirms only a paid Stripe session", () => {
    expect(edge).toContain("crypto.subtle.digest");
    expect(edge).toContain("commercial-demo-checkout:");
    expect(edge).toContain("idempotencyKey");
    expect(edge).toContain('startsWith("cs_test_")');
    expect(edge).toContain('stripeSession.payment_status !== "paid"');
    expect(edge).toContain('stripeSession.status !== "complete"');
    expect(edge).toContain('"commercial_demo_confirm_test_payment"');
    expect(edge).toContain("p_checkout_session_id: stripeSession.id");
    expect(edge).toContain("no_financial_ledger: true");
  });

  it("opens Stripe Test in the browser and confirms the returned session server-side", () => {
    expect(journey).toContain("createCommercialDemoCheckout");
    expect(journey).toContain("confirmCommercialDemoCheckout");
    expect(journey).toContain("openCommercialDemoCheckout");
    expect(journey).toContain("isStripeTestCheckoutSessionId");
    expect(journey).toContain('url.hostname !== "checkout.stripe.com"');
    expect(journey).toContain('type: "commercial-demo:open-checkout"');
    expect(journey).not.toContain('action: "simulate"');
    expect(workspace).toContain("createCommercialDemoCheckout");
    expect(workspace).toContain("Payer avec Stripe Test");
    expect(workspace).toContain("4242 4242 4242 4242");
    expect(experience).toContain("confirmCommercialDemoCheckout");
    expect(experience).toContain('checkoutUrl.hostname !== "checkout.stripe.com"');
    expect(experience).toContain("Stripe Test uniquement");
  });

  it("provisions only a private sk_test credential into the demo project", () => {
    expect(secretsWriter).toContain("readPrivateProviderSecrets()");
    expect(secretsWriter).toContain("providerSecrets.STRIPE_SECRET_KEY_TEST");
    expect(secretsWriter).toContain('startsWith("sk_test_")');
    expect(secretsWriter).toContain('["STRIPE_SECRET_KEY", stripeTestSecret]');
    expect(secretsWriter).toContain('["STRIPE_SECRET_KEY_TEST", stripeTestSecret]');
    expect(secretsWriter).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(secretsWriter).not.toContain("sk_live_");
    expect(workflow).toContain(
      'secrets set --env-file "${RUNNER_TEMP}/commercial-demo.providers.env" --project-ref "$COMMERCIAL_DEMO_PROJECT_REF"',
    );
  });

  it("leaves production Stripe checkout and webhook defenses unchanged", () => {
    expect(liveCheckout).toContain('effectiveKind === "commercial-demo-order"');
    expect(liveCheckout).toContain("if (isCommercialDemoHostRequest(req))");
    expect(stripeWebhook).toContain("commercial_demo_event_ignored_by_live_webhook");
    expect(stripeWebhook).toContain('checkoutKind === "commercial-demo-order"');
    expect(stripeWebhook).toContain("ignore_commercial_demo_test_event");
  });
});
