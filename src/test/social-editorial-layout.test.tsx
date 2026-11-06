import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SocialEditorialLayout from "@/components/social/SocialEditorialLayout";
import type { SocialFeedPost } from "@/lib/socialFeed";

vi.mock("@/components/notifications/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/hooks/useTokLogo", () => ({ useTokLogoSrc: () => "/images/home/tok-logo-ui.webp" }));

const makePost = (id: string, ctaType: "none" | "reserve", city = "Genève") => ({
  id: `post-${id}`,
  restaurantId: id,
  ctaType,
  media: [],
  restaurant: { id, name: `Restaurant ${id}`, city },
}) as SocialFeedPost;

function renderLayout(suggestions: SocialFeedPost[], stories: SocialFeedPost[] = [], city = "Genève") {
  render(<MemoryRouter><SocialEditorialLayout
    scope="for_you" onScopeChange={vi.fn()} search="" onSearchChange={vi.fn()}
    city={city} cities={[city]} onCityChange={vi.fn()}
    onReels={vi.fn()} onCreate={vi.fn()} suggestions={suggestions}
    stories={stories} onFollow={vi.fn()}
  ><p>Publications</p></SocialEditorialLayout></MemoryRouter>);
}

describe("editorial booking discovery", () => {
  it("keeps discovery available when no post offers reservations", () => {
    renderLayout([makePost("cafe", "none")]);
    expect(screen.getByRole("link", { name: "Trouver un restaurant" })).toHaveAttribute("href", "/recherche?city=Gen%C3%A8ve");
    expect(screen.queryByRole("group", { name: "Heure de réservation souhaitée" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voir les disponibilités" })).not.toBeInTheDocument();
  });

  it("opens the selected time for a restaurant whose post offers reservations", () => {
    renderLayout([makePost("cafe", "none")], [makePost("table", "reserve")]);
    fireEvent.click(screen.getByRole("button", { name: "19 h 30" }));
    const href = screen.getByRole("link", { name: "Voir les disponibilités" }).getAttribute("href")!;
    const url = new URL(href, "https://www.thetok.ch");
    expect(url.pathname).toBe("/restaurant/table");
    expect(url.searchParams.get("reserve")).toBe("true");
    expect(url.searchParams.get("time")).toBe("19:30");
    expect(url.searchParams.get("party_size")).toBe("2");
    expect(url.searchParams.get("date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps the selected city when only stories from another city offer reservations", () => {
    renderLayout([makePost("cafe", "none", "Vernier")], [makePost("table", "reserve", "Genève")], "Vernier");
    expect(screen.getByRole("link", { name: "Trouver un restaurant" })).toHaveAttribute("href", "/recherche?city=Vernier");
    expect(screen.queryByRole("link", { name: "Voir les disponibilités" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Heure de réservation souhaitée" })).not.toBeInTheDocument();
  });

  it("skips suggestions and stories outside the selected city before choosing a matching reservation", () => {
    renderLayout(
      [makePost("vernier", "reserve", "Vernier")],
      [makePost("carouge", "reserve", "Carouge"), makePost("geneve", "reserve", "GENEVE")],
      "Genève",
    );
    const href = screen.getByRole("link", { name: "Voir les disponibilités" }).getAttribute("href")!;
    expect(new URL(href, "https://www.thetok.ch").pathname).toBe("/restaurant/geneve");
  });
});
