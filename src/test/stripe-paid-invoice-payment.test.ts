import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findSinglePaidInvoicePaymentIntent } from "../../supabase/functions/_shared/stripe-paid-invoice-payment";

const sample = {
  invoiceId: "in_testinvoice",
  amountPaidCents: 6900,
  hasMore: false,
  payments: [{
    invoice: "in_testinvoice",
    status: "paid",
    amount_paid: 6900,
    payment: { type: "payment_intent", payment_intent: "pi_verified" },
  }],
};

describe("Paid Stripe invoice PaymentIntent reconciliation", () => {
  it("matches exactly one paid invoice payment for the full amount", () => {
    expect(findSinglePaidInvoicePaymentIntent(sample)).toBe("pi_verified");
  });
  it("refuses amounts, invoice links, methods, and ambiguous pagination", () => {
    const edits = [
      { ...sample, amountPaidCents: 6800 },
      { ...sample, hasMore: true },
      { ...sample, payments: [] },
      { ...sample, payments: [...sample.payments, ...sample.payments] },
      { ...sample, payments: [{ ...sample.payments[0], invoice: "in_unrelated" }] },
      { ...sample, payments: [{ ...sample.payments[0], status: "open" }] },
      { ...sample, payments: [{ ...sample.payments[0], payment: { type: "charge" } }] },
    ];
    for (const input of edits) {
      expect(() => findSinglePaidInvoicePaymentIntent(input)).toThrow();
    }
  });
  it("requires that webhook verifies live, successful PI and matches the source invoice before finance", () => {
    const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
    expect(webhook).toContain('status: "paid"');
    expect(webhook).toContain("findSinglePaidInvoicePaymentIntent");
    expect(webhook).toContain('intent.status !== "succeeded"');
    expect(webhook).toContain("intent.livemode !== invoice.livemode");
    expect(webhook).toContain("intent.amount_received !== amountPaidCents");
    expect(webhook).toContain("TOK_INVOICE_LEGACY_INTENT_MISMATCH");
    expect(webhook).toContain("recordCheckoutFinance({");
    expect(webhook).toContain("paymentIntentId: invoicePaymentIntentId,");
  });
});
