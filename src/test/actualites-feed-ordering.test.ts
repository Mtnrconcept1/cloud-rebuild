import { describe, expect, it } from "vitest";

import {
  getActualitesPostActivityTime,
  isActualitesSponsoredPost,
  orderActualitesFeedPosts,
} from "@/lib/actualitesFeedOrdering";
import type { SocialFeedPost } from "@/lib/socialFeed";

function makePost(overrides: Partial<SocialFeedPost> & Pick<SocialFeedPost, "id">): SocialFeedPost {
  return {
    id: overrides.id,
    activityId: overrides.activityId || overrides.id,
    activityType: overrides.activityType || "post",
    restaurantId: overrides.restaurantId || `restaurant-${overrides.id}`,
    authorId: overrides.authorId || "author-1",
    body: overrides.body || "Post actualites test",
    status: overrides.status || "published",
    createdAt: overrides.createdAt || "2026-06-11T10:00:00.000Z",
    publishedAt: overrides.publishedAt ?? overrides.createdAt ?? "2026-06-11T10:00:00.000Z",
    likesCount: overrides.likesCount ?? 0,
    reactionCounts: overrides.reactionCounts || {},
    myReaction: overrides.myReaction ?? null,
    commentsCount: overrides.commentsCount ?? 0,
    repostsCount: overrides.repostsCount ?? 0,
    sharesCount: overrides.sharesCount ?? 0,
    likedByMe: overrides.likedByMe ?? false,
    followedByMe: overrides.followedByMe ?? false,
    repostedByMe: overrides.repostedByMe ?? false,
    savedByMe: overrides.savedByMe ?? false,
    score: overrides.score ?? 0,
    media: overrides.media || [],
    postType: overrides.postType || "annonce",
    ctaType: overrides.ctaType || "none",
    ctaTargetId: overrides.ctaTargetId ?? null,
    scheduledAt: overrides.scheduledAt ?? null,
    pinnedUntil: overrides.pinnedUntil ?? null,
    visibility: overrides.visibility || "public",
    campaignGoal: overrides.campaignGoal || "awareness",
    campaignName: overrides.campaignName ?? null,
    isSponsored: overrides.isSponsored ?? false,
    promotionStatus: overrides.promotionStatus ?? null,
    promotionPaymentStatus: overrides.promotionPaymentStatus ?? null,
    audienceSegment: overrides.audienceSegment || "local",
    offerCode: overrides.offerCode ?? null,
    utmCampaign: overrides.utmCampaign ?? null,
    recommendationReasons: overrides.recommendationReasons || [],
    restaurant: overrides.restaurant || {
      id: overrides.restaurantId || `restaurant-${overrides.id}`,
      name: `Restaurant ${overrides.id}`,
    },
    repost: overrides.repost ?? null,
  };
}

describe("Actualites feed ordering", () => {
  it("places an active paid sponsored post first when one is available", () => {
    const posts = [
      makePost({ id: "organic-new", createdAt: "2026-06-11T12:00:00.000Z", score: 100 }),
      makePost({
        id: "sponsored-active",
        createdAt: "2026-06-11T08:00:00.000Z",
        isSponsored: true,
        promotionStatus: "active",
        promotionPaymentStatus: "paid",
        score: 2,
      }),
      makePost({ id: "organic-mid", createdAt: "2026-06-11T09:00:00.000Z" }),
    ];

    expect(orderActualitesFeedPosts(posts, "seed").map((post) => post.id)[0]).toBe("sponsored-active");
  });

  it("does not treat unpaid or inactive boosts as sponsored placements", () => {
    expect(isActualitesSponsoredPost(makePost({
      id: "unpaid",
      isSponsored: true,
      promotionStatus: "active",
      promotionPaymentStatus: "pending",
    }))).toBe(false);
    expect(isActualitesSponsoredPost(makePost({
      id: "active",
      isSponsored: true,
      promotionStatus: "active",
      promotionPaymentStatus: "paid",
    }))).toBe(true);
  });

  it("keeps the remaining feed roughly chronological while shuffling inside time blocks", () => {
    const posts = [
      makePost({ id: "old", createdAt: "2026-06-09T08:00:00.000Z" }),
      makePost({ id: "recent-a", createdAt: "2026-06-11T10:00:00.000Z" }),
      makePost({ id: "recent-b", createdAt: "2026-06-11T11:00:00.000Z" }),
      makePost({ id: "yesterday", createdAt: "2026-06-10T10:00:00.000Z" }),
    ];

    const orderedIds = orderActualitesFeedPosts(posts, "stable-seed").map((post) => post.id);

    expect(new Set(orderedIds.slice(0, 2))).toEqual(new Set(["recent-a", "recent-b"]));
    expect(orderedIds.indexOf("yesterday")).toBeGreaterThanOrEqual(2);
    expect(orderedIds.at(-1)).toBe("old");
    expect(orderActualitesFeedPosts(posts, "stable-seed").map((post) => post.id)).toEqual(orderedIds);
  });

  it("uses repost time as the activity time for reshared posts", () => {
    const repost = makePost({
      id: "old-post-reshared",
      activityId: "repost-1",
      activityType: "repost",
      createdAt: "2026-05-01T10:00:00.000Z",
      repost: {
        id: "repost-1",
        userId: "user-1",
        createdAt: "2026-06-11T12:00:00.000Z",
      },
    });

    expect(getActualitesPostActivityTime(repost)).toBe(Date.parse("2026-06-11T12:00:00.000Z"));
  });

  it("filters inactive organic posts from the displayed order", () => {
    const posts = [
      makePost({ id: "published", status: "published" }),
      makePost({ id: "hidden", status: "hidden" }),
      makePost({ id: "scheduled", status: "scheduled" }),
    ];

    expect(orderActualitesFeedPosts(posts, "seed").map((post) => post.id)).toEqual(["published"]);
  });
});
