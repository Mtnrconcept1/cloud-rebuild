import { describe, expect, it } from "vitest";

import {
  buildTokRevenueSummary,
  buildRestaurantAccountingSummary,
  buildTokAccountingSummary,
} from "@/lib/comptaFlow";

describe("buildTokAccountingSummary", () => {
  it("separates payable invoice inflows from payout outflows", () => {
    const summary = buildTokAccountingSummary({
      commissionBases: {
        orders: 100,
        zero_attente: 80,
        chefs_table: 50,
        flash_sales: 20,
        anti_gaspi: 10,
      },
      payableInvoices: {
        actionable: [{ amount_ttc: 15 }],
        history: [{ amount_ttc: 5 }],
      },
      reservationFeeInvoices: {
        actionable: [],
        history: [],
      },
      payoutInvoices: {
        actionable: [{ amount_ttc: 90 }],
        history: [{ amount_ttc: 60 }],
      },
      payableAccruedAmount: 10,
    });

    expect(summary.inflow.totalCommissions).toBe(26);
    expect(summary.inflow.bySource.zero_attente).toBe(8);
    expect(summary.inflow.payableOutstanding).toBe(15);
    expect(summary.inflow.payablePendingInvoice).toBe(10);
    expect(summary.inflow.payableCollected).toBe(5);
    expect(summary.outflow.payoutsOutstanding).toBe(90);
    expect(summary.outflow.payoutsPaid).toBe(60);
    expect(summary.inflow.totalOutstanding).toBe(25);
  });
});

describe("buildTokRevenueSummary", () => {
  it("adds final platform revenue streams and reserves 6% for the developer", () => {
    const summary = buildTokRevenueSummary({
      commissionAmount: 120,
      reservationFeeAmount: 25,
      campaignAmount: 80,
      tokOneSubscriptionAmount: 15,
    });

    expect(summary.totalRevenue).toBe(240);
    expect(summary.developerReservedShare).toBe(14.4);
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
      payableInvoices: {
        actionable: [{ amount_ttc: 15 }],
        history: [{ amount_ttc: 5 }],
      },
      reservationFeeInvoices: {
        actionable: [],
        history: [],
      },
      payoutInvoices: {
        actionable: [{ amount_ttc: 90 }],
        history: [{ amount_ttc: 60 }],
      },
      payableAccruedAmount: 10,
    });

    expect(summary.inflow.receivableFromTok).toBe(90);
    expect(summary.inflow.bySource.orders).toBe(90);
    expect(summary.outflow.payableToTok).toBe(15);
    expect(summary.outflow.payablePendingInvoice).toBe(10);
    expect(summary.outflow.alreadyPaidToTok).toBe(5);
    expect(summary.outflow.totalOutstanding).toBe(25);
  });
});
