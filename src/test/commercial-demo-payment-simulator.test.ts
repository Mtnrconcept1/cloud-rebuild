import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dedicated commercial demo Stripe Test checkout", () => {
  const edge = read("supabase/functions/commercial-demo-checkout/index.ts");
  const journey = read("src/lib/commercialDemoJourney.ts");
  const experience = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const secretsWriter = read("scripts/write-commercial-demo-secrets-env.mjs");
  const workflow = read(".github/workflows/deploy-production.yml");
  const liveCheckout = read("supabase/functions/create-checkout/index.ts");
  const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");

  it("runs only in the dedicated demo project and authenticates the commercial actor", () => {
    expect(edge).toContain('DEMO_PROJECT_URL = "https://hzldfhjfgjcadmpghhhf.supabase.co"');
    expect(edge).toContain("requireDedicatedDemoRuntime()");
    expect(edge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(edge).toContain('actor.roles.includes("commercial")');
    expect(edge).toContain('.from("commercial_demo_accounts")');
    expect(edge).toContain('restaurant.status !== "demo"');
  });

  it("uses authoritative demo order data and Stripe Test only", () => {
    expect(edge).toContain('"commercial_demo_get_checkout_order"');
    expect(edge).toContain("order.total_amount_cents");
    expect(edge).toContain('order.currency !== "chf"');
    expect(edge).toContain('order.stripe_mode !== "test"');
    expect(edge).toContain("getCommercialDemoStripeRuntime");
    expect(edge).toContain("stripe.checkout.sessions.create");
    expect(edge).toContain("stripe.checkout.sessions.retrieve");
    expect(edge).toContain("stripeSession.livemode !== false");
    expect(edge).not.toContain('from("orders")');
    expect(edge).not.toContain('from("financial_ledger")');
    expect(edge).not.toContain('from("payment_transactions")');
  });

  it("binds cs_test sessions to the demo order before service-only confirmation", () => {
    expect(edge).toContain("requireTestCheckoutSessionId");
    expect(edge).toContain("cs_test_");
    expect(edge).toContain("assertStripeSessionMatchesOrder");
    expect(edge).toContain('finance_routing_mode: "demo_isolated"');
    expect(edge).toContain('no_financial_ledger: "true"');
    expect(edge).toContain('"commercial_demo_confirm_test_payment"');
    expect(edge).toContain("p_checkout_session_id: stripeSession.id");
    expect(edge).toContain('payment_status: "test_paid"');
  });

  it("opens only checkout.stripe.com and confirms the snapshot on return", () => {
    expect(journey).toContain("createCommercialDemoCheckout");
    expect(journey).toContain("confirmCommercialDemoCheckout");
    expect(journey).toContain("openCommercialDemoCheckout");
    expect(journey).toContain("checkout.stripe.com");
    expect(journey).toContain('type: "commercial-demo:open-checkout"');
    expect(journey).toContain("isStripeTestCheckoutSessionId");
    expect(experience).toContain("confirmCommercialDemoCheckout");
    expect(experience).toContain("isStripeTestCheckoutSessionId");
    expect(experience).toContain("checkout.stripe.com");
  });

  it("provisions only a Stripe test secret into the dedicated demo project", () => {
    expect(secretsWriter).toContain('readPrivateEnvValue(providerSource, "STRIPE_SECRET_KEY_TEST")');
    expect(secretsWriter).toContain('startsWith("sk_test_")');
    expect(secretsWriter).toContain('["STRIPE_SECRET_KEY_TEST", stripeTest]');
    expect(secretsWriter).toContain('["DEMO_PAYMENT_MODE", "stripe_test"]');
    expect(secretsWriter).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(secretsWriter).not.toContain("STRIPE_PERSONNAL_SECRET_KEY");
    expect(workflow).toContain("write-commercial-demo-secrets-env.mjs");
    expect(workflow).toContain("commercial-demo.providers.env");
  });

  it("leaves production Stripe checkout and webhook defenses unchanged", () => {
    expect(liveCheckout).toContain('effectiveKind === "commercial-demo-order"');
    expect(liveCheckout).toContain("if (isCommercialDemoHostRequest(req))");
    expect(stripeWebhook).toContain("commercial_demo_event_ignored_by_live_webhook");
    expect(stripeWebhook).toContain('checkoutKind === "commercial-demo-order"');
    expect(stripeWebhook).toContain("ignore_commercial_demo_test_event");
  });
});
