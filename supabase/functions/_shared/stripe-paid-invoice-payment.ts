/**
 * Stripe API 2026+ keeps invoice -> PaymentIntent links in invoice_payments.
 * An invoice event might omit legacy invoice.payment_intent even if it is paid.
 * Fail closed on partial/multiple payments: never invent a PaymentIntent or amount.
 */
export type PaidInvoicePayment = {
  invoice?: string | { id?: string } | null;
  status?: string;
  amount_paid?: number;
  payment?: { type?: string; payment_intent?: string | { id?: string } | null } | null;
};
export function findSinglePaidInvoicePaymentIntent(input: {
  invoiceId: string;
  amountPaidCents: number;
  payments: PaidInvoicePayment[];
  hasMore: boolean;
}): string {
  if (!/^in_[a-zA-Z0-9]+$/.test(input.invoiceId)
    || !Number.isSafeInteger(input.amountPaidCents)
    || input.amountPaidCents <= 0
    || input.hasMore
    || !Array.isArray(input.payments)
  ) throw new Error("TOK_PAID_INVOICE_PAYMENT_DETAILS_INVALID");

  const paid = input.payments.filter((payment) => payment.status === "paid"
    && (typeof payment.invoice === "string" ? payment.invoice : payment.invoice?.id) === input.invoiceId);
  if (paid.length !== 1) throw new Error("TOK_PAID_INVOICE_PAYMENT_NOT_UNIQUE");
  const payment = paid[0];
  if (payment.payment?.type !== "payment_intent"
    || Number(payment.amount_paid) !== input.amountPaidCents
  ) throw new Error("TOK_PAID_INVOICE_PAYMENT_AMOUNT_OR_KIND_MISMATCH");
  const id = typeof payment.payment.payment_intent === "string"
    ? payment.payment.payment_intent
    : payment.payment.payment_intent?.id;
  if (!id || !/^pi_[a-zA-Z0-9]+$/.test(id)) {
    throw new Error("TOK_PAID_INVOICE_PAYMENT_INTENT_MISSING");
  }
  return id;
}
