export const CANONICAL_ORDER_STATUSES = [
  "pending",
  "preparing",
  "delivering",
  "delivered",
  "cancelled",
] as const;

export type CanonicalOrderStatus = (typeof CANONICAL_ORDER_STATUSES)[number];

const LEGACY_TO_CANONICAL_STATUS: Record<string, CanonicalOrderStatus> = {
  on_the_way: "delivering",
};

export function normalizeOrderStatus(status: string | null | undefined): CanonicalOrderStatus | string {
  if (!status) return "pending";
  return LEGACY_TO_CANONICAL_STATUS[status] || status;
}

export function mapOrderStatusToTrackingStatus(status: string | null | undefined): string | null {
  switch (normalizeOrderStatus(status)) {
    case "preparing":
      return "preparing";
    case "delivering":
      return "in_transit";
    case "delivered":
      return "delivered";
    default:
      return null;
  }
}