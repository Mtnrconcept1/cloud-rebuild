import { describe, expect, it } from "vitest";

import {
  buildRestaurantAccountingSummary,
  buildTokAccountingSummary,
} from "@/lib/comptaFlow";

describe("buildTokAccountingSummary", () => {
  it("separates commission inflows, reservation fee inflows, and payout outflows", () => {
    const summary = buildTokAccountingSummary({
      commissionBases: {
        orders: 100,
        zero_attente: 80,
        chefs_table: 50,
        flash_sales: 20,
        anti_gaspi: 10,
      },
      reservationFeeInvoices: {
        actionable: [{ amount_ttc: 15 }],
        history: [{ amount_ttc: 5 }],
      },
      payoutInvoices: {
        actionable: [{ amount_ttc: 90 }],
        history: [{ amount_ttc: 60 }],
      },
    });

    expect(summary.inflow.totalCommissions).toBe(26);
    expect(summary.inflow.bySource.zero_attente).toBe(8);
    expect(summary.inflow.reservationFeesOutstanding).toBe(15);
    expect(summary.outflow.payoutsOutstanding).toBe(90);
    expect(summary.outflow.payoutsPaid).toBe(60);
  });
});

describe("buildRestaurantAccountingSummary", () => {
  it("inverts the same flows for the restaurant point of view", () => {
    const summary = buildRestaurantAccountingSummary({
      commissionBases: {
        orders: 100,
        zero_attente: 80,
        chefs_table: 50,
        flash_sales: 20,
        anti_gaspi: 10,
      },
      reservationFeeInvoices: {
        actionable: [{ amount_ttc: 15 }],
        history: [{ amount_ttc: 5 }],
      },
      payoutInvoices: {
        actionable: [{ amount_ttc: 90 }],
        history: [{ amount_ttc: 60 }],
      },
    });

    expect(summary.inflow.receivableFromTok).toBe(90);
    expect(summary.inflow.bySource.orders).toBe(90);
    expect(summary.outflow.payableToTok).toBe(15);
    expect(summary.outflow.alreadyPaidToTok).toBe(5);
  });
});
