import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SocialPostCard from "@/components/social/SocialPostCard";

const socialHooks = vi.hoisted(() => ({
  addComment: vi.fn(async () => undefined),
  comments: [] as any[],
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
  useSocialComments: () => ({ data: socialHooks.comments, isLoading: false }),
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

async function settleUi() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function clickAndSettle(element: Element) {
  fireEvent.click(element);
  await settleUi();
}

async function pointerDownAndSettle(element: Element) {
  fireEvent.pointerDown(element);
  await settleUi();
}

describe("SocialPostCard actions", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture ??= vi.fn();
    socialHooks.addComment.mockClear();
    socialHooks.deleteMutate.mockClear();
    socialHooks.feedbackMutate.mockClear();
    socialHooks.mutate.mockClear();
    socialHooks.mutateAsync.mockClear();
    socialHooks.reportMutate.mockClear();
    socialHooks.comments = [];
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
    expect(screen.getByRole("dialog", { name: "Signaler ce post" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Raison du signalement"), { target: { value: "harassment" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    expect(socialHooks.reportMutate).toHaveBeenCalledWith({
      targetType: "post",
      targetId: "post-1",
      reason: "Harcèlement ou attaque ciblée",
    });
  });

  it("requires details before submitting an other report reason", () => {
    render(
      <MemoryRouter>
        <SocialPostCard post={post as any} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Signaler le post" }));
    fireEvent.change(screen.getByLabelText("Raison du signalement"), { target: { value: "other" } });

    const submitButton = screen.getByRole("button", { name: "Envoyer le signalement" });
    expect(submitButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Préciser la raison du signalement"), {
      target: { value: "Le contenu usurpe une photo d'un autre restaurant." },
    });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);
    expect(socialHooks.reportMutate).toHaveBeenCalledWith({
      targetType: "post",
      targetId: "post-1",
      reason: "Autres - Le contenu usurpe une photo d'un autre restaurant.",
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

  it("collapses long mobile copy behind Afficher plus and highlights the menu CTA", () => {
    render(
      <MemoryRouter>
        <SocialPostCard
          post={{
            ...post,
            body: "En cuisine aujourd'hui: un arrivage frais, une preparation maison et une equipe prete pour le service. Decouvrez la carte du moment avec nos suggestions de saison.",
            ctaType: "menu",
            media: [{
              id: "media-1",
              postId: "post-1",
              mediaUrl: "https://example.com/video.webm",
              mediaType: "video",
              sortOrder: 0,
              altText: "Cuisine du jour",
            }],
          } as any}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Voir le menu/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options du média" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /👍\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Afficher les commentaires" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sauver" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signaler le post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trier les commentaires" })).toBeInTheDocument();
    expect(screen.getByText("Commentaires (0)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Écrire un commentaire...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afficher plus" }));
    expect(screen.getByRole("button", { name: "Afficher moins" })).toBeInTheDocument();
  });

  it("sorts comments by date or likes from the comments panel", async () => {
    socialHooks.comments = [
      {
        id: "popular-old",
        postId: "post-1",
        parentCommentId: null,
        userId: "user-2",
        body: "Commentaire populaire",
        status: "published",
        createdAt: "2026-06-01T10:00:00.000Z",
        authorName: "Client A",
        reactionsCount: 8,
        reactionCounts: { like: 8 },
        myReaction: null,
      },
      {
        id: "recent-quiet",
        postId: "post-1",
        parentCommentId: null,
        userId: "user-3",
        body: "Commentaire recent",
        status: "published",
        createdAt: "2026-06-03T10:00:00.000Z",
        authorName: "Client B",
        reactionsCount: 1,
        reactionCounts: { like: 1 },
        myReaction: null,
      },
    ];

    render(
      <MemoryRouter>
        <SocialPostCard post={{ ...post, commentsCount: 2 } as any} />
      </MemoryRouter>,
    );

    await clickAndSettle(screen.getByRole("button", { name: "Afficher les commentaires" }));

    const popularComment = screen.getByText("Commentaire populaire");
    const recentComment = screen.getByText("Commentaire recent");
    expect(recentComment.compareDocumentPosition(popularComment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await pointerDownAndSettle(screen.getByRole("button", { name: "Trier les commentaires" }));
    await clickAndSettle(screen.getByRole("menuitem", { name: "Plus likés" }));

    expect(popularComment.compareDocumentPosition(recentComment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the first mobile comment preview and opens the full post comments panel", async () => {
    socialHooks.comments = [
      {
        id: "comment-preview",
        postId: "post-1",
        parentCommentId: null,
        userId: "user-2",
        body: "Premier avis visible directement sous la vidéo.",
        status: "published",
        createdAt: "2026-06-04T10:00:00.000Z",
        authorName: "Client Preview",
        reactionsCount: 2,
        reactionCounts: { like: 2 },
        myReaction: null,
      },
    ];

    render(
      <MemoryRouter>
        <SocialPostCard
          post={{
            ...post,
            body: "Post restaurateur affiché dans la modale.",
            commentsCount: 1,
            media: [{
              id: "media-1",
              postId: "post-1",
              mediaUrl: "https://example.com/video.webm",
              mediaType: "video",
              sortOrder: 0,
              altText: "Cuisine du jour",
            }],
          } as any}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Premier avis visible directement sous la vidéo.")).toBeInTheDocument();

    await clickAndSettle(screen.getByRole("button", { name: "Voir plus" }));

    expect(await screen.findByRole("dialog", { name: "Commentaires" })).toBeInTheDocument();
    expect(screen.getAllByText("Post restaurateur affiché dans la modale.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Premier avis visible directement sous la vidéo.").length).toBeGreaterThanOrEqual(1);
  });
  it("prefills comment replies with an @ mention of the parent author", async () => {
    socialHooks.comments = [
      {
        id: "comment-parent",
        postId: "post-1",
        parentCommentId: null,
        userId: "user-2",
        body: "Question sur le plat.",
        status: "published",
        createdAt: "2026-06-04T10:00:00.000Z",
        authorName: "raph",
        reactionsCount: 0,
        reactionCounts: {},
        myReaction: null,
      },
    ];

    render(
      <MemoryRouter>
        <SocialPostCard post={{ ...post, commentsCount: 1 } as any} />
      </MemoryRouter>,
    );

    await clickAndSettle(screen.getByRole("button", { name: "Afficher les commentaires" }));
    await clickAndSettle(screen.getAllByRole("button", { name: /pondre/i })[0]);

    const replyInput = await waitFor(() => screen.getByDisplayValue(/@raph/));
    fireEvent.change(replyInput, { target: { value: "@raph Merci pour votre question." } });
    await clickAndSettle(screen.getAllByRole("button", { name: "Envoyer le commentaire" }).at(-1)!);

    await waitFor(() => {
      expect(socialHooks.addComment).toHaveBeenCalledWith("@raph Merci pour votre question.");
    });
  });

  it("opens the reaction picker for a comment", async () => {
    socialHooks.comments = [
      {
        id: "comment-reactable",
        postId: "post-1",
        parentCommentId: null,
        userId: "user-2",
        body: "Commentaire avec reaction.",
        status: "published",
        createdAt: "2026-06-04T10:00:00.000Z",
        authorName: "raph",
        reactionsCount: 1,
        reactionCounts: { love: 1 },
        myReaction: "love",
      },
    ];

    render(
      <MemoryRouter>
        <SocialPostCard post={{ ...post, commentsCount: 1 } as any} />
      </MemoryRouter>,
    );

    await clickAndSettle(screen.getByRole("button", { name: "Afficher les commentaires" }));
    const reactionButton = await waitFor(() => screen.getByRole("button", { name: /1/ }));
    await clickAndSettle(reactionButton);

    expect(screen.getAllByRole("menuitem").length).toBeGreaterThanOrEqual(3);
  });
});
