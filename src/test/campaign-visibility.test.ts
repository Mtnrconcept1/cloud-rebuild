import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { AudienceSnapshot } from "@/lib/campaignTargeting";
import { isCampaignVisibleForViewer } from "@/lib/campaignVisibility";

const baseSnapshot: AudienceSnapshot = {
  city: "Puplinge",
  favoriteRestaurantIds: [],
  interactionCount: 1,
  avgBasket: 24,
  daysSinceLastActivity: 3,
  cuisineSignals: ["italien"],
  journeyTypes: ["delivery"],
  serviceMoments: ["dinner"],
};

const emptyClientSnapshot: AudienceSnapshot = {
  city: null,
  favoriteRestaurantIds: [],
  interactionCount: 0,
  avgBasket: 0,
  daysSinceLastActivity: null,
  cuisineSignals: [],
  journeyTypes: [],
  serviceMoments: [],
};

describe("campaignVisibility", () => {
  it("lets restaurant owners preview their own active targeted campaigns", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: ["home", "search"],
        target_criteria: {
          cities: ["geneve"],
          serviceMoments: ["lunch"],
        },
      },
      {
        page: "home",
        audienceSnapshot: baseSnapshot,
        viewerUserId: "owner-1",
      },
    );

    expect(visible).toBe(true);
  });

  it("keeps targeting filters for non-owners", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: ["home", "search"],
        target_criteria: {
          cities: ["geneve"],
          serviceMoments: ["lunch"],
        },
      },
      {
        page: "home",
        audienceSnapshot: baseSnapshot,
        viewerUserId: "viewer-2",
      },
    );

    expect(visible).toBe(false);
  });

  it("keeps active sponsored placements visible for anonymous visitors", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: ["home", "search"],
        target_criteria: {
          cities: ["geneve"],
          serviceMoments: ["lunch"],
        },
      },
      {
        page: "home",
        audienceSnapshot: null,
        viewerUserId: null,
      },
    );

    expect(visible).toBe(true);
  });

  it("does not hide active sponsored placements for connected clients without audience signals", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: JSON.stringify(["home", "search"]),
        target_criteria: {
          cities: ["geneve"],
          serviceMoments: ["lunch"],
        },
      },
      {
        page: "home",
        audienceSnapshot: emptyClientSnapshot,
        viewerUserId: "viewer-2",
      },
    );

    expect(visible).toBe(true);
  });

  it("includes in-app paid campaigns in public sponsored placements", () => {
    const analytics = readFileSync(resolve(process.cwd(), "src/lib/analytics.ts"), "utf8");

    expect(analytics).toContain("SPONSORED_DISPLAY_TYPES");
    expect(analytics).toContain('"in_app"');
  });
});
