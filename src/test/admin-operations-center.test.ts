import { describe, expect, it } from "vitest";

import { buildMarketplaceAlerts, summarizeProductionHealth } from "@/lib/adminOperationsCenter";

describe("admin operations center alert engine", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("flags paid payments that are not linked to a business entity", () => {
    const alerts = buildMarketplaceAlerts({
      now,
      paymentTransactions: [
        {
          id: "pay-1",
          status: "succeeded",
          created_at: "2026-06-01T11:55:00.000Z",
        },
      ],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "critical",
      category: "payment",
      entityType: "payment_transaction",
      entityId: "pay-1",
    });
  });

  it("flags paid orders that remain in pending payment status", () => {
    const alerts = buildMarketplaceAlerts({
      now,
      orders: [
        {
          id: "order-1",
          status: "pending_payment",
          payment_status: "paid",
          created_at: "2026-06-01T11:58:00.000Z",
        },
      ],
    });

    expect(alerts.some((alert) => alert.id.includes("paid-but-pending"))).toBe(true);
    expect(alerts[0].href).toContain("/admin/commandes-reservations");
  });

  it("prioritizes dispatch jobs without courier after operational thresholds", () => {
    const alerts = buildMarketplaceAlerts({
      now,
      dispatchJobs: [
        {
          id: "dispatch-1",
          status: "searching",
          courier_id: null,
          created_at: "2026-06-01T11:30:00.000Z",
        },
      ],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "critical",
      category: "dispatch",
      entityId: "dispatch-1",
    });
  });

  it("detects incomplete active restaurants and paid inactive campaigns", () => {
    const alerts = buildMarketplaceAlerts({
      now,
      restaurants: [
        {
          id: "restaurant-1",
          name: "TOK Test",
          is_active: true,
          address: "",
          city: "Genève",
          latitude: null,
          longitude: null,
        },
      ],
      adCampaigns: [
        {
          id: "campaign-1",
          status: "inactive",
          payment_status: "paid",
          budget_chf: 100,
          spent_chf: 10,
        },
      ],
    });

    expect(alerts.map((alert) => alert.category)).toEqual(expect.arrayContaining(["restaurant", "campaign"]));
    expect(alerts.find((alert) => alert.category === "campaign")?.severity).toBe("high");
  });

  it("summarizes production health from alert severity distribution", () => {
    const alerts = buildMarketplaceAlerts({
      now,
      edgeFunctionAuditLogs: [
        {
          id: "edge-1",
          function_name: "stripe-webhook",
          status: "failure",
          created_at: "2026-06-01T11:59:00.000Z",
        },
      ],
      refundRequests: [
        {
          id: "refund-1",
          status: "pending",
          amount_chf: 24.5,
          created_at: "2026-06-01T10:00:00.000Z",
        },
      ],
    });
    const health = summarizeProductionHealth(alerts);

    expect(health.status).toBe("critical");
    expect(health.criticalCount).toBe(1);
    expect(health.highCount).toBe(1);
    expect(health.blockingCategories).toEqual(expect.arrayContaining(["production", "refund"]));
  });
});
