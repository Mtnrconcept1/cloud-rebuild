import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const stripeClient = read("supabase/functions/_shared/stripe-client.ts");
const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");
const marketplaceFinance = read("supabase/functions/_shared/marketplace-finance.ts");
const createCheckout = read("supabase/functions/create-checkout/index.ts");
const authorizeMatchGroup = read("supabase/functions/authorize-match-group-order/index.ts");
const confirmMatchGroup = read("supabase/functions/confirm-match-group-authorization/index.ts");
const reconcileMatchGroup = read("supabase/functions/reconcile-match-group-authorizations/index.ts");
const captureMatchGroup = read("supabase/functions/capture-due-match-groups/index.ts");
const closeMatchGroup = read("supabase/functions/close-due-match-groups/index.ts");
const tokOneServer = read("supabase/functions/_shared/tok-one.ts");
const tokOneClient = read("src/hooks/useTokOne.ts");
const returnUrl = read("supabase/functions/_shared/return-url.ts");
const workflow = read(".github/workflows/deploy-production.yml");
const migration = read("supabase/migrations/20260717235004_stripe_security_and_finance_fail_closed.sql");
const migrationFiles = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((file) => /^\d{14}_.+\.sql$/.test(file));

describe("Stripe release-blocker hardening", () => {
  it("keeps every Supabase migration version unique", () => {
    const versions = migrationFiles.map((file) => file.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("binds every webhook signing secret to live or test mode", () => {
    expect(stripeClient).toContain("StripeWebhookSigningSecret");
    expect(stripeClient).toContain("STRIPE_WEBHOOK_SECRET_MODE_CONFLICT");
    expect(stripeClient).toContain("stripeWebhookEventMatchesExpectedMode");
    expect(stripeWebhook).toContain("mergeStripeWebhookSigningSecrets");
    expect(stripeWebhook).toContain("candidateEvent.livemode");
    expect(stripeWebhook).toContain("webhookSecret.expectedMode");
    expect(stripeWebhook).toContain("STRIPE_WEBHOOK_MODE_MISMATCH");
    expect(stripeWebhook).toContain('expectedMode: "live"');
  });

  it("forces live runtimes for every production checkout", () => {
    const productionRuntime = stripeClient.slice(
      stripeClient.indexOf("export function getStripeRuntimeForCheckoutKind"),
      stripeClient.indexOf("export function getStripeRuntimeForCheckoutKindAndMode"),
    );
    expect(productionRuntime.match(/expectedMode: "live"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(createCheckout).toContain("stripeMode: stripeRuntime.mode");
  });

  it("fails closed for live marketplace payments until Connect is ready", () => {
    expect(marketplaceFinance).toContain('"match-group"');
    expect(marketplaceFinance).toContain('if (stripeMode === "live")');
    expect(marketplaceFinance).toContain("MARKETPLACE_CONNECT_ROUTING_NOT_READY");
    expect(authorizeMatchGroup).toContain("MATCH_GROUP_CONNECT_ROUTING_NOT_READY");
    expect(authorizeMatchGroup).toContain("application_fee_amount");
    expect(authorizeMatchGroup).toContain("transfer_data");
  });

  it("keeps Tok One test subscriptions outside real entitlements", () => {
    expect(tokOneServer).toContain('.eq("stripe_mode", "live")');
    expect(tokOneServer).toContain("normalizedStripeMode");
    expect(tokOneClient).toContain('subscription.stripe_mode === "live"');
    expect(tokOneClient.match(/\.eq\("stripe_mode", "live"\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("makes Match Group authorization and capture retry-safe", () => {
    expect(authorizeMatchGroup).toContain("idempotencyKey: `match-group-authorization:");
    expect(authorizeMatchGroup).toContain("existingSession.status === \"open\"");
    expect(authorizeMatchGroup).toContain("MATCH_GROUP_SESSION_MAPPING_FAILED");
    expect(confirmMatchGroup).toContain('paymentIntent.status === "requires_capture"');
    expect(confirmMatchGroup).toContain("paymentIntent.amount_capturable");
    expect(reconcileMatchGroup).toContain('paymentIntent.status === "requires_capture"');
    expect(captureMatchGroup).toContain("idempotencyKey: `match-group:capture:");
    expect(captureMatchGroup).toContain("application_fee_amount");
    expect(captureMatchGroup).toContain("recordReconciledCheckoutFinance");
    expect(captureMatchGroup).toContain('recoveredIntent.status !== "succeeded"');
    expect(captureMatchGroup).toContain('status: "settlement_retry"');
  });

  it("allows only scheduler or service identities to run global Match Group workers", () => {
    for (const worker of [captureMatchGroup, reconcileMatchGroup, closeMatchGroup]) {
      expect(worker).toContain('if (!actor.isServiceRole) throw new HttpError(403, "SYSTEM_ACTOR_REQUIRED")');
    }
  });

  it("closes accounting, redirect and deployment bypasses", () => {
    expect(returnUrl).not.toContain('hostname.endsWith(".vercel.app")');
    expect(workflow).toContain('RELEASE_READINESS_STRICT: "true"');
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("developer_statement_stale_refresh_required");
    expect(migration).toContain("validated_ledger_checksum");
    expect(migration).toContain("financial_ledger_reject_commercial_demo");
    expect(migration).toContain("v_kind IN ('order', 'zero-attente', 'chefs-table', 'match-group')");
    expect(
      migration.match(/CREATE OR REPLACE FUNCTION public\.record_marketplace_checkout_ledger\(/g),
    ).toHaveLength(1);
    expect(migration.match(/~ '\^\[0-9\]\{1,5\}\$'/g)).toHaveLength(2);
  });
});
