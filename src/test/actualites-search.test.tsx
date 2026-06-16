import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Actualites from "@/pages/Actualites";
import type { SocialFeedPost } from "@/lib/socialFeed";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    role: "client",
    roles: ["client"],
    isSuperAdmin: false,
    user: { id: "client-1", email: "client@example.com" },
  }),
}));

vi.mock("@/pages/dashboard/useOwnerRestaurants", () => ({
  useOwnerRestaurants: () => ({
    restaurants: [],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/components/social/SocialComposer", () => ({
  default: () => null,
}));

vi.mock("@/components/social/TrackedSocialPostCard", () => ({
  default: ({ post }: { post: SocialFeedPost }) => (
    <article data-testid="tracked-post">
      <h2>{post.restaurant.name}</h2>
      <p>{post.restaurant.cuisineType}</p>
      <p>{post.restaurant.city}</p>
      <p>{post.body}</p>
      <p>{post.recommendationReasons?.join(" ")}</p>
    </article>
  ),
}));

const posts = [
  makePost({
    id: "post-quirinale",
    restaurantName: "Quirinale",
    city: "Pulpinge",
    cuisineType: "Italien",
    body: "Offre limitee aujourd'hui avec des tables libres pour le service de midi.",
    recommendationReasons: ["Clients proches", "Offre midi"],
  }),
  makePost({
    id: "post-sakura",
    restaurantName: "Sakura",
    city: "Geneve",
    cuisineType: "Japonais",
    body: "En cuisine: coulisses du ramen maison et arrivages du marche.",
    recommendationReasons: ["Arrivages", "Coulisses"],
  }),
  makePost({
    id: "post-bistro",
    restaurantName: "Bistro Gare",
    city: "Lausanne",
    cuisineType: "Francais",
    body: "Menu rapide pour les voyageurs du soir.",
    recommendationReasons: ["Service rapide"],
  }),
];

vi.mock("@/hooks/useSocialFeed", () => ({
  useInfiniteSocialFeed: () => ({
    data: { pages: [{ posts }] },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useToggleRestaurantFollow: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

function makePost({
  id,
  restaurantName,
  city,
  cuisineType,
  body,
  recommendationReasons,
}: {
  id: string;
  restaurantName: string;
  city: string;
  cuisineType: string;
  body: string;
  recommendationReasons: string[];
}): SocialFeedPost {
  return {
    id,
    activityId: id,
    activityType: "post",
    restaurantId: `${id}-restaurant`,
    authorId: "owner-1",
    body,
    status: "published",
    createdAt: "2026-06-16T10:00:00.000Z",
    publishedAt: "2026-06-16T10:00:00.000Z",
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
    score: 1,
    media: [],
    postType: "annonce",
    ctaType: "none",
    recommendationReasons,
    restaurant: {
      id: `${id}-restaurant`,
      name: restaurantName,
      imageUrl: null,
      city,
      cuisineType,
    },
  };
}

function renderActualites() {
  return render(
    <MemoryRouter initialEntries={["/actualites"]}>
      <Routes>
        <Route path="/actualites" element={<Actualites />} />
      </Routes>
    </MemoryRouter>,
  );
}

function visiblePostNames() {
  return screen.getAllByTestId("tracked-post").map((post) => within(post).getByRole("heading").textContent);
}

describe("Actualites search", () => {
  it("places search above the feed and filters by restaurant, cuisine, city and post tags", () => {
    renderActualites();

    const search = screen.getByRole("searchbox", {
      name: /rechercher dans les actualit[eé]s/i,
    });
    const feed = screen.getByTestId("actualites-feed");
    expect(search.compareDocumentPosition(feed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(search, { target: { value: "Pulpinge" } });
    expect(visiblePostNames()).toEqual(["Quirinale"]);

    fireEvent.change(search, { target: { value: "japonais" } });
    expect(visiblePostNames()).toEqual(["Sakura"]);

    fireEvent.change(search, { target: { value: "#Coulisses" } });
    expect(visiblePostNames()).toEqual(["Sakura"]);

    fireEvent.change(search, { target: { value: "tables libres" } });
    expect(visiblePostNames()).toEqual(["Quirinale"]);
  });

  it("starts a search when a trend hashtag is clicked", () => {
    renderActualites();

    fireEvent.click(screen.getByRole("button", { name: /rechercher #arrivages/i }));

    expect(screen.getByRole("searchbox", { name: /rechercher dans les actualit[eé]s/i })).toHaveValue("#Arrivages");
    expect(visiblePostNames()).toEqual(["Sakura"]);
  });
});
