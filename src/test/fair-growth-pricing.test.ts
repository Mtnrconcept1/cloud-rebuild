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
    // Le frais ne se negocie plus par abonnement et ne suit plus l'addition :
    // c'est la contrepartie de la suppression des modules.
    expect(RESERVATION_FLAT_FEE_CHF).toBe(5);
    expect(FAIR_GROWTH_PLANS.every((plan) => !("acquiredReservationFeeChf" in plan))).toBe(true);
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
    // Le forfait etant identique des deux cotes, l'ecart ne tient plus qu'a la
    // commission marketplace.
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
      + reservationsPerRestaurant * RESERVATION_FLAT_FEE_CHF
      + ordersPerRestaurant * averageOrderChf * plan.marketplaceCommissionBps / 10_000
    ));

    expect(currentMonthly).toEqual([93_450, 96_450, 99_950, 114_950]);
    expect(fairGrowthMonthly).toEqual([93_050, 92_050, 91_550, 102_550]);
    expect(currentMonthly.map((amount, index) => amount - fairGrowthMonthly[index]))
      .toEqual([400, 4_400, 8_400, 12_400]);
  });

});
