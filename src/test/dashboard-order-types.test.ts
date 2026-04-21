import { describe, expect, it } from "vitest";

import {
  classifyDashboardOrderType,
  createEmptyDashboardOrderTypeSummary,
  getDashboardOrderTypeMeta,
  summarizeDashboardOrdersByType,
} from "@/lib/dashboardOrderTypes";

describe("classifyDashboardOrderType", () => {
  it("classifies anti-gaspi orders first", () => {
    expect(classifyDashboardOrderType({
      metadata: { is_anti_waste: true, feature: "anti-gaspi" },
    })).toBe("anti_gaspi");
  });

  it("classifies anti-gaspi orders from offer ids", () => {
    expect(classifyDashboardOrderType({
      metadata: { anti_waste_offer_id: "offer_123" },
    })).toBe("anti_gaspi");
  });

  it("classifies flash sale orders second", () => {
    expect(classifyDashboardOrderType({
      metadata: { has_flash_sale: true, feature: "ventes-flash" },
    })).toBe("flash_sales");
  });

  it("falls back to classic for standard orders", () => {
    expect(classifyDashboardOrderType({
      metadata: { type: "delivery" },
    })).toBe("classic");
  });
});

describe("getDashboardOrderTypeMeta", () => {
  it("returns a visible badge label for anti-gaspi", () => {
    expect(getDashboardOrderTypeMeta("anti_gaspi").badgeLabel).toBe("Anti-gaspi");
  });
});

describe("summarizeDashboardOrdersByType", () => {
  it("aggregates counts and revenue by visible order type", () => {
    expect(summarizeDashboardOrdersByType([
      { metadata: { type: "delivery" }, amount: 20 },
      { metadata: { is_anti_waste: true }, amount: 8.5 },
      { metadata: { flash_sale_id: "flash_1" }, amount: 12 },
    ], (order) => order.amount)).toEqual({
      classic: { count: 1, revenue: 20 },
      anti_gaspi: { count: 1, revenue: 8.5 },
      flash_sales: { count: 1, revenue: 12 },
    });
  });

  it("starts from zero when there are no orders", () => {
    expect(summarizeDashboardOrdersByType([], () => 0)).toEqual(createEmptyDashboardOrderTypeSummary());
  });
});
