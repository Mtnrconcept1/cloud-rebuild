import { describe, expect, it } from "vitest";

import {
  buildCheckoutCompletionFromDashboardOrders,
  getOrderStripeSessionId,
  isOrderCheckoutFinalized,
} from "@/lib/orderConfirmation";

describe("orderConfirmation helpers", () => {
  it("reads the Stripe checkout session id from order metadata", () => {
    expect(getOrderStripeSessionId({
      metadata: { stripe_session_id: "cs_test_123" },
    })).toBe("cs_test_123");
  });

  it("treats captured or paid orders as finalized", () => {
    expect(isOrderCheckoutFinalized({
      status: "confirmed",
      payment_status: "captured",
    })).toBe(true);

    expect(isOrderCheckoutFinalized({
      status: "pending_payment",
      payment_status: "pending",
    })).toBe(false);
  });

  it("builds a checkout confirmation payload from dashboard orders", () => {
    const result = buildCheckoutCompletionFromDashboardOrders([
      {
        id: "order-1",
        order_number: "CMD-1001",
        restaurant_id: "resto-1",
        total_amount: 42.5,
        status: "confirmed",
        payment_status: "captured",
        metadata: {
          stripe_session_id: "cs_test_123",
          checkout_group_id: "group-1",
        },
      },
      {
        id: "order-2",
        order_number: "CMD-1002",
        restaurant_id: "resto-2",
        total_amount: 18,
        status: "confirmed",
        payment_status: "captured",
        metadata: {
          stripe_session_id: "cs_test_123",
          checkout_group_id: "group-1",
        },
      },
    ]);

    expect(result).toEqual({
      orders: [
        {
          id: "order-1",
          order_number: "CMD-1001",
          restaurant_id: "resto-1",
          total_amount: 42.5,
          status: "confirmed",
          payment_status: "captured",
        },
        {
          id: "order-2",
          order_number: "CMD-1002",
          restaurant_id: "resto-2",
          total_amount: 18,
          status: "confirmed",
          payment_status: "captured",
        },
      ],
      primaryOrderId: "order-1",
      checkoutGroupId: "group-1",
      orderReference: "CMD-1001",
      newlyFinalized: false,
    });
  });
});
