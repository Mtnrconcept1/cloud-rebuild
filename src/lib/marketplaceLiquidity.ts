export type MarketplaceLiquidityInput = {
  city: string;
  activeRestaurants: number;
  activeCouriers: number;
  openOrders: number;
  noCourierJobs: number;
  successfulDeliveries: number;
};

export type MarketplaceLiquidityStatus = "green" | "yellow" | "red";

export type MarketplaceLiquidityScore = {
  city: string;
  status: MarketplaceLiquidityStatus;
  score: number;
  blockers: string[];
};

export function scoreMarketplaceLiquidity(input: MarketplaceLiquidityInput): MarketplaceLiquidityScore {
  const blockers: string[] = [];
  let score = 100;

  if (input.activeRestaurants < 3) {
    blockers.push("restaurant_supply");
    score -= 25;
  }

  if (input.activeCouriers < 2) {
    blockers.push("courier_supply");
    score -= 25;
  }

  if (input.openOrders > 0 && input.noCourierJobs > 0) {
    blockers.push("dispatch_failures");
    score -= 20;
  }

  if (input.successfulDeliveries < 5) {
    blockers.push("delivery_history");
    score -= 10;
  }

  const normalizedScore = Math.max(0, score);
  const status: MarketplaceLiquidityStatus = normalizedScore >= 80
    ? "green"
    : normalizedScore >= 50
      ? "yellow"
      : "red";

  return {
    city: input.city,
    status,
    score: normalizedScore,
    blockers,
  };
}
