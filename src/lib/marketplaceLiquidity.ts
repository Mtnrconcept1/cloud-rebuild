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

export const MARKETPLACE_LIQUIDITY_BLOCKERS = {
  restaurant_supply: {
    label: "Offre restaurants limitée",
    detail: "Moins de 3 restaurants actifs dans cette ville.",
  },
  courier_supply: {
    label: "Couverture coursiers faible",
    detail: "Moins de 2 coursiers sont actuellement en ligne sur le réseau.",
  },
  dispatch_failures: {
    label: "Courses sans coursier",
    detail: "Au moins une course ouverte attend encore une attribution.",
  },
  delivery_history: {
    label: "Historique insuffisant",
    detail: "Moins de 5 livraisons réussies ont été enregistrées sur les 30 derniers jours.",
  },
} as const;

export type MarketplaceLiquidityBlocker = keyof typeof MARKETPLACE_LIQUIDITY_BLOCKERS;

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
