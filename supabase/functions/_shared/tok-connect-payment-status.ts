/**
 * Payment and fulfilment are separate facts.
 *
 * A completed Stripe Checkout can precede the TOK webhook/database
 * reconciliation. A transient Stripe lookup error must not downgrade an
 * already-finalized, server-persisted attempt or re-open a payment URL.
 *
 * This only projects server-side state. It never trusts a browser or MCP
 * caller to claim that a payment succeeded.
 */
export type TokPaymentStatusInput = {
  persistedState: string;
  observedState: string;
  stripePaymentStatus: string | null;
  checkoutUrl: string | null;
  providerLookupIndeterminate: boolean;
};

export type TokPaymentStatusOutcome = {
  state: string;
  paymentReceived: boolean;
  finalized: boolean;
  indeterminate: boolean;
  retryable: boolean;
  checkoutUrl: string | null;
};

export function resolveTokPaymentStatus(input: TokPaymentStatusInput): TokPaymentStatusOutcome {
  const finalized = input.persistedState === "finalized";
  const indeterminate = input.providerLookupIndeterminate && !finalized;
  const paymentReceived = finalized || (!input.providerLookupIndeterminate && (
    input.stripePaymentStatus === "paid" || input.observedState === "paid"
  ));
  const state = finalized
    ? "finalized"
    : indeterminate
      ? "indeterminate"
      : input.observedState;

  // A received or uncertain payment is never safe to start a second checkout.
  // retryable here means that rechecking the same operation may be useful.
  const retryable = !indeterminate && !paymentReceived
    && !["finalized", "cancelled", "failed"].includes(state);

  // Do not offer an already-paid or ambiguous Checkout Session for reopening.
  const checkoutUrl = paymentReceived || indeterminate ? null : input.checkoutUrl;
  return { state, paymentReceived, finalized, indeterminate, retryable, checkoutUrl };
}
