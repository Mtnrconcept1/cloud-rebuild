import { normalizePaymentAttemptId, PAYMENT_ATTEMPT_QUERY_PARAM } from "./paymentAttempt";

export type StripeReturnStatus = "success" | "cancelled" | null;

export function parseStripeReturnSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawStatus = params.get("status");
  const rawSessionId = params.get("session_id");
  const paymentAttemptId = normalizePaymentAttemptId(params.get(PAYMENT_ATTEMPT_QUERY_PARAM));
  const sessionId = typeof rawSessionId === "string" && rawSessionId.trim()
    ? rawSessionId.trim()
    : null;
  const status: StripeReturnStatus = rawStatus === "success" || rawStatus === "cancelled"
    ? rawStatus
    : null;

  return {
    status,
    sessionId,
    paymentAttemptId,
    isStripeReturn: status === "cancelled"
      || (status === "success" && Boolean(sessionId || paymentAttemptId)),
  };
}

export function buildAuthRedirectTarget(pathname: string, search: string) {
  const normalizedPath = pathname || "/";
  const normalizedSearch = search || "";
  return `/auth?redirect=${encodeURIComponent(`${normalizedPath}${normalizedSearch}`)}`;
}
