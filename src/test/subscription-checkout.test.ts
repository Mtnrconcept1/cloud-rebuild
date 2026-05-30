import { describe, expect, it } from "vitest";

import { getCartItemOrderGroupKey, getMealSubscriptionOrderMetadata } from "@/lib/subscriptionCheckout";

describe("subscription checkout grouping", () => {
  it("groups meal subscription orders by restaurant, delivery date and delivery time", () => {
    expect(getCartItemOrderGroupKey({
      restaurantId: "restaurant-1",
      metadata: {
        is_meal_subscription: true,
        delivery_date: "2026-06-03",
        delivery_time: "12:00",
      },
    })).toBe("restaurant-1|abonnement|2026-06-03|12:00");
  });

  it("extracts scheduled delivery metadata for same-day notification and dispatch", () => {
    expect(getMealSubscriptionOrderMetadata([
      {
        restaurantId: "restaurant-1",
        metadata: {
          is_meal_subscription: true,
          subscription_day: "Mercredi",
          delivery_date: "2026-06-03",
          delivery_time: "12:00",
          subscription_delivery_key: "Mercredi|2026-06-03|12:00",
        },
      },
    ])).toEqual({
      subscription_day: "Mercredi",
      subscription_delivery_key: "Mercredi|2026-06-03|12:00",
      delivery_schedule_mode: "scheduled",
      delivery_date: "2026-06-03",
      delivery_time: "12:00",
      notification_timing: "same_day",
    });
  });
});
