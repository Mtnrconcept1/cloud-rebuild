import { describe, expect, it } from "vitest";

import { scoreMarketplaceLiquidity } from "@/lib/marketplaceLiquidity";

describe("marketplace liquidity", () => {
  it("marks a city green when supply, couriers and delivery success are sufficient", () => {
    expect(scoreMarketplaceLiquidity({
      city: "Geneve",
      activeRestaurants: 18,
      activeCouriers: 9,
      openOrders: 4,
      noCourierJobs: 0,
      successfulDeliveries: 42,
    })).toEqual({
      city: "Geneve",
      status: "green",
      score: 100,
      blockers: [],
    });
  });

  it("marks a city red when delivery cannot be fulfilled reliably", () => {
    expect(scoreMarketplaceLiquidity({
      city: "Lausanne",
      activeRestaurants: 2,
      activeCouriers: 1,
      openOrders: 5,
      noCourierJobs: 3,
      successfulDeliveries: 1,
    })).toEqual({
      city: "Lausanne",
      status: "red",
      score: 20,
      blockers: ["restaurant_supply", "courier_supply", "dispatch_failures", "delivery_history"],
    });
  });
});
