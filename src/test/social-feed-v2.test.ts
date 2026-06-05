import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SOCIAL_FEED_SCOPES,
  SOCIAL_AUDIENCE_SEGMENTS,
  SOCIAL_MARKETING_GOALS,
  SOCIAL_POST_CTAS,
  SOCIAL_POST_TYPES,
  getSocialRecommendationReasons,
  getVisibilityForAudienceSegment,
  isMissingSocialMarketingSchemaError,
  normalizeSocialFeedScope,
  scoreSocialMarketingDraft,
  validateSocialPostDraft,
  type SocialFeedPost,
} from "@/lib/socialFeed";

const root = process.cwd();

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
    campaignGoal: "orders",
    campaignName: null,
    audienceSegment: "local",
    offerCode: null,
    utmCampaign: null,
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

  it("defines marketing goals and audience segments for restaurateurs", () => {
    expect(SOCIAL_MARKETING_GOALS.map((goal) => goal.value)).toEqual([
      "awareness",
      "orders",
      "bookings",
      "loyalty",
      "offer",
    ]);
    expect(SOCIAL_AUDIENCE_SEGMENTS.map((segment) => segment.value)).toEqual([
      "local",
      "followers",
      "returning",
      "discovery",
    ]);
    expect(getVisibilityForAudienceSegment("followers")).toBe("followers");
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
      "La programmation doit être dans le futur.",
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
    ).toEqual(["Restaurant suivi", "Cuisine préférée", "À proximité"]);
  });

  it("scores marketing drafts with actionable recommendations", () => {
    const weak = scoreSocialMarketingDraft({
      body: "Plat du jour",
      filesCount: 0,
      postType: "annonce",
      ctaType: "none",
      campaignGoal: "orders",
      audienceSegment: "local",
    });

    expect(weak.level).toBe("faible");
    expect(weak.recommendations.join(" ")).toContain("CTA conseille");

    const strong = scoreSocialMarketingDraft({
      body: "Service de midi lance avec notre plat signature, une preparation rapide et une quantite limitee pour les clients proches.",
      filesCount: 1,
      postType: "plat",
      ctaType: "order",
      scheduledAt: "2026-05-23T10:30:00.000Z",
      campaignGoal: "orders",
      audienceSegment: "local",
    });

    expect(strong.score).toBe(100);
    expect(strong.level).toBe("excellent");
  });

  it("detects missing marketing columns from PostgREST schema cache errors", () => {
    expect(
      isMissingSocialMarketingSchemaError({
        code: "PGRST204",
        message: "Could not find the 'campaign_goal' column of 'social_posts' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingSocialMarketingSchemaError({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(false);
  });

  it("keeps open social reports idempotent when the unique report index already exists", () => {
    const source = readFileSync(resolve(root, "src/hooks/useSocialFeed.ts"), "utf8");

    expect(source).toContain("isDuplicateOpenSocialReport");
    expect(source).toContain("social_reports_open_unique_idx");
    expect(source).toContain('candidate?.code === "23505"');
    expect(source).toContain("alreadyReported");
    expect(source).toContain("Signalement déjà transmis.");
  });
});
