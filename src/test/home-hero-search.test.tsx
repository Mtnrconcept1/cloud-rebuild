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
  it("shares an edge-to-edge immersive hero between the seasonal and regular home", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/home/HeroSection.css"), "utf8");
    expect(css).toContain("Shared TOK immersive hero");
    expect(css).toContain(":root .tok-home-hero {");
    expect(css).toContain("max-width: none;");
    expect(css).toContain("object-fit: cover;");
    expect(css).toContain("min-height: max(740px");
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
  });

  it("uses a text-free Geneva photograph and its portrait version when no location is known", () => {
    setup();
    expect(document.querySelectorAll(".tok-home-hero__background img")).toHaveLength(1);
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute(
      "src",
      "/images/home/tok-editorial-geneva-desktop.webp",
    );
    expect(document.querySelector(".tok-home-hero__background source")).toHaveAttribute(
      "srcset",
      "/images/home/tok-editorial-geneva-mobile.webp",
    );
  });

  it("uses the shield-free Geneva portrait for Geneva communes without changing their desktop selection", () => {
    render(<MemoryRouter><HeroSection profileCity="Puplinge" /></MemoryRouter>);
    expect(document.querySelector(".tok-home-hero__background source")).toHaveAttribute(
      "srcset", "/images/home/tok-editorial-geneva-mobile.webp",
    );
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "GE");
  });

  it("prioritizes shield-free mobile art when Geneva is matched as a city", () => {
    render(<MemoryRouter><HeroSection profileCity="Genève" /></MemoryRouter>);
    expect(document.querySelector(".tok-home-hero__background source")).toHaveAttribute(
      "srcset", "/images/home/tok-editorial-geneva-mobile.webp",
    );
  });

  it("prioritizes the Geneva mobile portrait for a GPS-only city", () => {
    render(<MemoryRouter><HeroSection gpsCity="Genève" gpsCountry="Suisse" /></MemoryRouter>);
    expect(document.querySelector(".tok-home-hero__background source")).toHaveAttribute(
      "srcset", "/images/home/tok-editorial-geneva-mobile.webp",
    );
  });

  it("recreates the editorial white homepage with clear customer and restaurateur actions", () => {
    setup(new Set(["ventes-flash", "anti-gaspi", "chefs-table"]));
    expect(screen.getByRole("heading", { level: 1, name: /RÉSERVEZ ET COMMANDEZ/i })).toBeVisible();
    expect(screen.getByText(/LES MEILLEURES OFFRES FOOD/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Je veux manger/i })).toHaveAttribute("href", "/recherche");
    expect(screen.getByRole("link", { name: /Restaurateur/i })).toHaveAttribute("href", "/restaurateurs/geneve");
    expect(screen.getByRole("link", { name: /Miamz solidaires/i })).toHaveAttribute("href", "/miamz-solidaires");
    expect(screen.getByText(/Moins de frais/i)).toBeVisible();
    expect(screen.getByText(/Une communauté/i)).toBeVisible();
  });

  it("lets the visitor focus and change the suggested city", () => {
    setup();
    const city = screen.getByRole("combobox", { name: /Où/ });
    fireEvent.click(screen.getByRole("button", { name: "Changer de ville" }));
    expect(city).toHaveFocus();
  });

  it("preserves the independent Halloween desktop and mobile imagery", () => {
    setup(new Set(["seasonal-halloween-2026"]));
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute(
      "src", "/images/seasonal/halloween/hero-desktop.webp",
    );
    expect(document.querySelector(".tok-home-hero__background source")).toHaveAttribute(
      "srcset", "/images/seasonal/halloween/hero-mobile-20261030.webp",
    );
  });
  it("renders the correct canton art for device localization on desktop and mobile", () => {
    render(<MemoryRouter><HeroSection locationCanton="JU" /></MemoryRouter>);
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "JU");
    expect(document.querySelectorAll(".tok-home-hero__background img")).toHaveLength(1);
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/desig%20app/tok-ch-ju.webp");
  });
  it("lets the entered city override automatic device localization", () => {
    render(<MemoryRouter><HeroSection locationCanton="GE" /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: /Où/ }), { target: { value: "Lausanne" } });
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "VD");
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/desig%20app/tok-ch-vd.webp");
    fireEvent.change(screen.getByRole("combobox", { name: /Où/ }), { target: { value: "Paris" } });
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "default");
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/images/locations/Europe/France/paris/tok-paris-desktop.webp");
  });
  it("uses the known profile city without requesting geolocation", () => {
    render(<MemoryRouter><HeroSection profileCity="Lugano" /></MemoryRouter>);
    expect(screen.getByRole("combobox", { name: /Où/ })).toHaveValue("Lugano");
    expect(document.querySelector(".tok-home-hero")).toHaveAttribute("data-home-canton", "TI");
  });
  it("fills the location from a profile loaded after the hero and submits it", () => {
    const view = render(
      <MemoryRouter>
        <HeroSection profileCityPending />
        <LocationProbe />
      </MemoryRouter>,
    );
    view.rerender(
      <MemoryRouter>
        <HeroSection profileCity="Neuchâtel" />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByRole("combobox", { name: /Où/ })).toHaveValue("Neuchâtel");
    fireEvent.submit(screen.getByRole("search"));
    const result = new URL(screen.getByTestId("location").textContent!, "https://www.thetok.ch");
    expect(result.searchParams.get("city")).toBe("Neuchâtel");
  });
  it("does not replace a location entered before the profile finishes loading", () => {
    const view = render(<MemoryRouter><HeroSection profileCityPending /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: /Où/ }), { target: { value: "Lausanne" } });
    view.rerender(<MemoryRouter><HeroSection profileCity="Lugano" /></MemoryRouter>);
    expect(screen.getByRole("combobox", { name: /Où/ })).toHaveValue("Lausanne");
  });
  it("does not expose inactive offer shortcuts as part of the reference hero", () => {
    setup();
    expect(screen.queryByRole("link", { name: "Ventes flash" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Je veux manger/i })).toHaveAttribute("href", "/recherche");
  });
  it("shows one readable headline and a labeled field immediately, even before animation", () => {
    setup();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: /RÉSERVEZ ET COMMANDEZ/i })).not.toHaveClass("sr-only");
    expect(screen.getByRole("searchbox", { name: "Restaurant ou cuisine" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Restaurateur/ })).toHaveAttribute("href", "/restaurateurs/geneve");
    expect(screen.getByRole("link", { name: /Miamz solidaires/ })).toHaveAttribute("href", "/miamz-solidaires");
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
    fireEvent.change(screen.getByRole("combobox", { name: /Où/ }), { target: { value: "  Lausanne  " } });
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
