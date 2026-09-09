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
  });

  it("marks sandbox orders as non-financial and never creates payment-intent data for a free Checkout", () => {
    const checkout = read("supabase/functions/print-checkout/index.ts");

    expect(checkout).toContain('print_sandbox: isSandbox ? "true" : "false"');
    expect(checkout).toContain('provider_mode: providerMode');
    expect(checkout).toContain('no_financial_ledger: isSandbox ? "true" : "false"');
    expect(checkout).toContain("quoted_customer_amount_cents");
    expect(checkout).toContain("...(isSandbox ? {} : { payment_intent_data: { metadata } })");
  });

  it("finalizes only a completed zero-cost Stripe Test session explicitly marked as Print sandbox", () => {
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(webhook).toContain("isNoCostPrintSandboxCheckout");
    expect(webhook).toContain('session.metadata?.checkout_kind === "marketing-print"');
    expect(webhook).toContain('session.metadata?.print_sandbox === "true"');
    expect(webhook).toContain("event.livemode === false");
    expect(webhook).toContain('session.payment_status === "no_payment_required"');
    expect(webhook).toContain("Number(session.amount_total || 0) === 0");
    expect(webhook).toContain("|| isNoCostPrintSandboxCheckout");
  });
});
