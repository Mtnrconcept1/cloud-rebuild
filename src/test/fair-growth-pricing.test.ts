import { describe, expect, it } from "vitest";

import {
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  FAIR_GROWTH_PLANS,
  calculateCappedReservationFeeChf,
  calculateDirectOrderSaverBreakEvenChf,
  calculateFairGrowthOrderDistribution,
  getFairGrowthBillingAmountChf,
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

  it("caps an acquired reservation fee at seven percent of attributed revenue", () => {
    expect(calculateCappedReservationFeeChf(5, 100)).toBe(5);
    expect(calculateCappedReservationFeeChf(5, 50)).toBe(3.5);
    expect(calculateCappedReservationFeeChf(5, 0)).toBe(0);
  });

  it("keeps tips entirely with the restaurant and delivery outside revenue", () => {
    const split = calculateFairGrowthOrderDistribution({
      commissionableCents: 10_000,
      tipCents: 1_000,
      deliveryPassThroughCents: 500,
      marketplaceCommissionBps: 990,
    });

    expect(split).toMatchObject({
      grossCents: 11_500,
      platformCommissionCents: 990,
      developerShareCents: 100,
      tokNetRevenueCents: 890,
      restaurantShareCents: 10_010,
      tipCents: 1_000,
      deliveryPassThroughCents: 500,
      stripeApplicationFeeCents: 1_490,
    });
  });

  it("grants lower-plan commissions to the restaurant while preserving one percent for the developer", () => {
    expect(
      FAIR_GROWTH_PLANS.map((plan) =>
        calculateFairGrowthOrderDistribution({
          commissionableCents: 10_000,
          marketplaceCommissionBps: plan.marketplaceCommissionBps,
        }).restaurantShareCents
      ),
    ).toEqual([9010, 9110, 9210, 9310]);
  });

  it("compares 50 restaurants against the current ten-percent marketplace baseline", () => {
    const restaurants = 50;
    const reservationsPerRestaurant = 200;
    const ordersPerRestaurant = 200;
    const averageOrderChf = 40;
    const currentMarketplaceCommissionBps = 1000;

    const currentMonthly = FAIR_GROWTH_PLANS.map((plan) => restaurants * (
      plan.monthlyPriceChf
      + reservationsPerRestaurant * 5
      + ordersPerRestaurant * averageOrderChf * currentMarketplaceCommissionBps / 10_000
    ));
    const fairGrowthMonthly = FAIR_GROWTH_PLANS.map((plan) => restaurants * (
      plan.monthlyPriceChf
      + reservationsPerRestaurant * plan.acquiredReservationFeeChf
      + ordersPerRestaurant * averageOrderChf * plan.marketplaceCommissionBps / 10_000
    ));

    expect(currentMonthly).toEqual([93_450, 96_450, 99_950, 114_950]);
    expect(fairGrowthMonthly).toEqual([93_050, 87_050, 81_550, 82_550]);
    expect(currentMonthly.map((amount, index) => amount - fairGrowthMonthly[index]))
      .toEqual([400, 9_400, 18_400, 32_400]);
  });

  it("states the mathematical Direct Order Saver threshold separately from the prudent threshold", () => {
    expect(calculateDirectOrderSaverBreakEvenChf()).toBeCloseTo(1773.8095, 3);
  });
});
