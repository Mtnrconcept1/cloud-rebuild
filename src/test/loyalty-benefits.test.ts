import { describe, expect, it } from "vitest";

import {
  getLockedTierBenefits,
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

  it("applies admin-configured Miamz benefit activation and text per tier", () => {
    const configuredTiers = [
      {
        name: "gold",
        benefits: {
          miamz_benefits: {
            priority_support: { enabled: false },
            restaurant_gifts: {
              enabled: true,
              title: "Invitation dégustation admin",
              description: "Texte visible piloté depuis le Dashboard admin.",
            },
          },
        },
      },
    ];

    const goldBenefits = getTierBenefits("gold", configuredTiers);

    expect(goldBenefits.map((benefit) => benefit.id)).not.toContain("priority_support");
    expect(goldBenefits.find((benefit) => benefit.id === "restaurant_gifts")).toMatchObject({
      title: "Invitation dégustation admin",
      description: "Texte visible piloté depuis le Dashboard admin.",
    });
    expect(getLockedTierBenefits("silver", configuredTiers).map((benefit) => benefit.id)).not.toContain("priority_support");
  });
});
