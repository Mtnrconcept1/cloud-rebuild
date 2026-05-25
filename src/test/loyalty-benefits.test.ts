import { describe, expect, it } from "vitest";

import {
  getLoyaltyStatus,
  getTierBenefits,
  LOYALTY_TIER_ORDER,
} from "@/lib/loyaltyBenefits";

describe("loyaltyBenefits", () => {
  it("calculates the current tier, next tier, and progress from Miamz points", () => {
    expect(getLoyaltyStatus(3574)).toMatchObject({
      currentTier: "gold",
      nextTier: "platinum",
      currentThreshold: 2500,
      nextThreshold: 5000,
      progressPercent: 71,
      pointsToNextTier: 1426,
    });
  });

  it("exposes a complete benefit catalog for every tier", () => {
    for (const tier of LOYALTY_TIER_ORDER) {
      expect(getTierBenefits(tier).length, `${tier} benefits`).toBeGreaterThanOrEqual(4);
    }

    expect(getTierBenefits("gold").map((benefit) => benefit.id)).toContain("priority_support");
    expect(getTierBenefits("platinum").map((benefit) => benefit.id)).toContain("vip_table_access");
  });
});

