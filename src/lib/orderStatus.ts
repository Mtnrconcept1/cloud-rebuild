export const CANONICAL_ORDER_STATUSES = [
  "pending",
  "pending_payment",
  "confirmed",
  "preparing",
  "ready",
  "delivering",
  "delivered",
  "cancelled",
  "payment_failed",
] as const;

export type CanonicalOrderStatus = (typeof CANONICAL_ORDER_STATUSES)[number];

const LEGACY_TO_CANONICAL_STATUS: Record<string, CanonicalOrderStatus> = {
  on_the_way: "delivering",
  ready_for_pickup: "ready",
  picked_up: "delivered",
};

export function normalizeOrderStatus(status: string | null | undefined): CanonicalOrderStatus | string {
  if (!status) return "pending";
  return LEGACY_TO_CANONICAL_STATUS[status] || status;
}

export function mapOrderStatusToTrackingStatus(status: string | null | undefined): string | null {
  switch (normalizeOrderStatus(status)) {
    case "preparing":
      return "preparing";
    case "ready":
      return "ready_for_pickup";
    case "delivering":
      return "in_transit";
    case "delivered":
      return "delivered";
    default:
      return null;
  }
}
