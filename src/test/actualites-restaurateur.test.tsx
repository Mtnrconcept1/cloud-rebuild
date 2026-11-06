import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Actualites, { ActualitesFeed } from "@/pages/Actualites";
import type { OwnedRestaurant } from "@/pages/dashboard/useOwnerRestaurants";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    role: "restaurateur",
    roles: ["client", "restaurateur"],
    isSuperAdmin: false,
    user: { id: "owner-1", email: "owner@example.com" },
  }),
}));

vi.mock("@/pages/dashboard/useOwnerRestaurants", () => ({
  useOwnerRestaurants: () => ({
    restaurants: [{
      id: "restaurant-1",
      name: "Restaurant Test",
      disabled_dashboard_features: [],
      socialLinks: {
        instagram: "https://www.instagram.com/restauranttest",
        facebook: "https://www.facebook.com/restauranttest",
        tiktok: "https://www.tiktok.com/@restauranttest",
      },
    }, { id: "restaurant-2", name: "Deuxième table", socialLinks: {} }],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/components/social/SocialComposer", () => ({
  default: function ComposerPreview({
    restaurantId,
    restaurantName,
    socialLinks,
    openRequest = 0,
    sponsorDialogRequest = 0,
  }: {
    restaurantId: string | null;
    restaurantName?: string | null;
    socialLinks?: Record<string, string | null>;
    openRequest?: number;
    sponsorDialogRequest?: number;
  }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
      if (openRequest > 0) setOpen(true);
    }, [openRequest]);
    return (
      <div data-testid="social-composer" data-sponsor-request={sponsorDialogRequest}>
        Composer {restaurantId} {restaurantName}
        {" "}
        {Object.keys(socialLinks || {}).join(" ")}
        {open ? <div role="dialog" aria-label="Créer une publication"><button type="button" onClick={() => setOpen(false)}>Fermer la publication</button></div> : null}
      </div>
    );
  },
}));

vi.mock("@/components/social/SocialPostCard", () => ({
  default: () => <div data-testid="social-post-card" />,
}));

vi.mock("@/hooks/useSocialFeed", () => ({
  useRestaurantActualitesAccess: () => ({ data: null, isLoading: false }),
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
  useSearchActualitesPosts: () => ({
    data: { pages: [{ posts: [], totalCount: 0, nextOffset: null }] },
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

vi.mock("@/components/notifications/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/hooks/useTokLogo", () => ({ useTokLogoSrc: () => "/images/home/tok-logo-ui.webp" }));

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
    expect(screen.getByTestId("social-composer")).toHaveTextContent("instagram facebook tiktok");
    expect(screen.queryByRole("link", { name: /Gerer les posts/i })).not.toBeInTheDocument();
  });
  it("keeps restaurant switching and account navigation available from the mobile account menu", () => {
    renderActualites();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon espace" }));
    const menu = screen.getByRole("dialog", { name: "Mon espace TOK" });
    expect(within(menu).getByRole("link", { name: "Mon profil" })).toHaveAttribute("href", "/dashboard/mon-compte-facturation");
    fireEvent.change(within(menu).getByRole("combobox", { name: "Restaurant actif" }), { target: { value: "restaurant-2" } });
    expect(screen.getByTestId("social-composer")).toHaveTextContent("restaurant-2 Deuxième table");
    fireEvent.click(within(menu).getByRole("button", { name: "Enregistrés" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Vos publications enregistrées")).toBeInTheDocument();
  });

  it("returns keyboard focus to the account button when the account panel closes", async () => {
    renderActualites();
    const launcher = screen.getByRole("button", { name: "Ouvrir mon espace" });
    launcher.focus();
    fireEvent.click(launcher);
    const panel = screen.getByRole("dialog", { name: "Mon espace TOK" });
    fireEvent.click(within(panel).getByRole("button", { name: /Close|Fermer/i }));
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it.each(["create", "sponsor"])("does not replay a closed %s request after switching restaurants in the mobile account menu", (action) => {
    renderActualites();
    if (action === "sponsor") {
      fireEvent.click(screen.getByText("Explorer le fil"));
      fireEvent.click(screen.getByRole("button", { name: "Sponsoriser une publication" }));
      expect(screen.getByTestId("social-composer")).toHaveAttribute("data-sponsor-request", "1");
    } else {
      fireEvent.click(screen.getAllByRole("button", { name: "Créer un post" })[0]);
    }
    expect(screen.getByRole("dialog", { name: "Créer une publication" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fermer la publication" }));

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon espace" }));
    const menu = screen.getByRole("dialog", { name: "Mon espace TOK" });
    const restaurant = within(menu).getByRole("combobox", { name: "Restaurant actif" });
    fireEvent.change(restaurant, { target: { value: "restaurant-2" } });
    expect(screen.getByTestId("social-composer")).toHaveTextContent("restaurant-2 Deuxième table");
    expect(screen.getByTestId("social-composer")).toHaveAttribute("data-sponsor-request", "0");
    expect(screen.queryByText("Fermer la publication")).not.toBeInTheDocument();

    fireEvent.change(restaurant, { target: { value: "restaurant-1" } });
    expect(screen.getByTestId("social-composer")).toHaveAttribute("data-sponsor-request", "0");
    expect(screen.queryByText("Fermer la publication")).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("button", { name: /Close|Fermer/i }));

    fireEvent.click(screen.getAllByRole("button", { name: "Créer un post" })[0]);
    expect(screen.getByRole("dialog", { name: "Créer une publication" })).toBeInTheDocument();
  });

  it("discards old composer requests when the dashboard changes its managed restaurant", () => {
    const restaurant: OwnedRestaurant = {
      id: "managed-1", name: "Première table", disabled_dashboard_features: [],
      is_active: true, is_demo: false, status: "approved",
    };
    const managedFeed = (current: OwnedRestaurant) => <MemoryRouter><ActualitesFeed dashboard managedRestaurant={current} /></MemoryRouter>;
    const view = render(managedFeed(restaurant));
    fireEvent.click(screen.getAllByRole("button", { name: "Créer un post" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Fermer la publication" }));

    view.rerender(managedFeed({ ...restaurant, id: "managed-2", name: "Deuxième table" }));
    expect(screen.getByTestId("social-composer")).toHaveTextContent("managed-2 Deuxième table");
    expect(screen.queryByRole("dialog", { name: "Créer une publication" })).not.toBeInTheDocument();
    view.rerender(managedFeed(restaurant));
    expect(screen.queryByRole("dialog", { name: "Créer une publication" })).not.toBeInTheDocument();
  });

});
