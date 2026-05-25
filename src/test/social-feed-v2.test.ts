import { describe, expect, it } from "vitest";

import {
  SOCIAL_FEED_SCOPES,
  SOCIAL_POST_CTAS,
  SOCIAL_POST_TYPES,
  getSocialRecommendationReasons,
  normalizeSocialFeedScope,
  validateSocialPostDraft,
  type SocialFeedPost,
} from "@/lib/socialFeed";

const basePost: SocialFeedPost = {
  id: "post-1",
  activityId: "post-1",
  activityType: "post",
  restaurantId: "restaurant-1",
  authorId: "owner-1",
  body: "Plat du jour",
  status: "published",
  createdAt: "2026-05-23T10:00:00.000Z",
  publishedAt: "2026-05-23T10:00:00.000Z",
  likesCount: 0,
  reactionCounts: {},
  myReaction: null,
  commentsCount: 0,
  repostsCount: 0,
  sharesCount: 0,
  likedByMe: false,
  followedByMe: true,
  repostedByMe: false,
  savedByMe: false,
  score: 0,
  media: [],
  restaurant: {
    id: "restaurant-1",
    name: "Quirinale",
    city: "Geneve",
    cuisineType: "Italien",
  },
  recommendationReasons: [],
  postType: "plat",
  ctaType: "reserve",
  ctaTargetId: null,
  scheduledAt: null,
  pinnedUntil: null,
  visibility: "public",
};

describe("social feed v2 helpers", () => {
  it("defines the client feed scopes and normalizes unknown values", () => {
    expect(SOCIAL_FEED_SCOPES.map((scope) => scope.value)).toEqual([
      "for_you",
      "followed",
      "nearby",
      "offers",
    ]);

    expect(normalizeSocialFeedScope("followed")).toBe("followed");
    expect(normalizeSocialFeedScope("unknown")).toBe("for_you");
    expect(normalizeSocialFeedScope(null)).toBe("for_you");
  });

  it("defines restaurateur post types and CTA options", () => {
    expect(SOCIAL_POST_TYPES.map((type) => type.value)).toEqual([
      "plat",
      "promo",
      "evenement",
      "coulisses",
      "annonce",
    ]);
    expect(SOCIAL_POST_CTAS.map((cta) => cta.value)).toEqual([
      "none",
      "reserve",
      "order",
      "menu",
      "offer",
    ]);
  });

  it("validates social post drafts before upload", () => {
    expect(
      validateSocialPostDraft({
        body: "  ",
        postType: "plat",
        ctaType: "reserve",
        filesCount: 11,
        scheduledAt: "2026-01-01T00:00:00.000Z",
        nowIso: "2026-05-23T12:00:00.000Z",
      }),
    ).toEqual([
      "Le texte du post est requis.",
      "Maximum 10 medias par post.",
      "La programmation doit etre dans le futur.",
    ]);
  });

  it("derives visible recommendation reasons for feed cards", () => {
    expect(
      getSocialRecommendationReasons(basePost, {
        viewerCity: "Geneve",
        favoriteCuisines: ["italien"],
        followedRestaurantIds: ["restaurant-1"],
        favoriteRestaurantIds: [],
        interactedRestaurantIds: [],
      }),
    ).toEqual(["Restaurant suivi", "Cuisine preferee", "A proximite"]);
  });
});
