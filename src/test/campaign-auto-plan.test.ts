import { describe, expect, it } from "vitest";

import { buildAutomaticCampaignPlan } from "@/lib/campaignPricing";

describe("campaign automatic planning", () => {
  it("tracks anti-waste offers on the anti-gaspi page with conversion objective and restaurant cards", () => {
    const plan = buildAutomaticCampaignPlan({ antiWasteCount: 2, flashCount: 0, topProductCount: 1 });

    expect(plan.targetPages).toContain("anti_waste");
    expect(plan.placements).toEqual({ banner: false, restaurant_cards: true });
    expect(plan.pricingStrategy).toBe("conversion");
  });

  it("uses banners for products or flash-sales that need awareness", () => {
    const plan = buildAutomaticCampaignPlan({ flashCount: 1, topProductCount: 4, avgRating: 4.8 });

    expect(plan.type).toBe("banner");
    expect(plan.placements.banner).toBe(true);
    expect(plan.placements.restaurant_cards).toBe(true);
    expect(plan.pricingStrategy).toBe("conversion");
  });
});
