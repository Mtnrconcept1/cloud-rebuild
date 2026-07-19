import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dedicated commercial demo payment simulator", () => {
  const edge = read("supabase/functions/commercial-demo-checkout/index.ts");
  const migration = read(
    "supabase/demo-migrations/20260719150000_simulated_commercial_demo_payments.sql",
  );
  const journey = read("src/lib/commercialDemoJourney.ts");
  const workspace = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
  const experience = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const secretsWriter = read("scripts/write-commercial-demo-secrets-env.mjs");
  const workflow = read(".github/workflows/deploy-production.yml");
  const config = read("supabase/config.toml");
  const liveCheckout = read("supabase/functions/create-checkout/index.ts");
  const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");

  it("runs only in the dedicated demo project and authenticates the commercial actor", () => {
    expect(edge).toContain('DEMO_PROJECT_URL = "https://hzldfhjfgjcadmpghhhf.supabase.co"');
    expect(edge).toContain("requireDedicatedDemoRuntime()");
    expect(edge).toContain('Deno.env.get("SUPABASE_URL")');
    expect(edge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(edge).toContain('actor.roles.includes("commercial")');
    expect(edge).toContain('actor.roles.includes("admin")');
    expect(edge).toContain('.from("commercial_demo_accounts")');
    expect(edge).toContain('.eq("is_active", true)');
    expect(edge).toContain("restaurant.is_active !== true");
    expect(edge).toContain('restaurant.status !== "demo"');
    expect(config).toContain("[functions.commercial-demo-checkout]\nverify_jwt = false");
  });

  it("uses authoritative order data and never calls a payment provider", () => {
    expect(edge).toContain('"commercial_demo_get_checkout_order"');
    expect(edge).toContain("{ p_session_id: demoSessionId }");
    expect(edge).toContain("order.total_amount_cents");
    expect(edge).toContain('order.currency !== "chf"');
    expect(edge).not.toContain("getCommercialDemoStripeRuntime");
    expect(edge).not.toContain("stripe.checkout");
    expect(edge).not.toContain("checkout.stripe.com");
    expect(edge).not.toContain('from("orders")');
    expect(edge).not.toContain('from("financial_ledger")');
    expect(edge).not.toContain('from("payment_transactions")');
  });

  it("generates a deterministic reference and confirms through one service-only RPC", () => {
    expect(edge).toContain("crypto.subtle.digest");
    expect(edge).toContain("demo_sim_");
    expect(edge).toContain('"commercial_demo_confirm_simulated_payment"');
    expect(edge).toContain("p_simulation_id: simulationId");
    expect(edge).toContain('payment_provider: "none"');
    expect(edge).toContain("payment_provider_called: false");
    expect(edge).toContain("no_financial_ledger: true");

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.commercial_demo_confirm_simulated_payment(",
    );
    expect(migration).toContain("COALESCE(auth.jwt()->>'role', '') <> 'service_role'");
    expect(migration).toContain("v_order.payment_status = 'test_paid'");
    expect(migration).toContain(
      "v_order.stripe_checkout_session_id IS DISTINCT FROM p_simulation_id",
    );
    expect(migration).toContain("'simulated_payment_confirmed'");
    expect(migration).toContain("'payment_provider_called', false");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("updates the real demo dashboards immediately without a redirect round-trip", () => {
    expect(journey).toContain("simulateCommercialDemoPayment");
    expect(journey).toContain('mode: "simulated"');
    expect(journey).toContain('payment_provider: "none"');
    expect(journey).not.toContain("checkout.stripe.com");
    expect(journey).not.toContain("confirmCommercialDemoCheckout");
    expect(workspace).toContain("simulateCommercialDemoPayment");
    expect(workspace).toContain("onSuccess: (result) => void syncSnapshot(result.snapshot)");
    expect(workspace).toContain("Simuler le paiement accepté");
    expect(workspace).not.toContain("4242 4242 4242 4242");
    expect(workspace).not.toContain("commercial-demo:open-checkout");
    expect(experience).toContain("Paiement simulé · aucun débit");
    expect(experience).not.toContain("checkout.stripe.com");
  });

  it("does not require or inject any Stripe credential into the demo project", () => {
    expect(secretsWriter).toContain('["DEMO_PAYMENT_MODE", "simulated"]');
    expect(secretsWriter).not.toMatch(/STRIPE_/);
    const demoSecretStep = workflow.slice(
      workflow.indexOf("Prepare dedicated commercial demo secrets without payment-provider credentials"),
      workflow.indexOf("Configure dedicated demo Auth redirects"),
    );
    expect(demoSecretStep).not.toContain("STRIPE_");
    expect(demoSecretStep).toContain("OPENAI_API_KEY");
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
