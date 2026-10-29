import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Cloudprinter sandbox checkout", () => {
  it("routes marketing Print sandbox checkout through Stripe Test with a zero total", () => {
    const checkout = read("supabase/functions/print-checkout/index.ts");

    expect(checkout).toContain("getCloudprinterMode");
    expect(checkout).toContain("getStripeRuntimeForCheckoutKindAndMode");
    expect(checkout).toContain('providerMode === "sandbox"');
    expect(checkout).toContain('getStripeRuntimeForCheckoutKindAndMode("marketing-print", "test")');
    expect(checkout).toContain("checkoutAmountCents");
    expect(checkout).toContain("isSandbox ? 0 : Number(quote.customer_amount_cents)");
    expect(checkout).toContain("unit_amount: checkoutAmountCents");
    expect(checkout).toContain("print-sandbox-complete?session_id={CHECKOUT_SESSION_ID}");
  });

  it("marks sandbox orders as non-financial and never creates payment-intent data for a free Checkout", () => {
    const checkout = read("supabase/functions/print-checkout/index.ts");

    expect(checkout).toContain('print_sandbox: isSandbox ? "true" : "false"');
    expect(checkout).toContain('provider_mode: providerMode');
    expect(checkout).toContain('no_financial_ledger: isSandbox ? "true" : "false"');
    expect(checkout).toContain("quoted_customer_amount_cents");
    expect(checkout).toContain("customer_amount_cents: checkoutAmountCents");
    expect(checkout).toContain("...(isSandbox ? {} : { payment_intent_data: { metadata } })");
  });

  it("finalizes only a completed zero-cost Stripe Test session explicitly marked as Print sandbox", () => {
    const completion = read("supabase/functions/print-sandbox-complete/index.ts");
    const config = read("supabase/config.toml");

    expect(completion).toContain("getCloudprinterMode");
    expect(completion).toContain('getStripeRuntimeForCheckoutKindAndMode("marketing-print", "test")');
    expect(completion).toContain('metadata.checkout_kind === "marketing-print"');
    expect(completion).toContain('metadata.print_sandbox === "true"');
    expect(completion).toContain('metadata.provider_mode === "sandbox"');
    expect(completion).toContain('metadata.no_financial_ledger === "true"');
    expect(completion).toContain("session.livemode === false");
    expect(completion).toContain('session.payment_status === "no_payment_required"');
    expect(completion).toContain('session.payment_status === "paid"');
    expect(completion).toContain("enqueueNotification");
    expect(completion).toContain("transactional_email_key");
    expect(completion).toContain('session.status === "complete"');
    expect(completion).toContain("Number(session.amount_total || 0) === 0");
    expect(completion).toContain("finalizePaymentAttempt");
    expect(completion).toContain('adminClient.rpc("finalize_paid_print_order"');
    expect(config).toContain("[functions.print-sandbox-complete]\nverify_jwt = false");
  });
  it("recovers a Stripe Test payment after redirect and separates test print orders from financial accounting", () => {
    const action = read("supabase/functions/print-order-action/index.ts");
    const photos = read("src/pages/dashboard/DashboardPhotos.tsx");
    const accounting = read("src/pages/dashboard/DashboardFactures.tsx");
    expect(action).toContain('action === "sync_checkout"');
    expect(action).toContain("print-sandbox-complete?session_id=");
    expect(action).toContain('attempt.mode === "test"');
    expect(action).toContain("response.status !== 303");
    expect(photos).toContain('data-testid="print-checkout-return"');
    expect(photos).toContain('action: "sync_checkout"');
    expect(photos).toContain("En attente de confirmation serveur");
    expect(accounting).toContain("Suivi opérationnel des impressions");
    expect(accounting).toContain("sans figurer dans les recettes");
  });

});
