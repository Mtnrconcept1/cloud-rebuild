import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SocialPostCard from "@/components/social/SocialPostCard";

const socialHooks = vi.hoisted(() => ({
  addComment: vi.fn(async () => undefined),
  mutate: vi.fn(),
  mutateAsync: vi.fn(async () => undefined),
}));

const originalInnerHeight = window.innerHeight;
const originalVisualViewportDescriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isSuperAdmin: false }),
}));

vi.mock("@/hooks/useSocialFeed", () => ({
  useAddSocialComment: () => ({ mutateAsync: socialHooks.addComment, isPending: false }),
  useDeleteSocialComment: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useDeleteSocialPost: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useRecordExternalShare: () => ({ mutateAsync: socialHooks.mutateAsync, isPending: false }),
  useRecordSocialFeedEvent: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useReportSocialItem: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useSetSocialCommentReaction: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useSetSocialPostReaction: () => ({ mutate: socialHooks.mutate, isPending: false }),
  useSocialComments: () => ({ data: [], isLoading: false }),
  useSocialFeedFeedback: () => ({ mutate: socialHooks.mutate, isPending: false }),
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

describe("SocialPostCard comment drawer", () => {
  beforeEach(() => {
    socialHooks.addComment.mockClear();
    socialHooks.mutate.mockClear();
    socialHooks.mutateAsync.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });

    if (originalVisualViewportDescriptor) {
      Object.defineProperty(window, "visualViewport", originalVisualViewportDescriptor);
    } else {
      delete (window as any).visualViewport;
    }
  });

  function mockKeyboardViewport() {
    const listeners = new Map<string, Set<() => void>>();
    const viewport = {
      height: 520,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      addEventListener: vi.fn((event: string, listener: () => void) => {
        const eventListeners = listeners.get(event) || new Set<() => void>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      }),
      removeEventListener: vi.fn((event: string, listener: () => void) => {
        listeners.get(event)?.delete(listener);
      }),
    };

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });

    return {
      viewport,
      emit: (event: string) => {
        listeners.get(event)?.forEach((listener) => listener());
      },
    };
  }

  it("keeps the mobile comment composer inside the drawer and submits comments", async () => {
    render(
      <MemoryRouter>
        <SocialPostCard post={post as any} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Afficher les commentaires" }));

    expect(screen.getByRole("heading", { name: "Commentaires" })).toBeInTheDocument();

    const drawer = document.querySelector("[data-vaul-drawer]");
    expect(drawer).toHaveClass("rounded-t-[1.5rem]");
    expect(drawer).toHaveClass("overflow-hidden");
    expect(drawer).toHaveStyle({ bottom: "0px", height: "auto", maxHeight: "none" });

    const textarea = screen.getByPlaceholderText("Ajouter un commentaire");
    expect(textarea).toHaveClass("min-w-0");
    expect(textarea).toHaveClass("flex-1");
    expect(textarea).toHaveClass("text-base");

    const sendButton = screen.getByRole("button", { name: "Envoyer le commentaire" });
    expect(sendButton).toHaveClass("shrink-0");

    fireEvent.change(textarea, { target: { value: "Commentaire mobile" } });
    fireEvent.click(sendButton);

    await waitFor(() => expect(socialHooks.addComment).toHaveBeenCalledWith("Commentaire mobile"));
  });

  it("anchors the drawer above the mobile keyboard visual viewport", async () => {
    const keyboard = mockKeyboardViewport();

    render(
      <MemoryRouter>
        <SocialPostCard post={post as any} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
    keyboard.emit("resize");

    const drawer = document.querySelector("[data-vaul-drawer]");
    expect(drawer).toBeInstanceOf(HTMLElement);

    await waitFor(() => {
      expect(drawer).toHaveStyle({
        top: "8px",
        bottom: "280px",
        height: "auto",
        maxHeight: "none",
      });
    });
  });
});
