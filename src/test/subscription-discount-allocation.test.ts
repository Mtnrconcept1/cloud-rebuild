import { describe, expect, it } from "vitest";
import { allocateCheckoutDiscounts, type DiscountInput } from "../../supabase/functions/_shared/checkout-discounts";
import { buildTokOneEntitlements } from "../lib/subscriptionEntitlements";
import { isFlashSalePubliclyVisible } from "../lib/specialOffers";
const base: DiscountInput = { subtotal: 100, deliveryFee: 5, qualityFee: 2,
  formula: 0, promotion: { amount: 0 }, code: { amount: 0, stackable: false },
  tokOne: 0, tokOneDelivery: 0, miamzDelivery: 0, points: 0, flex: 0 };
describe("checkout discount allocation", () => {
 it("never discounts delivery twice", () => {
  const result = allocateCheckoutDiscounts({ ...base, promotion: { amount: 5, delivery: true }, tokOneDelivery: 5, miamzDelivery: 2 });
  expect(result).toMatchObject({ promo: 5, tokOneDelivery: 0, miamzDelivery: 0, total: 102, discount: 5 });
 });
 it("a non-stackable code excludes benefits, formula, flex and points", () => {
  const result = allocateCheckoutDiscounts({ ...base, code: { amount: 90, stackable: false },
   formula: 5, tokOne: 20, tokOneDelivery: 5, miamzDelivery: 2, flex: 10, points: 5 });
  expect(result).toMatchObject({ source: "promo_code", promo: 90, formula: 0, tokOne: 0, tokOneDelivery: 0, miamzDelivery: 0, flex: 0, points: 0, total: 17 });
 });
 it("keeps the better automatic saving when an exclusive code would cost more", () => {
  expect(allocateCheckoutDiscounts({ ...base, tokOne: 20, code: { amount: 10, stackable: false } })).toMatchObject({ source: null, tokOne: 20, total: 87 });
 });
 it("caps food discounts without spending the delivery and quality fee", () => {
  expect(allocateCheckoutDiscounts({ ...base, code: { amount: 70, stackable: true }, tokOne: 40, flex: 10 }))
   .toMatchObject({ promo: 70, tokOne: 30, flex: 0, total: 7 });
 });
 it("caps points at the residual payable amount", () => {
  expect(allocateCheckoutDiscounts({ ...base, tokOne: 100, tokOneDelivery: 5, points: 999 }))
   .toMatchObject({ total: 0, points: 2, discount: 107 });
 });
 it("allocates cents deterministically", () => {
  const r = allocateCheckoutDiscounts({ ...base, subtotal: 9.99, deliveryFee: 2.5, qualityFee: 0, tokOne: 1.998, miamzDelivery: .25 });
  expect(r).toMatchObject({ tokOne: 2, miamzDelivery: .25, total: 10.24, discount: 2.25 });
 });
 it("preserves explicitly configured zero benefits", () => {
  expect(buildTokOneEntitlements({ plan: { free_delivery_min_order: 30 }, benefits: [
   { benefit_type: "discount_percentage", value: { percentage: 0 } },
   { benefit_type: "free_delivery", value: { min_order: 0 } },
   { benefit_type: "priority_support", value: { enabled: false } },
  ] })).toMatchObject({ discountPercent: 0, freeDeliveryMinOrder: 0, flags: { prioritySupport: false } });
 });
 it("opens the configured early window only for entitled members", () => {
  const offer = { sale_date: "2026-10-11", sale_start: "12:00", sale_end: "13:00", early_access_minutes: 30, is_active: true, quantity_available: 1 };
  // Zurich is UTC+2 on this date.
  const now = new Date("2026-10-11T09:45:00Z");
  expect(isFlashSalePubliclyVisible(offer, now, false)).toBe(false);
  expect(isFlashSalePubliclyVisible(offer, now, true)).toBe(true);
  expect(isFlashSalePubliclyVisible(offer, new Date("2026-10-11T09:29:00Z"), true)).toBe(false);
  expect(isFlashSalePubliclyVisible({ ...offer, quantity_available: 0 }, now, true)).toBe(false);
 });
});
