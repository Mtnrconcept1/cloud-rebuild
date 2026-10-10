import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeroSection from "@/components/home/HeroSection";

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authState,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
afterEach(() => {
  authState.user = null;
  cleanup();
});
function setup() {
  render(<MemoryRouter><HeroSection contentVisible={false} /><LocationProbe /></MemoryRouter>);
}
describe("homepage semantic search", () => {
  it("shows one readable headline and a labeled field immediately, even before animation", () => {
    setup();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("sr-only");
    expect(screen.getByRole("searchbox", { name: "Cuisine, nom de restaurant ou quartier" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Restaurateur/ })).toHaveAttribute("href", "/restaurateurs/geneve");
  });
  it("submits a trimmed and safely encoded query through the search form", () => {
    setup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  sushi & ramen  " } });
    fireEvent.submit(screen.getByRole("search"));
    const result = new URL(screen.getByTestId("location").textContent!, "https://www.thetok.ch");
    expect(result.pathname).toBe("/recherche");
    expect(result.searchParams.get("q")).toBe("sushi & ramen");
    expect(result.searchParams.has("city")).toBe(false);
  });
  it("opens discovery without imposing a city or a query", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher", exact: true }));
    expect(screen.getByTestId("location")).toHaveTextContent("/recherche");
    const result = new URL(screen.getByTestId("location").textContent!, "https://www.thetok.ch");
    expect(result.search).toBe("");
  });
  it("submits the city explicitly entered by the visitor", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: /Où/ }), { target: { value: "  Lausanne  " } });
    fireEvent.submit(screen.getByRole("search"));
    const result = new URL(screen.getByTestId("location").textContent!, "https://www.thetok.ch");
    expect(result.searchParams.get("city")).toBe("Lausanne");
    expect(result.searchParams.has("q")).toBe(false);
  });
  it("keeps discovery accessible for signed-in visitors", () => {
    authState.user = { id: "user-1" };
    setup();
    expect(screen.getByRole("search")).toBeVisible();
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-authenticated", "true");
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).not.toBeInTheDocument();
  });
});
