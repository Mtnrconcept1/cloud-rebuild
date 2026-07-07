import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SocialPostBoostDialog from "@/components/social/SocialPostBoostDialog";
import type { SocialFeedPost } from "@/lib/socialFeed";

const boostMocks = vi.hoisted(() => ({
  from: vi.fn(),
  invokeSupabaseFunction: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: boostMocks.from,
  }),
}));

vi.mock("@/lib/session", () => ({
  invokeSupabaseFunction: boostMocks.invokeSupabaseFunction,
}));

const post: SocialFeedPost = {
  id: "post-boost-dashboard",
  activityId: "post-boost-dashboard",
  activityType: "post",
  restaurantId: "restaurant-1",
  authorId: "owner-1",
  body: "Service de midi lance avec un plat du jour maison.",
  status: "published",
  createdAt: "2026-06-17T10:00:00.000Z",
  publishedAt: "2026-06-17T10:00:00.000Z",
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
  ctaType: "order",
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

describe("SocialPostBoostDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    boostMocks.from.mockReset();
    boostMocks.invokeSupabaseFunction.mockReset();
    boostMocks.from.mockImplementation((table: string) => {
      if (table === "restaurants") {
        const chain = {
          select: vi.fn(() => chain),
          not: vi.fn(() => chain),
          limit: vi.fn(async () => ({
            data: [
              { city: "Geneve", cuisine_type: "Italien, Africain" },
              { city: "Lausanne", cuisine_type: "Healthy" },
            ],
            error: null,
          })),
        };
        return chain;
      }
      if (table === "cuisines") {
        const chain = {
          select: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => ({
            data: [
              { name: "Italien" },
              { name: "Africain" },
              { name: "Healthy" },
            ],
            error: null,
          })),
        };
        return chain;
      }
      return {
        select: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      };
    });
  });

  it("opens the full sponsored post settings modal from a dashboard boost button", async () => {
    boostMocks.invokeSupabaseFunction.mockImplementation(async (functionName: string) => {
      if (functionName === "create-social-post-boost") {
        return { data: { campaign: { id: "campaign-dashboard-1" } }, error: null };
      }
      return { data: null, error: null };
    });

    render(<SocialPostBoostDialog post={post} restaurantId="restaurant-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Mettre en avant/i }));

    expect(screen.getByRole("heading", { name: /Paramétrer la publication sponsorisée/i })).toBeInTheDocument();
    expect(screen.getByText(/Cible de prospects/i)).toBeInTheDocument();
    expect(screen.getByText(/Type de cuisine préférée/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Conversion/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Nouveaux clients/i }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Lausanne/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Femmes/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Africain/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Fans et clients/i }));
    fireEvent.change(screen.getByLabelText(/Panier moyen minimum/i), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText(/Activité récente/i), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Réservation|Reservation/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Midi/i }));
    fireEvent.change(screen.getByLabelText(/Budget total/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/Durée/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Utiliser les crédits TOK/i }));

    await waitFor(() => {
      expect(boostMocks.invokeSupabaseFunction).toHaveBeenCalledWith(
        "create-social-post-boost",
        expect.objectContaining({
          body: expect.objectContaining({
            restaurantId: "restaurant-1",
            postId: "post-boost-dashboard",
            totalBudget: 40,
            durationDays: 5,
            pricingStrategy: "conversion",
            targetCriteria: expect.objectContaining({
              restaurantId: "restaurant-1",
              cities: expect.arrayContaining(["geneve", "lausanne"]),
              cuisines: expect.arrayContaining(["italien", "africain"]),
              genders: ["female"],
              favoritesOnly: true,
              minAvgBasket: 35,
              maxDaysSinceOrder: 60,
              customerSegment: "new",
            }),
          }),
        }),
      );
    });

    expect(boostMocks.invokeSupabaseFunction).not.toHaveBeenCalledWith("create-checkout", expect.anything());
  }, 15000);

  it("lets TOK AI choose the strongest sponsored settings before reserving credits", async () => {
    boostMocks.invokeSupabaseFunction.mockImplementation(async (functionName: string) => {
      if (functionName === "create-social-post-boost") {
        return { data: { campaign: { id: "campaign-ai-1" } }, error: null };
      }
      return { data: null, error: null };
    });

    render(<SocialPostBoostDialog post={post} restaurantId="restaurant-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Mettre en avant/i }));
    fireEvent.click(screen.getByRole("button", { name: /IA optimise ma publicit/i }));

    expect(screen.getByText(/Plan IA appliqu/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Conversion/i })).toBeChecked();
    expect((screen.getByLabelText(/Budget total/i) as HTMLInputElement).value).toBe("45");
    expect((screen.getByLabelText(/Dur/i) as HTMLInputElement).value).toBe("5");
    expect(screen.getByRole("radio", { name: /Nouveaux clients/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Midi/i })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Utiliser les crédits TOK/i }));

    await waitFor(() => {
      expect(boostMocks.invokeSupabaseFunction).toHaveBeenCalledWith(
        "create-social-post-boost",
        expect.objectContaining({
          body: expect.objectContaining({
            totalBudget: 45,
            durationDays: 5,
            pricingStrategy: "conversion",
            targetCriteria: expect.objectContaining({
              cities: ["geneve"],
              cuisines: ["italien"],
              customerSegment: "new",
              genders: ["all"],
              journeyTypes: ["delivery", "takeaway"],
              serviceMoments: ["lunch"],
            }),
          }),
        }),
      );
    });
    expect(boostMocks.invokeSupabaseFunction).not.toHaveBeenCalledWith("create-checkout", expect.anything());
  });
});
