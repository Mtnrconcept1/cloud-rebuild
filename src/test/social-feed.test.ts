import { describe, expect, it } from "vitest";

import { rankSocialFeedItems, type SocialFeedRankInput } from "@/lib/socialFeed";

const baseInput: SocialFeedRankInput = {
  viewerCity: "Geneve",
  favoriteCuisines: ["italien", "japonais"],
  followedRestaurantIds: ["restaurant-followed"],
  favoriteRestaurantIds: ["restaurant-favorite"],
  interactedRestaurantIds: ["restaurant-interacted"],
  nowIso: "2026-05-22T12:00:00.000Z",
};

describe("rankSocialFeedItems", () => {
  it("prioritizes followed restaurants, preferences, local relevance and recent engagement", () => {
    const ranked = rankSocialFeedItems(
      [
        {
          id: "generic-popular",
          restaurantId: "restaurant-generic",
          cuisineType: "burger",
          city: "Lausanne",
          createdAt: "2026-05-22T11:00:00.000Z",
          likesCount: 100,
          commentsCount: 40,
          repostsCount: 12,
          sharesCount: 20,
        },
        {
          id: "followed-local",
          restaurantId: "restaurant-followed",
          cuisineType: "italien",
          city: "Geneve",
          createdAt: "2026-05-22T09:00:00.000Z",
          likesCount: 8,
          commentsCount: 3,
          repostsCount: 1,
          sharesCount: 2,
        },
        {
          id: "favorite-older",
          restaurantId: "restaurant-favorite",
          cuisineType: "japonais",
          city: "Geneve",
          createdAt: "2026-05-20T12:00:00.000Z",
          likesCount: 15,
          commentsCount: 4,
          repostsCount: 0,
          sharesCount: 1,
        },
        {
          id: "recent-match",
          restaurantId: "restaurant-new",
          cuisineType: "italien",
          city: "Geneve",
          createdAt: "2026-05-22T11:45:00.000Z",
          likesCount: 3,
          commentsCount: 1,
          repostsCount: 0,
          sharesCount: 0,
        },
      ],
      baseInput,
    );

    expect(ranked.map((item) => item.id)).toEqual([
      "followed-local",
      "recent-match",
      "favorite-older",
      "generic-popular",
    ]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
