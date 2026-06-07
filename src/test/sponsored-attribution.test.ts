import { beforeEach, describe, expect, it } from "vitest";

import {
  SPONSORED_ATTRIBUTION_KEY,
  SPONSORED_ATTRIBUTION_MAX_AGE_MS,
  clearSponsoredAttributions,
  getValidSponsoredAttributions,
  rememberSponsoredAttribution,
} from "@/lib/sponsoredAttribution";

describe("sponsored attribution storage", () => {
  const now = Date.parse("2026-06-07T12:00:00.000Z");

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps several recent campaigns for the same restaurant", () => {
    rememberSponsoredAttribution("campaign-a", "restaurant-1", now, window.localStorage);
    rememberSponsoredAttribution("campaign-b", "restaurant-1", now + 1_000, window.localStorage);

    expect(getValidSponsoredAttributions("restaurant-1", now + 2_000, window.localStorage).map((entry) => entry.campaignId))
      .toEqual(["campaign-b", "campaign-a"]);

    clearSponsoredAttributions("restaurant-1", ["campaign-b"], window.localStorage);

    expect(getValidSponsoredAttributions("restaurant-1", now + 2_000, window.localStorage).map((entry) => entry.campaignId))
      .toEqual(["campaign-a"]);
  });

  it("reads the legacy single-campaign shape and prunes expired clicks", () => {
    window.localStorage.setItem(
      SPONSORED_ATTRIBUTION_KEY,
      JSON.stringify({
        "restaurant-1": {
          campaignId: "legacy-campaign",
          clickedAt: new Date(now - 1_000).toISOString(),
        },
        "restaurant-2": {
          campaignId: "expired-campaign",
          clickedAt: new Date(now - SPONSORED_ATTRIBUTION_MAX_AGE_MS - 1_000).toISOString(),
        },
      }),
    );

    expect(getValidSponsoredAttributions("restaurant-1", now, window.localStorage).map((entry) => entry.campaignId))
      .toEqual(["legacy-campaign"]);
    expect(getValidSponsoredAttributions("restaurant-2", now, window.localStorage)).toEqual([]);
  });
});
