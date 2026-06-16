import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUDIENCE_CRITERIA,
  matchesAudienceCriteria,
  normalizeAudienceCriteria,
  scoreAudienceCriteria,
  summarizeAudienceCriteria,
} from "@/lib/campaignTargeting";

describe("campaignTargeting", () => {
  it("normalizes targeting payloads", () => {
    const criteria = normalizeAudienceCriteria({
      cuisines: ["Pizza", "pizza", " Italien "],
      cities: ["Genève", "geneve"],
      customerSegment: "loyal",
      journeyTypes: ["delivery", "delivery", "reservation"],
      serviceMoments: ["dinner", "weekend", "unknown" as any],
    });

    expect(criteria.cuisines).toEqual(["pizza", "italien"]);
    expect(criteria.cities).toEqual(["geneve"]);
    expect(criteria.customerSegment).toBe("loyal");
    expect(criteria.journeyTypes).toEqual(["delivery", "reservation"]);
    expect(criteria.serviceMoments).toEqual(["dinner", "weekend"]);
  });

  it("matches an audience snapshot against restaurant targeting", () => {
    const matches = matchesAudienceCriteria(
      {
        ...DEFAULT_AUDIENCE_CRITERIA,
        cuisines: ["pizza"],
        cities: ["genève"],
        customerSegment: "loyal",
        favoritesOnly: true,
        journeyTypes: ["delivery"],
        serviceMoments: ["dinner"],
        minOrders: 3,
        minAvgBasket: 20,
        maxDaysSinceOrder: 60,
      },
      {
        city: "Geneve",
        gender: "female",
        favoriteRestaurantIds: ["restaurant-1"],
        interactionCount: 8,
        avgBasket: 32,
        daysSinceLastActivity: 12,
        cuisineSignals: ["pizza", "italien"],
        journeyTypes: ["delivery", "reservation"],
        serviceMoments: ["dinner", "weekend"],
      },
      "restaurant-1",
    );

    expect(matches).toBe(true);
  });

  it("scores soft targeting with stronger weight for cuisine than gender", () => {
    const result = scoreAudienceCriteria(
      {
        ...DEFAULT_AUDIENCE_CRITERIA,
        cuisines: ["italien"],
        genders: ["female"],
        journeyTypes: ["delivery"],
      },
      {
        city: "Geneve",
        gender: "female",
        favoriteRestaurantIds: [],
        interactionCount: 1,
        avgBasket: 18,
        daysSinceLastActivity: 8,
        cuisineSignals: ["italien"],
        journeyTypes: ["delivery"],
        serviceMoments: [],
      },
    );

    expect(result.score).toBe(15);
    expect(result.matchedCriteria).toEqual(["gender", "cuisine", "journeyType"]);
  });

  it("allows truly new users to match the new customer segment", () => {
    const matches = matchesAudienceCriteria(
      {
        ...DEFAULT_AUDIENCE_CRITERIA,
        customerSegment: "new",
      },
      {
        city: "Geneve",
        gender: null,
        favoriteRestaurantIds: [],
        interactionCount: 0,
        avgBasket: 0,
        daysSinceLastActivity: null,
        cuisineSignals: [],
        journeyTypes: [],
        serviceMoments: [],
      },
      "restaurant-1",
    );

    expect(matches).toBe(true);
  });

  it("builds readable targeting summaries", () => {
    const summary = summarizeAudienceCriteria({
      ...DEFAULT_AUDIENCE_CRITERIA,
      customerSegment: "inactive",
      cities: ["lausanne", "geneve"],
      minOrders: 2,
      favoritesOnly: true,
      maxDaysSinceOrder: 30,
    });

    expect(summary).toContain("Clients a réactiver");
    expect(summary).toContain("2 villes");
    expect(summary).toContain("2+ commandes");
    expect(summary).toContain("Fans du restaurant");
    expect(summary).toContain("Actifs 30j");
  });
});
