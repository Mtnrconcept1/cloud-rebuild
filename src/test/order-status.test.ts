import { describe, expect, it } from "vitest";

import {
  CANONICAL_ORDER_STATUSES,
  mapOrderStatusToTrackingStatus,
  normalizeOrderStatus,
} from "@/lib/orderStatus";

describe("orderStatus helpers", () => {
  it("keeps pending payment and payment failure as explicit customer-facing states", () => {
    expect(CANONICAL_ORDER_STATUSES).toContain("paid");
    expect(CANONICAL_ORDER_STATUSES).toContain("pending_payment");
    expect(CANONICAL_ORDER_STATUSES).toContain("picked_up");
    expect(CANONICAL_ORDER_STATUSES).toContain("refunded");
    expect(CANONICAL_ORDER_STATUSES).toContain("payment_failed");
    expect(normalizeOrderStatus("paid")).toBe("paid");
    expect(normalizeOrderStatus("pending_payment")).toBe("pending_payment");
    expect(normalizeOrderStatus("picked_up")).toBe("picked_up");
    expect(normalizeOrderStatus("refunded")).toBe("refunded");
    expect(normalizeOrderStatus("payment_failed")).toBe("payment_failed");
  });

  it("normalizes legacy delivery states", () => {
    expect(normalizeOrderStatus("ready_for_pickup")).toBe("ready");
    expect(normalizeOrderStatus("on_the_way")).toBe("delivering");
  });

  it("maps only actionable kitchen states to tracking states", () => {
    expect(mapOrderStatusToTrackingStatus("preparing")).toBe("preparing");
    expect(mapOrderStatusToTrackingStatus("ready")).toBe("ready_for_pickup");
    expect(mapOrderStatusToTrackingStatus("picked_up")).toBe("picked_up");
    expect(mapOrderStatusToTrackingStatus("delivering")).toBe("in_transit");
    expect(mapOrderStatusToTrackingStatus("payment_failed")).toBeNull();
  });
});
