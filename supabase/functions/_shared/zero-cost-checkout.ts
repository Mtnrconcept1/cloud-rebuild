/** Accept only a completed, server-priced no-cost Zéro Attente checkout. */
export type ZeroCostCheckoutSession = {
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string> | null;
};

export function isCompletedNoCostZeroAttenteSession(session: ZeroCostCheckoutSession | null | undefined): boolean {
  const metadata = session?.metadata;
  return session?.mode === "payment"
    && session.status === "complete"
    && session.payment_status === "no_payment_required"
    && session.amount_total === 0
    && metadata?.checkout_kind === "zero-attente"
    && metadata.finance_routing_mode === "no_cost"
    && metadata.authoritative_total_cents === "0"
    && metadata.payment_attempt_version === "2";
}
