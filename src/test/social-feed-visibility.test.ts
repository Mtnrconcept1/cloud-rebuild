import { beforeEach, describe, expect, it } from "vitest";

import type { SocialFeedPost } from "@/lib/socialFeed";
import {
  clearSocialFeedHiddenFeedbackForTests,
  filterSocialPostsByHiddenFeedback,
  readSocialFeedHiddenFeedback,
  rememberSocialFeedHiddenFeedback,
} from "@/lib/socialFeedVisibility";

function makePost(id: string, restaurantId = "restaurant-1"): SocialFeedPost {
  return {
    id,
    activityId: id,
    activityType: "post",
    restaurantId,
    authorId: "owner-1",
    body: "Plat du jour",
    status: "published",
    createdAt: "2026-06-05T10:00:00.000Z",
    publishedAt: "2026-06-05T10:00:00.000Z",
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
    restaurant: {
      id: restaurantId,
      name: "Restaurant test",
      city: "Geneve",
      cuisineType: "Italien",
    },
    repost: null,
    recommendationReasons: [],
    postType: "plat",
    ctaType: "none",
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
}

describe("social feed visibility feedback", () => {
  beforeEach(() => {
    clearSocialFeedHiddenFeedbackForTests("user-1");
  });

  it("persists hidden post feedback locally so a refetch cannot show it again", () => {
    const hiddenPost = makePost("post-1");
    const visiblePost = makePost("post-2");

    rememberSocialFeedHiddenFeedback("user-1", hiddenPost, "hide_post");

    expect(filterSocialPostsByHiddenFeedback([hiddenPost, visiblePost], readSocialFeedHiddenFeedback("user-1"))).toEqual([
      visiblePost,
    ]);
  });

  it("hides a full restaurant but keeps show-more feedback visible", () => {
    const preferredPost = makePost("post-1", "restaurant-1");
    const hiddenRestaurantPost = makePost("post-2", "restaurant-2");

    rememberSocialFeedHiddenFeedback("user-1", preferredPost, "show_more");
    rememberSocialFeedHiddenFeedback("user-1", hiddenRestaurantPost, "hide_restaurant");

    expect(filterSocialPostsByHiddenFeedback([preferredPost, hiddenRestaurantPost], readSocialFeedHiddenFeedback("user-1"))).toEqual([
      preferredPost,
    ]);
  });
});
