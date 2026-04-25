import { describe, expect, it } from "vitest";

import {
  classifyOrderCommissionSource,
  classifyReservationCommissionSource,
  createEmptyCommissionBaseTotals,
  getNetAmountAfterRefund,
  getNetOrderCommissionBase,
  getNetReservationCommissionBase,
  getPointsDiscountAmount,
} from "@/lib/comptaCommissionSources";

describe("classifyOrderCommissionSource", () => {
  it("classifies takeaway and delivery orders as classic orders by default", () => {
    expect(classifyOrderCommissionSource({
      metadata: { type: "delivery" },
      payment_status: "paid",
    })).toBe("orders");
  });

  it("classifies flash sale orders before generic orders", () => {
    expect(classifyOrderCommissionSource({
      metadata: { feature: "ventes-flash", has_flash_sale: true },
      payment_status: "paid",
    })).toBe("flash_sales");
  });

  it("classifies anti-gaspi orders before generic orders", () => {
    expect(classifyOrderCommissionSource({
      metadata: { feature: "anti-gaspi", has_anti_gaspi: true },
      payment_status: "captured",
    })).toBe("anti_gaspi");
  });

  it("classifies anti-gaspi orders from anti-waste metadata used by checkout", () => {
    expect(classifyOrderCommissionSource({
      metadata: { is_anti_waste: true, anti_waste_offer_id: "offer_123" },
      payment_status: "paid",
    })).toBe("anti_gaspi");
  });

  it("classifies La Table du Chef orders explicitly", () => {
    expect(classifyOrderCommissionSource({
      metadata: { feature: "chefs_table" },
      payment_status: "paid",
    })).toBe("chefs_table");
  });

  it("ignores unpaid orders", () => {
    expect(classifyOrderCommissionSource({
      metadata: { feature: "ventes-flash" },
      payment_status: "pending",
    })).toBeNull();
  });
});

describe("classifyReservationCommissionSource", () => {
  it("classifies zero-attente reservations separately from other paid reservations", () => {
    expect(classifyReservationCommissionSource({
      feature: "zero-attente",
      total_amount: 58,
      status: "confirmed",
    })).toBe("zero_attente");
  });

  it("classifies La Table du Chef reservations separately", () => {
    expect(classifyReservationCommissionSource({
      feature: "chefs_table",
      total_amount: 120,
      status: "confirmed",
    })).toBe("chefs_table");
  });

  it("classifies anti-waste reservation metadata variants as anti-gaspi", () => {
    expect(classifyReservationCommissionSource({
      feature: "anti_waste",
      total_amount: 18,
      status: "confirmed",
    })).toBe("anti_gaspi");
  });

  it("returns null for unpaid classic reservations that should not generate a 10 percent bucket", () => {
    expect(classifyReservationCommissionSource({
      feature: null,
      total_amount: 0,
      status: "pending",
    })).toBeNull();
  });
});

describe("createEmptyCommissionBaseTotals", () => {
  it("creates all source buckets at zero", () => {
    expect(createEmptyCommissionBaseTotals()).toEqual({
      orders: 0,
      zero_attente: 0,
      chefs_table: 0,
      flash_sales: 0,
      anti_gaspi: 0,
    });
  });
});

describe("getPointsDiscountAmount", () => {
  it("reads the checkout metadata key used in production", () => {
    expect(getPointsDiscountAmount({ points_discount_amount: "4.5" })).toBe(4.5);
  });

  it("falls back to the legacy points_discount key", () => {
    expect(getPointsDiscountAmount({ points_discount: 3 })).toBe(3);
  });
});

describe("net refund helpers", () => {
  it("subtracts refunded amounts without going negative", () => {
    expect(getNetAmountAfterRefund(42, 10)).toBe(32);
    expect(getNetAmountAfterRefund(10, 20)).toBe(0);
  });

  it("computes order commission bases on the net amount after refund", () => {
    expect(getNetOrderCommissionBase({
      total_amount: 50,
      refunded_amount_chf: 15,
      payment_status: "captured",
      metadata: { type: "delivery", points_discount_amount: 5 },
    })).toBe(40);
  });

  it("computes reservation commission bases on the net amount after refund", () => {
    expect(getNetReservationCommissionBase({
      feature: "chefs_table",
      total_amount: 120,
      refunded_amount_chf: 20,
      status: "confirmed",
    })).toBe(100);
  });
});
