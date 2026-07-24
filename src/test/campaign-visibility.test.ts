import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { AudienceSnapshot } from "@/lib/campaignTargeting";
import { isCampaignVisibleForViewer } from "@/lib/campaignVisibility";
import {
  createPrivacyConsentRecord,
  writePrivacyConsent,
} from "@/lib/privacyConsentState";

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

function enablePersonalizationConsent() {
  writePrivacyConsent(
    createPrivacyConsentRecord({
      categories: {
        necessary: true,
        analytics: false,
        marketing: false,
        personalization: true,
        geolocation: false,
      },
      action: "save_preferences",
      source: "settings",
      storage: window.localStorage,
      now: new Date("2026-07-24T05:00:00.000Z"),
    }),
    window.localStorage,
  );
}

describe("campaignVisibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    enablePersonalizationConsent();
  });

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

  it("keeps targeting filters for consenting non-owners", () => {
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

  it("hides targeted sponsored placements for consenting connected clients without matching signals", () => {
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

  it("does not apply individual targeting before personalization consent", () => {
    window.localStorage.clear();

    const visible = isCampaignVisibleForViewer(
      {
        restaurant_id: "restaurant-1",
        restaurants: { id: "restaurant-1", owner_id: "owner-1" },
        target_pages: ["home"],
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

    expect(visible).toBe(true);
  });

  it("includes in-app paid campaigns in public sponsored placements", () => {
    const analytics = readFileSync(resolve(process.cwd(), "src/lib/analytics.ts"), "utf8");

    expect(analytics).toContain("SPONSORED_DISPLAY_TYPES");
    expect(analytics).toContain('"in_app"');
  });
});
