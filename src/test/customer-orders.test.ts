import { describe, expect, it } from "vitest";

import { buildCustomerOrderGroups } from "@/lib/customerOrders";

describe("customer order groups", () => {
  it("shows one global subscription order for every restaurant and selected day in the checkout group", () => {
    const groups = buildCustomerOrderGroups([
      {
        id: "order-1",
        checkout_id: "checkout-1",
        order_number: "ABO-1",
        total_amount: 18,
        created_at: "2026-06-01T08:00:00.000Z",
        metadata: {
          feature: "abonnement",
          checkout_group_id: "group-1",
          subscription_day: "Lundi",
          scheduled_delivery_label: "2026-06-01 a 12:00",
        },
        restaurant: { name: "Tok Test" },
      },
      {
        id: "order-2",
        checkout_id: "checkout-2",
        order_number: "ABO-2",
        total_amount: 24,
        created_at: "2026-06-01T08:00:00.000Z",
        metadata: {
          feature: "abonnement",
          checkout_group_id: "group-1",
          subscription_day: "Mercredi",
          scheduled_delivery_label: "2026-06-03 a 12:00",
        },
        restaurant: { name: "Green Test" },
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      groupKey: "group-1",
      isMealSubscription: true,
      orderCount: 2,
      restaurantsLabel: "Tok Test, Green Test",
      subscriptionDaysLabel: "Lundi, Mercredi",
      totalAmount: 42,
      title: "Abonnement repas global",
    });
  });
});
