import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SocialPostCard from "@/components/social/SocialPostCard";

const socialHooks = vi.hoisted(() => ({
  addComment: vi.fn(async () => undefined),
  deleteMutate: vi.fn(),
  feedbackMutate: vi.fn(),
  mutate: vi.fn(),
  mutateAsync: vi.fn(async () => undefined),
  reportMutate: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isSuperAdmin: false }),
}));

vi.mock("@/hooks/useSocialFeed", () => ({
  useAddSocialComment: () => ({ mutateAsync: socialHooks.addComment, isPending: false }),
  useDeleteSocialComment: () => ({ mutate: socialHooks.deleteMutate, isPending: false }),
  useDeleteSocialPost: () => ({ mutate: socialHooks.deleteMutate, isPending: false }),
  useRecordExternalShare: () => ({ mutateAsync: socialHooks.mutateAsync, isPending: false }),
  useRecordSocialFeedEvent: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useReportSocialItem: () => ({ mutate: socialHooks.reportMutate, isPending: false }),
  useSetSocialCommentReaction: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useSetSocialPostReaction: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useSocialComments: () => ({ data: [], isLoading: false }),
  useSocialFeedFeedback: () => ({ mutate: socialHooks.feedbackMutate, isPending: false }),
  useToggleRestaurantFollow: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useToggleSocialRepost: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useToggleSocialSave: () => ({ mutate: socialHooks.mutate, isPending: false }),
}));

const post = {
  id: "post-1",
  activityId: "post-1",
  activityType: "post",
  restaurantId: "restaurant-1",
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
    id: "restaurant-1",
    name: "Quirinale",
    city: "Geneve",
    cuisineType: "Italien",
  },
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

describe("SocialPostCard actions", () => {
  beforeEach(() => {
    socialHooks.addComment.mockClear();
    socialHooks.deleteMutate.mockClear();
    socialHooks.feedbackMutate.mockClear();
    socialHooks.mutate.mockClear();
    socialHooks.mutateAsync.mockClear();
    socialHooks.reportMutate.mockClear();
  });

  it("wires preference, hide and report actions to explicit feedback types", () => {
    render(
      <MemoryRouter>
        <SocialPostCard post={post as any} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Plus comme/i }));
    expect(socialHooks.feedbackMutate).toHaveBeenCalledWith({
      post,
      feedbackType: "show_more",
      reason: "Preference client",
    });

    fireEvent.click(screen.getByRole("button", { name: /Moins comme/i }));
    expect(socialHooks.feedbackMutate).toHaveBeenCalledWith({
      post,
      feedbackType: "not_interested",
      reason: "Moins comme ca",
    });

    fireEvent.click(screen.getByRole("button", { name: "Masquer" }));
    expect(socialHooks.feedbackMutate).toHaveBeenCalledWith({
      post,
      feedbackType: "hide_post",
      reason: "Post masque par le client",
    });

    fireEvent.click(screen.getByRole("button", { name: "Signaler le post" }));
    expect(socialHooks.reportMutate).toHaveBeenCalledWith({
      targetType: "post",
      targetId: "post-1",
      reason: "Contenu inapproprie",
    });
  });

  it("does not label an organic marketing post as sponsored before paid boost activation", () => {
    render(
      <MemoryRouter>
        <SocialPostCard post={{ ...post, campaignName: "Booster midi", isSponsored: false } as any} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Sponsoris/i)).not.toBeInTheDocument();
  });

  it("labels a post as sponsored only when a paid boost is active", () => {
    render(
      <MemoryRouter>
        <SocialPostCard post={{ ...post, campaignName: "Booster midi", isSponsored: true } as any} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Sponsoris/i)).toBeInTheDocument();
  });
});
