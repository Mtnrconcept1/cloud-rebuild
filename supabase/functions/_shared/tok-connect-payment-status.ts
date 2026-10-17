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
  const persistedTerminal = ["finalized", "cancelled", "failed", "expired"].includes(input.persistedState);
  const indeterminate = input.providerLookupIndeterminate && !persistedTerminal;
  const paymentReceived = finalized || (!input.providerLookupIndeterminate && (
    input.stripePaymentStatus === "paid" || input.observedState === "paid"
  ));
  const state = persistedTerminal
    ? input.persistedState
    : indeterminate
      ? "indeterminate"
      : input.observedState;
  const terminal = ["finalized", "cancelled", "failed", "expired"].includes(state);

  // A received, terminal or uncertain payment is never safe to start a second checkout.
  // retryable only describes rechecking an existing, still-open operation.
  const retryable = !indeterminate && !paymentReceived && !terminal;

  // A stale Stripe response must never reopen a cancelled/failed/expired attempt.
  const checkoutUrl = paymentReceived || indeterminate || terminal ? null : input.checkoutUrl;
  return { state, paymentReceived, finalized, indeterminate, retryable, checkoutUrl };
}
