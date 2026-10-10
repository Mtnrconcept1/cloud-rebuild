import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Recherche from "@/pages/Recherche";

const state = vi.hoisted(() => ({ error: false, nextError: false, loading: false, refetch: vi.fn(), next: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({}) }));
vi.mock("@/lib/featureFlags", () => ({ useActiveFeatures: () => new Set() }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/components/CampaignBanner", () => ({ default: () => null }));
vi.mock("@/components/RestaurantCard", () => ({ default: ({ name }: { name: string }) => <article>{name}</article> }));
vi.mock("@/components/CityAutocomplete", () => ({ default: () => <input aria-label="Ville" /> }));
vi.mock("@/lib/analytics", () => ({ trackSearch: vi.fn(), getActiveSponsoredRestaurants: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
  useInfiniteQuery: () => ({ data: state.error && !state.nextError ? undefined : { pages: [{ items: state.nextError ? [{ id: "1", name: "Chez TOK" }] : [], totalCount: state.nextError ? 2 : 0 }] }, isLoading: state.loading, isError: state.error, isFetchNextPageError: state.nextError, refetch: state.refetch, fetchNextPage: state.next, hasNextPage: state.nextError, isFetchingNextPage: false, isFetching: false }),
}));
function LocationProbe() { const l = useLocation(); return <output data-testid="url">{l.search}</output>; }
function setup(url = "/recherche") { render(<MemoryRouter initialEntries={[url]}><Recherche /><LocationProbe /></MemoryRouter>); }
afterEach(() => { cleanup(); state.error = false; state.nextError = false; state.loading = false; vi.clearAllMocks(); });
describe("restaurant search recovery and URL criteria", () => {
  it("keeps city and sort when submitting a trimmed search", () => {
    setup("/recherche?city=Lausanne&sort=prix&order=asc");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  ramen & sushi  " } });
    fireEvent.submit(screen.getByRole("search"));
    const params = new URLSearchParams(screen.getByTestId("url").textContent!);
    expect(params.get("q")).toBe("ramen & sushi"); expect(params.get("city")).toBe("Lausanne"); expect(params.get("order")).toBe("asc");
  });
  it("shows recovery instead of a false empty state and keeps criteria", () => {
    state.error = true; setup("/recherche?q=sushi&city=Genève");
    expect(screen.getByRole("alert")).toHaveTextContent("momentanément indisponible");
    expect(screen.queryByText("Aucun restaurant ne correspond à ces critères")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer", exact: true })); expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("searchbox")).toHaveValue("sushi");
  });
  it("reveals filters on demand and resets the URL and query together", () => {
    setup("/recherche?q=sushi&city=Genève");
    const button = screen.getByRole("button", { name: /Affiner la recherche/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button); expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Ordre de tri" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Effacer tout/ }));
    expect(screen.getByTestId("url")).toHaveTextContent(""); expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("retains loaded cards and provides explicit pagination retry", () => {
    state.error = true; state.nextError = true; setup();
    expect(screen.getByText("Chez TOK")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("suivantes");
    fireEvent.click(screen.getByRole("button", { name: /Charger les/ })); expect(state.next).toHaveBeenCalledTimes(1);
  });
});
