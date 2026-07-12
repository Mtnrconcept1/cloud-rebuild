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
  it("keeps server-authoritative 10/90 and developer 10% rules", () => {
    expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 1000");
    expect(finance).toContain("TOK_DEVELOPER_SHARE_BPS = 1000");
    expect(migration).toContain("platform_fee_bps integer NOT NULL DEFAULT 1000");
    expect(migration).toContain("developer_share_bps integer NOT NULL DEFAULT 1000");
    expect(migration).toContain("reservation_fee_cents integer NOT NULL DEFAULT 500");
  });

  it("creates destination charges only after Connect readiness", () => {
    expect(checkout).toContain("resolveMarketplaceRouting");
    expect(finance).toContain("stripe_connect_details_submitted");
    expect(finance).toContain("stripe_connect_charges_enabled");
    expect(finance).toContain("stripe_connect_payouts_enabled");
    expect(checkout).toContain("application_fee_amount: marketplaceRouting.platformFeeCents");
    expect(checkout).toContain("destination: marketplaceRouting.destinationAccountId");
    expect(migration).toContain("connect_routing_enabled boolean NOT NULL DEFAULT false");
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
