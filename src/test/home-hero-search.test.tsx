import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import HeroSection from "@/components/home/HeroSection";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
afterEach(cleanup);
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
    expect(result.searchParams.get("city")).toBe("Genève");
  });
  it.each(["Rechercher", "Je veux manger"])("opens Geneva discovery with %s and no query", (name) => {
    setup();
    fireEvent.click(screen.getByRole("button", { name, exact: true }));
    const result = new URL(screen.getByTestId("location").textContent!, "https://www.thetok.ch");
    expect(result.pathname).toBe("/recherche");
    expect(result.searchParams.has("q")).toBe(false);
    expect(result.searchParams.get("city")).toBe("Genève");
  });
});
