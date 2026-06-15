import { describe, expect, it } from "vitest";

import {
  DEVELOPER_RESERVED_SHARE_RATE,
  calculateDeveloperReservedShare,
  sumDirectTokPurchaseRevenue,
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
  it("adds every platform inflow and reserves 10% for the developer", () => {
    const summary = buildTokRevenueSummary({
      commissionAmount: 120,
      reservationFeeAmount: 25,
      campaignAmount: 80,
      tokOneSubscriptionAmount: 15,
      restaurantPurchaseAmount: 679,
      otherRevenueAmount: 81,
    });

    expect(summary.totalRevenue).toBe(1000);
    expect(summary.developerReservedShare).toBe(100);
    expect(DEVELOPER_RESERVED_SHARE_RATE).toBe(0.1);
    expect(calculateDeveloperReservedShare(1000)).toBe(100);
  });

  it("sums only paid direct restaurant purchases for developer revenue", () => {
    const paidInvoiceIds = new Set(["invoice-paid"]);

    expect(sumDirectTokPurchaseRevenue([
      { invoice_id: "invoice-paid", item_kind: "launch_pack", amount_ttc: 490 },
      { invoice_id: "invoice-paid", item_kind: "restaurant_subscription", amount_ttc: 89 },
      { invoice_id: "invoice-paid", item_kind: "credit_pack", amount_ttc: 100 },
      { invoice_id: "invoice-paid", item_kind: "order_commission", amount_ttc: 12 },
      { invoice_id: "invoice-open", item_kind: "credit_pack", amount_ttc: 200 },
    ], paidInvoiceIds)).toBe(679);
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

  it("uses the exact opposite open balance as the admin view for the same restaurant", () => {
    const input = {
      commissionBases: {
        orders: 133.37,
        zero_attente: 88.88,
        chefs_table: 44.44,
        flash_sales: 22.22,
        anti_gaspi: 11.11,
      },
      payableInvoices: {
        actionable: [{ amount_ttc: 19.5 }],
        history: [{ amount_ttc: 7.25 }],
      },
      reservationFeeInvoices: {
        actionable: [],
        history: [],
      },
      payoutInvoices: {
        actionable: [{ amount_ttc: 111.15 }],
        history: [{ amount_ttc: 55.55 }],
      },
      payableAccruedAmount: 12.35,
    };

    const adminSummary = buildTokAccountingSummary(input);
    const restaurantSummary = buildRestaurantAccountingSummary(input);

    expect(adminSummary.outflow.bySource).toEqual(restaurantSummary.inflow.bySource);
    expect(adminSummary.inflow.payableOutstanding).toBe(restaurantSummary.outflow.payableToTok);
    expect(adminSummary.inflow.payablePendingInvoice).toBe(restaurantSummary.outflow.payablePendingInvoice);
    expect(adminSummary.inflow.payableCollected).toBe(restaurantSummary.outflow.alreadyPaidToTok);
    expect(adminSummary.netOutstanding).toBe(-restaurantSummary.netOutstanding);
  });
});
