import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("commercial demo Stripe test isolation", () => {
  const edge = read("supabase/functions/commercial-demo-checkout/index.ts");
  const liveCheckout = read("supabase/functions/create-checkout/index.ts");
  const stripeClient = read("supabase/functions/_shared/stripe-client.ts");
  const marketplaceFinance = read("supabase/functions/_shared/marketplace-finance.ts");
  const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");
  const config = read("supabase/config.toml");
  const runbook = read("docs/runbooks/commercial-demo-stripe-test.md");
  const deployWorkflowPath = resolve(root, ".github/workflows/deploy-production.yml");
  const secretWriterPath = resolve(root, "scripts/write-supabase-secrets-env.mjs");
  const journeyMigration = read("supabase/migrations/20260714232001_commercial_demo_realtime_order_journey.sql");
  const financeGuardMigration = read("supabase/migrations/20260714233500_commercial_demo_finance_isolation_guard.sql");

  it("uses one dedicated test-only Stripe secret without a live fallback", () => {
    const helper = stripeClient.slice(
      stripeClient.indexOf("export function getCommercialDemoStripeRuntime"),
      stripeClient.indexOf("export function getTokOneStripeRuntime"),
    );

    expect(helper).toContain('"STRIPE_SECRET_KEY_TEST"');
    expect(helper).toContain('"STRIPE_TOK_ONE_TEST_SECRET_KEY"');
    expect(helper).toContain('candidates.find((entry) => inferStripeRuntimeMode(entry.value) === "test")');
    expect(helper).toContain("DEMO_STRIPE_NOT_CONFIGURED");
    expect(helper).toContain("INVALID_TEST_STRIPE_KEY");
    expect(helper).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(helper).not.toContain("STRIPE_PERSONNAL_SECRET_KEY");
    expect(helper).not.toContain("STRIPE_TOK_ONE_SECRET_KEY");
    expect(edge).not.toContain("VITE_STRIPE");
    expect(stripeClient).toContain('kind === "commercial-demo-order"');
    expect(stripeClient).toContain("DEMO_CHECKOUT_REQUIRES_TEST_ENDPOINT");
    expect(stripeClient.slice(stripeClient.indexOf("export function getStripeVerificationRuntime")))
      .not.toContain('"STRIPE_SECRET_KEY_TEST"');
    expect(runbook).toContain("Ne jamais créer de variable `VITE_STRIPE_SECRET_KEY_TEST`");
  });

  it("authenticates a current commercial/admin and binds the active demo mapping", () => {
    expect(edge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(edge).toContain('actor.roles.includes("commercial")');
    expect(edge).toContain('actor.roles.includes("admin")');
    expect(edge).toContain('.from("commercial_demo_accounts")');
    expect(edge).toContain('.eq("user_id", order.commercial_user_id)');
    expect(edge).toContain('.eq("demo_restaurant_id", demoRestaurantId)');
    expect(edge).toContain('.eq("is_active", true)');
    expect(edge).toContain('restaurant.is_demo !== true');
    expect(edge).toContain('restaurant.status !== "demo"');
    expect(edge).toContain("restaurant.stripe_account_id");
    expect(edge).toContain("restaurant.stripe_connect_charges_enabled === true");
    expect(edge).toContain("restaurant.stripe_connect_payouts_enabled === true");
    expect(config).toContain("[functions.commercial-demo-checkout]\nverify_jwt = false");
  });

  it("takes the order and price from the isolated authoritative backend", () => {
    expect(edge).toContain('"commercial_demo_get_checkout_order"');
    expect(edge).toContain("{ p_session_id: demoSessionId }");
    expect(edge).toContain("unit_amount: order.total_amount_cents");
    expect(edge).toContain('order.currency !== "chf"');
    expect(edge).toContain('order.stripe_mode !== "test"');
    expect(edge).not.toContain("body.total_amount");
    expect(edge).not.toContain("body.items");
    expect(edge).not.toContain('.from("orders")');
    expect(edge).not.toContain('.from("financial_ledger")');
    expect(edge).not.toContain('.from("payment_transactions")');
  });

  it("creates an idempotent cs_test checkout with explicit demo metadata", () => {
    expect(edge).toContain("crypto.subtle.digest");
    expect(edge).toContain("{ idempotencyKey }");
    expect(edge).toContain('checkout_kind: CHECKOUT_KIND');
    expect(edge).toContain('demo_environment: DEMO_ENVIRONMENT');
    expect(edge).toContain('stripe_mode: "test"');
    expect(edge).toContain('finance_routing_mode: "demo_isolated"');
    expect(edge).toContain('no_financial_ledger: "true"');
    expect(edge).toContain('order.payment_status !== "requires_payment"');
    expect(edge).not.toContain('["requires_payment", "test_paid"].includes');
    expect(edge).toContain('stripeSession.livemode !== false');
    expect(edge).toContain('startsWith("cs_test_")');
    expect(edge).toContain('url.pathname = "/commercial/demo-live"');
    expect(edge).toContain("OWNED_PREVIEW_HOST");
    expect(edge).not.toContain('hostname.endsWith(".vercel.app")');
    expect(edge).toContain('replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}")');
  });

  it("confirms server-side only after retrieving and matching the paid test session", () => {
    expect(edge).toContain("stripe.checkout.sessions.retrieve");
    expect(edge).toContain('stripeSession.payment_status !== "paid"');
    expect(edge).toContain('stripeSession.status !== "complete"');
    expect(edge).toContain("Number(stripeSession.amount_total) !== order.total_amount_cents");
    expect(edge).toContain('"commercial_demo_confirm_test_payment"');
    expect(edge).toContain("p_checkout_session_id: stripeSession.id");
    expect(edge).toContain("p_payment_intent_id: paymentIntentId");
    expect(edge).toContain('payment_status: "test_paid"');
  });

  it("matches the service-role-only database payment contract", () => {
    expect(journeyMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.commercial_demo_get_checkout_order(p_session_id uuid)",
    );
    for (const field of [
      "'order_id', v_order.id",
      "'session_id', v_order.session_id",
      "'commercial_user_id', v_order.commercial_user_id",
      "'total_amount_cents', v_order.total_amount_cents",
      "'currency', v_order.currency",
      "'stripe_mode', v_order.stripe_mode",
      "'payment_status', v_order.payment_status",
    ]) {
      expect(journeyMigration).toContain(field);
    }
    expect(journeyMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.commercial_demo_confirm_test_payment(",
    );
    expect(journeyMigration).toContain("COALESCE(auth.jwt()->>'role', '') <> 'service_role'");
    expect(journeyMigration).toContain("v_order.payment_status = 'test_paid'");
    expect(journeyMigration).toContain("v_order.stripe_checkout_session_id IS DISTINCT FROM p_checkout_session_id");
    expect(journeyMigration).toContain("GRANT EXECUTE ON FUNCTION public.commercial_demo_confirm_test_payment(uuid, text, text)\n  TO service_role;");
    expect(journeyMigration).not.toContain("GRANT EXECUTE ON FUNCTION public.commercial_demo_confirm_test_payment(uuid, text, text)\n  TO authenticated");
  });

  it("returns before live fulfillment and shared finance for demo checkout events", () => {
    const guardIndex = stripeWebhook.indexOf("commercial_demo_event_ignored_by_live_webhook");
    const earlyReturnIndex = stripeWebhook.indexOf('ignored: "commercial_demo_test"', guardIndex);
    const liveFinalizeIndex = stripeWebhook.indexOf("const finalizedOrders = await finalizePaidOrderCheckout", guardIndex);
    const sharedFinanceIndex = stripeWebhook.indexOf("await recordCheckoutFinance({", guardIndex);

    expect(guardIndex).toBeGreaterThan(-1);
    expect(stripeWebhook).toContain("event.livemode === false");
    expect(stripeWebhook).toContain('checkoutKind === "commercial-demo-order"');
    expect(stripeWebhook).toContain('demoEnvironment === "commercial_demo"');
    expect(stripeWebhook).toContain('action: "ignore_commercial_demo_test_event"');
    expect(stripeWebhook).toContain("await markStripeWebhookEventSucceeded({ adminClient: supabaseAdmin, event })");
    expect(earlyReturnIndex).toBeGreaterThan(guardIndex);
    expect(liveFinalizeIndex).toBeGreaterThan(guardIndex);
    expect(sharedFinanceIndex).toBeGreaterThan(earlyReturnIndex);
    expect(liveCheckout).toContain('effectiveKind === "commercial-demo-order"');
    expect(liveCheckout).toContain("paiement Stripe Test dedie");
  });

  it("also blocks demo refunds before suspense-ledger reconciliation", () => {
    const genericGuardIndex = stripeWebhook.indexOf("commercial_demo_event_ignored_by_live_webhook");
    const refundCaseIndex = stripeWebhook.indexOf('case "charge.refunded"');
    const refundFinanceIndex = stripeWebhook.indexOf("await recordRefundFinance({", refundCaseIndex);

    expect(stripeWebhook).toContain('event.type === "charge.refunded"');
    expect(stripeWebhook).toContain('.from("commercial_demo_orders")');
    expect(stripeWebhook).toContain('.eq("stripe_payment_intent_id", paymentIntentId)');
    expect(genericGuardIndex).toBeGreaterThan(-1);
    expect(refundCaseIndex).toBeGreaterThan(genericGuardIndex);
    expect(refundFinanceIndex).toBeGreaterThan(refundCaseIndex);
    expect(marketplaceFinance).toContain("commercial_demo_refund_finance_write_blocked");
    expect(marketplaceFinance).toContain('.from("commercial_demo_orders")');
    expect(marketplaceFinance).toContain('.eq("stripe_payment_intent_id", input.paymentIntentId)');
    expect(stripeWebhook).toContain("no_financial_ledger: charge.metadata?.no_financial_ledger || null");
  });

  it("keeps defense-in-depth guards in the finance service and database", () => {
    expect(marketplaceFinance).toContain('normalizeKind(input.checkoutKind) === "commercial-demo-order"');
    expect(marketplaceFinance).toContain('normalizeKind(metadata.demo_environment) === "commercial_demo"');
    expect(marketplaceFinance).toContain('normalizeKind(metadata.finance_routing_mode) === "demo_isolated"');
    expect(marketplaceFinance).toContain("metadata.no_financial_ledger");
    expect(marketplaceFinance).toContain("commercial_demo_finance_write_blocked");
    expect(financeGuardMigration).toContain("financial_ledger_reject_commercial_demo");
    expect(financeGuardMigration).toContain("platform_revenue_reject_commercial_demo");
    expect(financeGuardMigration.match(/commercial-demo-order/g)?.length).toBeGreaterThanOrEqual(2);
    expect(financeGuardMigration.match(/demo_isolated/g)?.length).toBeGreaterThanOrEqual(2);
    expect(financeGuardMigration.match(/no_financial_ledger/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it.skipIf(!existsSync(deployWorkflowPath) || !existsSync(secretWriterPath))(
    "syncs the dedicated test key to Supabase without exposing it to Vite",
    () => {
      const deployWorkflow = read(".github/workflows/deploy-production.yml");
      const secretWriter = read("scripts/write-supabase-secrets-env.mjs");
      const deployJob = deployWorkflow.slice(
        deployWorkflow.indexOf("  deploy_supabase:"),
        deployWorkflow.indexOf("  deploy_frontend:"),
      );
      const beforeDeployJob = deployWorkflow.slice(0, deployWorkflow.indexOf("  deploy_supabase:"));

      expect(deployJob).toContain(
        "STRIPE_SECRET_KEY_TEST: ${{ secrets.STRIPE_SECRET_KEY_TEST }}",
      );
      expect(beforeDeployJob).not.toContain("STRIPE_SECRET_KEY_TEST");
      expect(deployWorkflow).not.toContain("VITE_STRIPE_SECRET_KEY_TEST");
      expect(secretWriter).toContain('"STRIPE_SECRET_KEY_TEST"');
    },
  );
});
