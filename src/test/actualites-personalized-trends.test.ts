import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTUALITES_CLICK_SIGNAL_STORAGE_KEY,
  buildPersonalizedActualitesTrends,
  readActualitesPostSignals,
  rememberActualitesPostSignal,
} from "@/lib/actualitesPersonalizedTrends";
import type { SocialFeedPost } from "@/lib/socialFeed";

function makePost(overrides: Partial<SocialFeedPost> = {}): SocialFeedPost {
  return {
    id: "post-1",
    activityId: "activity-1",
    activityType: "post",
    restaurantId: "restaurant-1",
    authorId: "author-1",
    body: "Arrivage frais pour le service de midi avec une offre courte.",
    status: "published",
    createdAt: "2026-07-01T10:00:00.000Z",
    publishedAt: "2026-07-01T10:00:00.000Z",
    likesCount: 0,
    reactionCounts: {},
    myReaction: null,
    commentsCount: 0,
    repostsCount: 0,
    sharesCount: 0,
    likedByMe: false,
    followedByMe: false,
    repostedByMe: false,
    savedByMe: false,
    score: 0,
    media: [],
    postType: "promo",
    ctaType: "offer",
    campaignGoal: "offer",
    recommendationReasons: ["Cuisine preferee"],
    restaurant: {
      id: "restaurant-1",
      name: "Casa Lisboa",
      city: "Geneve",
      cuisineType: "Portugais, Grillades",
    },
    repost: null,
    ...overrides,
  };
}

describe("Actualites personalized trends", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("falls back to stable trends when no client signal is available", () => {
    expect(buildPersonalizedActualitesTrends({ max: 4 })).toEqual([
      "Offre midi",
      "Arrivages",
      "Coulisses",
      "Tables libres",
    ]);
  });

  it("prioritizes order, reservation and clicked-post interests", () => {
    const trends = buildPersonalizedActualitesTrends({
      max: 4,
      orders: [
        {
          restaurantCuisine: "Bresilien, Grillades",
          restaurantCity: "Geneve",
          createdAt: "2026-07-01T11:30:00.000Z",
        },
      ],
      reservations: [
        {
          restaurantCuisine: "Espagnol",
          restaurantCity: "Geneve",
          date: "2026-07-03",
          time: "12:15:00",
          partySize: 2,
        },
      ],
      clickedPosts: [
        {
          cuisineType: "Portugais",
          city: "Geneve",
          postType: "promo",
          ctaType: "offer",
          body: "Offre midi: arrivage de poissons frais et tables libres.",
          createdAt: "2026-07-01T09:30:00.000Z",
        },
      ],
    });

    expect(trends).toEqual(expect.arrayContaining(["Bresilien", "Offre midi", "Portugais", "Tables libres"]));
    expect(trends).toHaveLength(4);
  });

  it("stores compact clicked-post signals without storing restaurant names", () => {
    rememberActualitesPostSignal(makePost());

    const stored = readActualitesPostSignals();
    const rawStorage = window.localStorage.getItem(ACTUALITES_CLICK_SIGNAL_STORAGE_KEY);

    expect(stored[0]).toMatchObject({
      postId: "post-1",
      restaurantId: "restaurant-1",
      cuisineType: "Portugais, Grillades",
      city: "Geneve",
      postType: "promo",
      ctaType: "offer",
    });
    expect(rawStorage).not.toContain("Casa Lisboa");
  });
});
