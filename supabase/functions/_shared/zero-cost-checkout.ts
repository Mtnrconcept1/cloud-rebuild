/** A free Checkout is a completed Stripe Session, not a successful card charge. */
export type ZeroCostCheckoutSession = {
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string> | null;
};

export function isCompletedNoCostZeroAttenteSession(
  session: ZeroCostCheckoutSession | null | undefined,
): boolean {
  const meta = session?.metadata;
  return session?.mode === "payment"
    && session.status === "complete"
    && session.payment_status === "no_payment_required"
    && session.amount_total === 0
    && meta?.checkout_kind === "zero-attente"
    && meta.finance_routing_mode === "no_cost"
    && meta.authoritative_total_cents === "0"
    && meta.payment_attempt_version === "2";
}
