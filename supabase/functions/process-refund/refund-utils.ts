export type RefundTargetType = "order" | "reservation";

export function normalizeRefundTargetType(value: unknown): RefundTargetType | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "order" || normalized === "reservation") {
    return normalized;
  }
  return null;
}

export function toMoney(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getRemainingRefundAmount(totalAmount: unknown, refundedAmount: unknown) {
  return Math.max(0, toMoney(totalAmount) - toMoney(refundedAmount));
}

export function getStripeRefundReason(cancelledBy: unknown): "requested_by_customer" | undefined {
  const normalized = String(cancelledBy || "").trim().toLowerCase();
  if (normalized === "customer") {
    return "requested_by_customer";
  }
  return undefined;
}

export function pickFirstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

