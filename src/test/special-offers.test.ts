import { describe, expect, it } from "vitest";

import {
  isAntiWasteOfferPubliclyVisible,
  isFlashSalePubliclyVisible,
  isSpecialOfferEffectivelyActive,
  isSpecialOfferSoldOut,
} from "@/lib/specialOffers";

describe("isAntiWasteOfferPubliclyVisible", () => {
  it("shows future anti-gaspi offers with stock", () => {
    expect(isAntiWasteOfferPubliclyVisible({
      is_active: true,
      quantity_available: 2,
      available_date: "2026-04-23",
      pickup_end: "20:00:00",
    }, new Date("2026-04-22T12:00:00"))).toBe(true);
  });

  it("hides anti-gaspi offers with no stock", () => {
    expect(isAntiWasteOfferPubliclyVisible({
      is_active: true,
      quantity_available: 0,
      available_date: "2026-04-23",
      pickup_end: "20:00:00",
    }, new Date("2026-04-22T12:00:00"))).toBe(false);
  });

  it("hides offers whose pickup window already ended today", () => {
    expect(isAntiWasteOfferPubliclyVisible({
      is_active: true,
      quantity_available: 1,
      available_date: "2026-04-22",
      pickup_end: "11:00:00",
    }, new Date("2026-04-22T12:00:00"))).toBe(false);
  });
});

describe("isFlashSalePubliclyVisible", () => {
  it("shows flash sales inside the live window with stock", () => {
    expect(isFlashSalePubliclyVisible({
      is_active: true,
      quantity_available: 3,
      sale_date: "2026-04-22",
      sale_start: "11:00:00",
      sale_end: "13:00:00",
    }, new Date("2026-04-22T12:00:00"))).toBe(true);
  });

  it("hides flash sales when stock is depleted", () => {
    expect(isFlashSalePubliclyVisible({
      is_active: true,
      quantity_available: 0,
      sale_date: "2026-04-22",
      sale_start: "11:00:00",
      sale_end: "13:00:00",
    }, new Date("2026-04-22T12:00:00"))).toBe(false);
  });
});

describe("special offer status helpers", () => {
  it("marks zero-stock offers as sold out and effectively inactive", () => {
    expect(isSpecialOfferSoldOut({ quantity_available: 0 })).toBe(true);
    expect(isSpecialOfferEffectivelyActive({ is_active: true, quantity_available: 0 })).toBe(false);
  });
});
