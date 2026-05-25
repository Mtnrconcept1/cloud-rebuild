import { describe, expect, it } from "vitest";

import { getLifecycleSegments } from "@/lib/lifecycleSegments";

describe("lifecycle segments", () => {
  it("segments a new user without orders", () => {
    expect(getLifecycleSegments({
      createdAt: "2026-05-24T10:00:00.000Z",
      ordersCount: 0,
      reservationsCount: 0,
      successfulOrdersCount: 0,
      totalSpentChf: 0,
      tokOneActive: false,
    }, new Date("2026-05-25T10:00:00.000Z"))).toEqual(["new_user", "first_order_missing"]);
  });

  it("segments churn risk and loyal customers deterministically", () => {
    expect(getLifecycleSegments({
      createdAt: "2026-01-01T10:00:00.000Z",
      ordersCount: 9,
      reservationsCount: 2,
      successfulOrdersCount: 9,
      lastOrderAt: "2026-04-01T10:00:00.000Z",
      totalSpentChf: 420,
      tokOneActive: false,
    }, new Date("2026-05-25T10:00:00.000Z"))).toEqual(["churn_risk", "loyal_customer", "tok_one_candidate"]);
  });
});
