import { describe, expect, it } from "vitest";

import {
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  FAIR_GROWTH_PLANS,
  calculateFairGrowthOrderDistribution,
  getFairGrowthBillingAmountChf,
  RESERVATION_FLAT_FEE_CHF,
} from "@/lib/fairGrowth";

describe("Fair Growth pricing", () => {
  it("bills eleven months for a twelve-month commitment", () => {
    expect(FAIR_GROWTH_ANNUAL_MONTHS_CHARGED).toBe(11);
    expect(FAIR_GROWTH_PLANS.map((plan) => getFairGrowthBillingAmountChf(plan.monthlyPriceChf, "yearly")))
      .toEqual([759, 1419, 2189, 5489]);
  });

  it("keeps the technical pro slug while exposing Business", () => {
    expect(FAIR_GROWTH_PLANS[1]).toMatchObject({ slug: "pro", publicName: "Business" });
  });

  it("facture un forfait identique quel que soit le plan et le couvert", () => {
    expect(RESERVATION_FLAT_FEE_CHF).toBe(5);
    expect(FAIR_GROWTH_PLANS.every((plan) => !("acquiredReservationFeeChf" in plan))).toBe(true);
  });

  it("keeps tips entirely with the restaurant and delivery outside marketplace revenue", () => {
    const split = calculateFairGrowthOrderDistribution({
      commissionableCents: 10_000,
      tipCents: 1_000,
      deliveryPassThroughCents: 500,
      marketplaceCommissionBps: 1_000,
    });

    expect(split).toMatchObject({
      grossCents: 11_500,
      platformCommissionCents: 1_000,
      restaurantShareCents: 10_000,
      tipCents: 1_000,
      deliveryPassThroughCents: 500,
      stripeApplicationFeeCents: 1_500,
    });
    expect(split).not.toHaveProperty("developerShareCents");
    expect(split).not.toHaveProperty("tokNetRevenueCents");
  });

  it("gives every restaurant plan the same 90 percent marketplace share", () => {
    expect(
      FAIR_GROWTH_PLANS.map((plan) =>
        calculateFairGrowthOrderDistribution({
          commissionableCents: 10_000,
          marketplaceCommissionBps: plan.marketplaceCommissionBps,
        }).restaurantShareCents
      ),
    ).toEqual([9_000, 9_000, 9_000, 9_000]);
  });

  it("matches the ten-percent marketplace baseline for all plans", () => {
    const restaurants = 50;
    const reservationsPerRestaurant = 200;
    const ordersPerRestaurant = 200;
    const averageOrderChf = 40;
    const marketplaceCommissionBps = 1_000;

    const baselineMonthly = FAIR_GROWTH_PLANS.map((plan) => restaurants * (
      plan.monthlyPriceChf
      + reservationsPerRestaurant * RESERVATION_FLAT_FEE_CHF
      + ordersPerRestaurant * averageOrderChf * marketplaceCommissionBps / 10_000
    ));
    const configuredMonthly = FAIR_GROWTH_PLANS.map((plan) => restaurants * (
      plan.monthlyPriceChf
      + reservationsPerRestaurant * RESERVATION_FLAT_FEE_CHF
      + ordersPerRestaurant * averageOrderChf * plan.marketplaceCommissionBps / 10_000
    ));

    expect(baselineMonthly).toEqual([93_450, 96_450, 99_950, 114_950]);
    expect(configuredMonthly).toEqual(baselineMonthly);
    expect(baselineMonthly.map((amount, index) => amount - configuredMonthly[index]))
      .toEqual([0, 0, 0, 0]);
  });
});
