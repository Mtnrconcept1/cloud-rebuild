import { describe, expect, it } from "vitest";

import {
  classifyOrderCommissionSource,
  classifyReservationCommissionSource,
  createEmptyCommissionBaseTotals,
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

  it("classifies chef's table orders explicitly", () => {
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

  it("classifies chef's table reservations separately", () => {
    expect(classifyReservationCommissionSource({
      feature: "chefs_table",
      total_amount: 120,
      status: "confirmed",
    })).toBe("chefs_table");
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
