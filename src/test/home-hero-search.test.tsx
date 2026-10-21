import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
function setup(activeFeatures?: ReadonlySet<string>) {
  render(<MemoryRouter><HeroSection contentVisible={false} activeFeatures={activeFeatures} /><LocationProbe /></MemoryRouter>);
}
describe("homepage semantic search", () => {
  it("keeps the original mobile photo unstretched and uses a feathered blur into the page background", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/home/HeroSection.css"), "utf8");
    expect(css).toContain(".tok-home-hero__background img{object-fit:cover");
    expect(css).toContain(".tok-home-hero__art::before{");
    expect(css).toContain("backdrop-filter:blur(8px)");
    expect(css).toContain(".tok-home-hero__art::after{");
    expect(css).toContain("var(--tok-home-paper) 100%");
  });

  it("uses a portrait hero asset on mobile and the supplied Léman illustration on desktop", () => {
    setup();
    expect(document.querySelectorAll(".tok-home-hero__background img")).toHaveLength(1);
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/images/home/tok-leman-signature.webp");
  });
  it("renders the correct canton art for device localization on desktop and mobile", () => {
    render(<MemoryRouter><HeroSection locationCanton="JU" /></MemoryRouter>);
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "JU");
    expect(document.querySelectorAll(".tok-home-hero__background img")).toHaveLength(1);
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/desig%20app/tok-ch-ju.webp");
  });
  it("lets the entered city override automatic device localization", () => {
    render(<MemoryRouter><HeroSection locationCanton="GE" /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox", { name: /Où/ }), { target: { value: "Lausanne" } });
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "VD");
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/desig%20app/tok-ch-vd.webp");
    fireEvent.change(screen.getByRole("textbox", { name: /Où/ }), { target: { value: "Paris" } });
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "default");
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/images/locations/Europe/France/paris/tok-paris-desktop.webp");
  });
  it("uses the known profile city without requesting geolocation", () => {
    render(<MemoryRouter><HeroSection profileCity="Lugano" /></MemoryRouter>);
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "TI");
  });
  it("only exposes feature-flagged quick links when the corresponding feature is enabled", () => {
    setup(new Set(["ventes-flash", "chefs-table"]));
    expect(screen.getByRole("link", { name: /Offres/ })).toHaveAttribute("href", "/ventes-flash");
    expect(screen.getByRole("link", { name: /Grandes tables/ })).toHaveAttribute("href", "/chefs-table");
  });
  it("shows one readable headline and a labeled field immediately, even before animation", () => {
    setup();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("sr-only");
    expect(screen.getByRole("searchbox", { name: "Restaurant ou cuisine" })).toBeVisible();
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
