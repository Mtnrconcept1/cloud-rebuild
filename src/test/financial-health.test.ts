import { describe, expect, it } from "vitest";

import { summarizeFinancialHealth } from "@/lib/financialHealth";

describe("financial health", () => {
  it("flags confirmed operations that are not captured", () => {
    expect(summarizeFinancialHealth([
      { id: "order-1", status: "confirmed", payment_status: "pending" },
      { id: "order-2", status: "delivered", payment_status: "captured" },
    ])).toEqual({
      confirmedNotCaptured: 1,
      refundPending: 0,
      failedPayments: 0,
      healthy: false,
      affectedIds: ["order-1"],
    });
  });

  it("treats paid and captured as settled states", () => {
    expect(summarizeFinancialHealth([
      { id: "order-1", status: "ready", payment_status: "paid" },
      { id: "order-2", status: "delivered", payment_status: "captured" },
    ])).toMatchObject({
      confirmedNotCaptured: 0,
      healthy: true,
    });
  });

  it("counts failed payments and pending refunds", () => {
    expect(summarizeFinancialHealth([
      { id: "order-1", status: "payment_failed", payment_status: "failed" },
      { id: "order-2", status: "cancelled", payment_status: "captured", refund_status: "pending" },
    ])).toMatchObject({
      confirmedNotCaptured: 0,
      refundPending: 1,
      failedPayments: 1,
      healthy: false,
    });
  });
});
