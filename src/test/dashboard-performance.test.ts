import { describe, expect, it } from "vitest";
import { buildPerformanceSummary, getPerformancePeriodBounds } from "@/lib/dashboardPerformance";

describe("dashboard performance helpers", () => {
  it("builds a consistent summary from raw orders, reservations and reviews", () => {
    const summary = buildPerformanceSummary({
      fromDay: "2026-03-10",
      toDay: "2026-03-12",
      orders: [
        {
          created_at: "2026-03-10T11:00:00.000Z",
          total_amount: 20,
          status: "pending",
          metadata: { formula_discount_amount: 2 },
        },
        {
          created_at: "2026-03-10T12:00:00.000Z",
          total_amount: 10,
          status: "refused",
          metadata: {},
        },
        {
          created_at: "2026-03-11T18:00:00.000Z",
          total_amount: 15,
          status: "payment_failed",
          metadata: {},
        },
        {
          created_at: "2026-03-12T19:00:00.000Z",
          total_amount: 30,
          status: "delivered",
          metadata: {
            promotion_discount_amount: 3,
            points_discount: 1,
            flex_discount: 2,
          },
        },
      ],
      reservations: [
        {
          date: "2026-03-10",
          time: "12:15",
          status: "confirmed",
          party_size: 2,
          metadata: {},
        },
        {
          date: "2026-03-11",
          time: "20:00",
          status: "no_show",
          party_size: 4,
          metadata: {},
        },
        {
          date: "2026-03-12",
          time: "12:00",
          status: "pending",
          party_size: 3,
          metadata: { service: "dinner" },
        },
      ],
      reviews: [
        { created_at: "2026-03-10T13:00:00.000Z", rating: 5 },
        { created_at: "2026-03-12T20:00:00.000Z", rating: 3 },
      ],
    });

    expect(summary.totalOrders).toBe(4);
    expect(summary.validOrdersCount).toBe(2);
    expect(summary.invalidOrdersCount).toBe(2);
    expect(summary.totalRevenue).toBe(50);
    expect(summary.grossRevenue).toBe(58);
    expect(summary.avgTicket).toBe(25);
    expect(summary.totalReservations).toBe(2);
    expect(summary.cancelRate).toBe(50);
    expect(summary.avgSatisfaction).toBe(4);
    expect(summary.reservationServiceBreakdown.lunch).toEqual({ count: 1, covers: 2 });
    expect(summary.reservationServiceBreakdown.dinner).toEqual({ count: 1, covers: 3 });
    expect(summary.discounts).toEqual({
      formula: 2,
      promo: 3,
      loyalty: 1,
      flex: 2,
      total: 8,
    });
    expect(summary.dailyRows).toEqual([
      {
        kpi_date: "2026-03-10",
        orders_count: 2,
        valid_orders_count: 1,
        revenue: 20,
        avg_ticket: 20,
        reservations_count: 1,
        cancel_rate: 50,
        satisfaction_score: 5,
        reviews_count: 1,
      },
      {
        kpi_date: "2026-03-11",
        orders_count: 1,
        valid_orders_count: 0,
        revenue: 0,
        avg_ticket: 0,
        reservations_count: 0,
        cancel_rate: 100,
        satisfaction_score: 0,
        reviews_count: 0,
      },
      {
        kpi_date: "2026-03-12",
        orders_count: 1,
        valid_orders_count: 1,
        revenue: 30,
        avg_ticket: 30,
        reservations_count: 1,
        cancel_rate: 0,
        satisfaction_score: 3,
        reviews_count: 1,
      },
    ]);
  });

  it("fills the full inclusive day range even when a day has no activity", () => {
    const summary = buildPerformanceSummary({
      fromDay: "2026-03-10",
      toDay: "2026-03-13",
      orders: [{ created_at: "2026-03-10T11:00:00.000Z", total_amount: 18, status: "pending", metadata: {} }],
      reservations: [],
      reviews: [],
    });

    expect(summary.dailyRows).toHaveLength(4);
    expect(summary.dailyRows[3]).toEqual({
      kpi_date: "2026-03-13",
      orders_count: 0,
      valid_orders_count: 0,
      revenue: 0,
      avg_ticket: 0,
      reservations_count: 0,
      cancel_rate: 0,
      satisfaction_score: 0,
      reviews_count: 0,
    });
  });

  it("creates an inclusive trailing period ending today", () => {
    const bounds = getPerformancePeriodBounds(7, new Date("2026-03-12T10:00:00.000Z"));

    expect(bounds.periodDays).toBe(7);
    expect(bounds.fromDay).toBe("2026-03-06");
    expect(bounds.toDay).toBe("2026-03-12");
    expect(bounds.fromTimestamp).toBe("2026-03-06T00:00:00.000Z");
    expect(bounds.toTimestampExclusive).toBe("2026-03-13T00:00:00.000Z");
  });
});
