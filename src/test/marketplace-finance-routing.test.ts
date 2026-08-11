import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const checkout = read("supabase/functions/create-checkout/index.ts");
const finance = read("supabase/functions/_shared/marketplace-finance.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const refund = read("supabase/functions/process-refund/index.ts");
const migration = read("supabase/migrations/20260712000526_marketplace_finance_routing.sql");
const cart = read("src/pages/Panier.tsx");

describe("TOK marketplace finance routing", () => {
  it("uses a flat 10% marketplace fee and seals the active plan snapshot", () => {
    expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 1000");
    expect(finance).toContain("TOK_ORDER_DEVELOPER_SHARE_BPS = 100");
    expect(finance).toContain("marketplace_commission_bps_snapshot");
    expect(finance).toContain('"subscription_snapshot"');
    expect(finance).toContain("MAX_FAIR_GROWTH_PLATFORM_FEE_BPS = 1000");
    expect(finance).toContain('ENTITLED_SUBSCRIPTION_STATUSES = new Set([\n  "active",\n  "trialing"');
    expect(finance).not.toContain('"past_due",\n  "trialing"');
    expect(finance).not.toContain('"paused",');
    expect(finance).toContain("current_period_end");
    expect(finance).toContain("currentPeriodEndMs > Date.now()");
    expect(finance).toContain('pricingRateSource: "runtime_default"');
    expect(finance).toContain("platformFeeBps: TOK_PLATFORM_FEE_BPS");
    expect(finance).toContain("pricingPlanSlug: null");
    expect(finance).not.toContain("input.financeConfig?.platform_fee_bps ?? TOK_PLATFORM_FEE_BPS");
    expect(migration).toContain("developer_share_bps integer NOT NULL DEFAULT 1000");
    expect(migration).toContain("reservation_fee_cents integer NOT NULL DEFAULT 500");
  });

  it("creates destination charges only after Connect readiness", () => {
    expect(checkout).toContain("resolveMarketplaceRouting");
    expect(finance).toContain("stripe_connect_details_submitted");
    expect(finance).toContain("stripe_connect_charges_enabled");
    expect(finance).toContain("stripe_connect_payouts_enabled");
    expect(checkout).toContain("application_fee_amount: marketplaceRouting.stripeApplicationFeeCents");
    expect(checkout).toContain("destination: marketplaceRouting.destinationAccountId");
    expect(migration).toContain("connect_routing_enabled boolean NOT NULL DEFAULT false");
  });

  it("keeps tips and delivery outside the plan commission and seals the basis", () => {
    expect(finance).toContain("commissionableCents");
    expect(finance).toContain("tipCents");
    expect(finance).toContain("deliveryPassThroughCents");
    expect(finance).toContain("stripeApplicationFeeCents = platformFeeCents + deliveryPassThroughCents");
    expect(checkout).toContain('finance_snapshot_version: "fair_growth_v1"');
    expect(checkout).toContain("commissionable_cents");
    expect(checkout).toContain("tip_cents");
    expect(checkout).toContain("delivery_pass_through_cents");
    expect(checkout).toContain("pricing_version");
    expect(checkout).toContain("sealPaymentAttemptRequest");
    expect(finance).toContain("assertSealedMarketplaceFinanceSnapshot");
    expect(finance).toContain('from("payment_attempts")');
    expect(finance).toContain("assertSameSnapshotFields");
    expect(webhook).toContain("...session.metadata");
  });

  it("fails closed for multi-restaurant checkout and prevents it in the cart", () => {
    expect(checkout).toContain("Une session de paiement doit concerner un seul restaurant");
    expect(checkout).toContain("Une session La Table du Chef doit concerner un seul restaurant");
    expect(cart).toContain("Un paiement par restaurant");
  });

  it("uses a stable Checkout idempotency key", () => {
    expect(checkout).toContain("idempotencySource");
    expect(checkout).toContain("idempotencyKey: `tok-checkout:");
    expect(checkout).toContain("stripe.checkout.sessions.create(sessionParams, checkoutRequestOptions)");
  });

  it("reverses destination transfers and application fees on refunds", () => {
    expect(refund).toContain("originalPaymentIntent.transfer_data?.destination");
    expect(refund).toContain("reverse_transfer: true");
    expect(refund).toContain("refund_application_fee: true");
    expect(webhook).toContain("recordRefundFinance");
    expect(migration).toContain("record_marketplace_refund_ledger");
  });

  it("records paid checkouts, recurring invoices and developer statements", () => {
    expect(webhook).toContain('case "checkout.session.async_payment_succeeded"');
    expect(webhook).toContain('case "invoice.payment_succeeded"');
    expect(webhook).toContain("recordCheckoutFinance");
    expect(migration).toContain("record_marketplace_checkout_ledger");
    expect(migration).toContain("private_finance.record_paid_restaurant_invoice");
    expect(migration).toContain("refresh_developer_statement");
    expect(migration).toContain("developer_payable");
  });
});
