import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Actualites from "@/pages/Actualites";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    role: "restaurateur",
    roles: ["client", "restaurateur"],
    isSuperAdmin: false,
    user: { id: "owner-1", email: "owner@example.com" },
  }),
}));

vi.mock("@/pages/dashboard/useOwnerRestaurants", () => ({
  useOwnerRestaurants: () => ({
    restaurants: [{ id: "restaurant-1", name: "Restaurant Test", disabled_dashboard_features: [] }],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/components/social/SocialComposer", () => ({
  default: ({ restaurantId, restaurantName }: { restaurantId: string | null; restaurantName?: string | null }) => (
    <div data-testid="social-composer">
      Composer {restaurantId} {restaurantName}
    </div>
  ),
}));

vi.mock("@/components/social/SocialPostCard", () => ({
  default: () => <div data-testid="social-post-card" />,
}));

vi.mock("@/hooks/useSocialFeed", () => ({
  useInfiniteSocialFeed: () => ({
    data: { pages: [{ posts: [] }] },
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

function renderActualites() {
  return render(
    <MemoryRouter initialEntries={["/actualites"]}>
      <Routes>
        <Route path="/actualites" element={<Actualites />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Actualites restaurateur access", () => {
  it("shows the inline social composer for a restaurateur on the public feed", () => {
    renderActualites();

    expect(screen.getByTestId("social-composer")).toHaveTextContent("restaurant-1 Restaurant Test");
    expect(screen.queryByRole("link", { name: /Gerer les posts/i })).not.toBeInTheDocument();
  });
});
