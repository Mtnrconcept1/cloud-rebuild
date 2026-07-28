import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { scoreAudienceCriteria, type AudienceSnapshot } from "@/lib/campaignTargeting";
import { isCampaignVisibleForViewer } from "@/lib/campaignVisibility";

const baseSnapshot: AudienceSnapshot = {
  city: "Puplinge",
  gender: "female",
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
  gender: null,
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

  it("requires every active targeting family to match for non-owners", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: ["home", "search"],
        target_criteria: {
          cities: ["puplinge"],
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

  it("keeps OR semantics inside one targeting family", () => {
    const evaluation = scoreAudienceCriteria(
      {
        cities: ["geneve", "puplinge"],
        journeyTypes: ["takeaway", "delivery"],
        serviceMoments: ["lunch", "dinner"],
      },
      baseSnapshot,
      "restaurant-1",
    );

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.score).toBeGreaterThan(0);
    expect(evaluation.failedCriteria).toEqual([]);
  });

  it("treats every journey and every service moment as broad selections", () => {
    const evaluation = scoreAudienceCriteria(
      {
        cities: ["puplinge"],
        journeyTypes: ["delivery", "takeaway", "reservation", "zero_attente"],
        serviceMoments: ["lunch", "dinner", "weekend"],
      },
      {
        ...baseSnapshot,
        journeyTypes: [],
        serviceMoments: [],
      },
      "restaurant-1",
    );

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.matchedCriteria).toEqual(["city"]);
    expect(evaluation.failedCriteria).toEqual([]);
  });

  it("hides targeted sponsored placements for anonymous visitors", () => {
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

    expect(visible).toBe(false);
  });

  it("keeps broad sponsored placements visible for anonymous visitors", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: ["home", "search"],
        target_criteria: {},
      },
      {
        page: "home",
        audienceSnapshot: null,
        viewerUserId: null,
      },
    );

    expect(visible).toBe(true);
  });

  it("keeps complete journey and moment selections broad for anonymous visitors", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: ["home", "search"],
        target_criteria: {
          journeyTypes: ["delivery", "takeaway", "reservation", "zero_attente"],
          serviceMoments: ["lunch", "dinner", "weekend"],
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

  it("parses legacy JSON campaign targeting before applying eligibility", () => {
    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: JSON.stringify(["home", "search"]),
        target_criteria: JSON.stringify({ cities: ["geneve"] }),
      },
      {
        page: "home",
        audienceSnapshot: baseSnapshot,
        viewerUserId: "viewer-2",
      },
    );

    expect(visible).toBe(false);
  });

  it("hides targeted sponsored placements for connected clients without matching signals", () => {
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

    expect(visible).toBe(false);
  });

  it("includes in-app paid campaigns in public sponsored placements", () => {
    const analytics = readFileSync(resolve(process.cwd(), "src/lib/analytics.ts"), "utf8");

    expect(analytics).toContain("SPONSORED_DISPLAY_TYPES");
    expect(analytics).toContain('"in_app"');
  });
});
