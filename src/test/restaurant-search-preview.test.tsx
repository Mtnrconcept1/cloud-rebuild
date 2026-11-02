import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Recherche from "@/pages/Recherche";

const state = vi.hoisted(() => ({
  error: false,
  nextError: false,
  loading: false,
  profileCity: null as string | null,
  user: null as { id: string } | null,
  activeFeatures: [] as string[],
  sponsoredCampaigns: [] as { id: string; restaurants: { id: string; name: string; rating: number } }[],
  items: [] as Array<Record<string, unknown>>,
  offerSignals: {
    promotion: new Set<string>(),
    flash: new Set<string>(),
    anti_waste: new Set<string>(),
    tok_dor: new Set<string>(),
    failedSources: [] as string[],
  },
  offerSignalsLoading: false,
  offerSignalsError: false,
  searchQueryFn: null as ((context: { pageParam: number }) => Promise<unknown>) | null,
  rpc: vi.fn().mockResolvedValue({ data: { items: [], total_count: 0, next_offset: null }, error: null }),
  refetch: vi.fn(),
  next: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/featureFlags", () => ({ useActiveFeatures: () => new Set(state.activeFeatures) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/components/CampaignBanner", () => ({ default: () => null }));
vi.mock("@/components/RestaurantCard", () => ({ default: ({ id, name }: { id: string; name: string }) => <article data-testid={`restaurant-card-${id}`}>{name}</article> }));
vi.mock("@/components/NearbyRestaurantsMap", () => ({
  default: ({ restaurants }: { restaurants: Array<{ id: string }> }) => (
    <div role="region" aria-label="Carte des restaurants test">{restaurants.length} restaurants cartographiés</div>
  ),
}));
vi.mock("@/components/CityAutocomplete", () => ({
  default: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => (
    <input aria-label="Ville" value={value} onChange={(event) => onValueChange(event.target.value)} />
  ),
}));
vi.mock("@/lib/analytics", () => ({ trackSearch: vi.fn(), getActiveSponsoredRestaurants: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "search-profile-city"
      ? state.profileCity
      : queryKey[0] === "sponsored-search"
        ? state.sponsoredCampaigns
        : queryKey[0] === "search-offer-signals"
          ? state.offerSignals
          : [],
    isLoading: queryKey[0] === "search-offer-signals" ? state.offerSignalsLoading : false,
    isError: queryKey[0] === "search-offer-signals" ? state.offerSignalsError : false,
  }),
  useInfiniteQuery: ({ queryFn }: { queryFn: NonNullable<typeof state.searchQueryFn> }) => {
    state.searchQueryFn = queryFn;
    const items = state.nextError ? [{ id: "1", name: "Chez TOK" }] : state.items;
    return { data: state.error && !state.nextError ? undefined : { pages: [{ items, totalCount: state.nextError ? 2 : items.length }] }, isLoading: state.loading, isError: state.error, isFetchNextPageError: state.nextError, refetch: state.refetch, fetchNextPage: state.next, hasNextPage: state.nextError, isFetchingNextPage: false, isFetching: false };
  },
}));
function LocationProbe() { const l = useLocation(); return <output data-testid="url">{l.search}</output>; }
function setup(url = "/recherche") { render(<MemoryRouter initialEntries={[url]}><Recherche /><LocationProbe /></MemoryRouter>); }
afterEach(() => {
  cleanup();
  state.error = false;
  state.nextError = false;
  state.loading = false;
  state.profileCity = null;
  state.user = null;
  state.activeFeatures = [];
  state.sponsoredCampaigns = [];
  state.items = [];
  state.offerSignals = {
    promotion: new Set<string>(),
    flash: new Set<string>(),
    anti_waste: new Set<string>(),
    tok_dor: new Set<string>(),
    failedSources: [],
  };
  state.offerSignalsLoading = false;
  state.offerSignalsError = false;
  state.searchQueryFn = null;
  vi.clearAllMocks();
});
describe("restaurant search recovery and URL criteria", () => {
  it.each([7, 8, 9])("passes the selected %s/10 minimum rating to the catalog", async (rating) => {
    setup(`/recherche?rating=${rating}`);
    await state.searchQueryFn!({ pageParam: 0 });
    expect(state.rpc).toHaveBeenCalledWith("search_restaurants_catalog_page", expect.objectContaining({
      p_min_rating: rating,
    }));
  });
  it("applies the same /10 minimum to sponsored restaurants, including the boundary", () => {
    state.activeFeatures = ["campagnes-pub"];
    state.sponsoredCampaigns = [
      { id: "below", restaurants: { id: "restaurant-below", name: "Sous le seuil", rating: 8.9 } },
      { id: "boundary", restaurants: { id: "restaurant-boundary", name: "Au seuil", rating: 9 } },
    ];
    setup("/recherche?rating=9");
    expect(screen.queryByText("Sous le seuil")).not.toBeInTheDocument();
    expect(screen.getByText("Au seuil")).toBeVisible();
  });
  it("keeps city and sort when submitting a trimmed search", () => {
    setup("/recherche?city=Lausanne&sort=prix&order=asc");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  ramen & sushi  " } });
    fireEvent.submit(screen.getByRole("search"));
    const params = new URLSearchParams(screen.getByTestId("url").textContent!);
    expect(params.get("q")).toBe("ramen & sushi"); expect(params.get("city")).toBe("Lausanne"); expect(params.get("order")).toBe("asc");
  });
  it("uses the signed-in client's profile city when the URL has no location", () => {
    state.user = { id: "client-1" };
    state.profileCity = "Neuchâtel";
    setup();
    const params = new URLSearchParams(screen.getByTestId("url").textContent!);
    expect(params.get("city")).toBe("Neuchâtel");
  });
  it("keeps an explicit URL location instead of replacing it with the profile city", () => {
    state.user = { id: "client-1" };
    state.profileCity = "Neuchâtel";
    setup("/recherche?city=Lausanne");
    fireEvent.click(screen.getByRole("button", { name: /Affiner la recherche/ }));
    expect(screen.getByRole("textbox", { name: "Ville" })).toHaveValue("Lausanne");
    const params = new URLSearchParams(screen.getByTestId("url").textContent!);
    expect(params.get("city")).toBe("Lausanne");
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
  it("filters cards and the map from an offer chip while keeping the criterion in the URL", () => {
    state.items = [
      { id: "flash", name: "Flash TOK", latitude: 46.2, longitude: 6.14 },
      { id: "regular", name: "Adresse classique", latitude: 46.21, longitude: 6.15 },
    ];
    state.offerSignals.flash = new Set(["flash"]);
    setup();

    expect(screen.getByText("Flash TOK")).toBeVisible();
    expect(screen.getByText("Adresse classique")).toBeVisible();
    expect(screen.getByRole("region", { name: "Carte des restaurants test" })).toHaveTextContent("2 restaurants");

    fireEvent.click(screen.getByRole("button", { name: /Ventes flash/ }));

    expect(screen.getByTestId("url")).toHaveTextContent("offer=flash");
    expect(screen.getByText("Flash TOK")).toBeVisible();
    expect(screen.queryByText("Adresse classique")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Carte des restaurants test" })).toHaveTextContent("1 restaurants");
  });
  it("keeps the general list visible when the selected offer source is unavailable", () => {
    state.items = [
      { id: "first", name: "Première adresse", latitude: 46.2, longitude: 6.14 },
      { id: "second", name: "Deuxième adresse", latitude: 46.21, longitude: 6.15 },
    ];
    state.offerSignalsError = true;
    setup("/recherche?offer=flash");

    expect(screen.getByText("Première adresse")).toBeVisible();
    expect(screen.getByText("Deuxième adresse")).toBeVisible();
    expect(screen.getByText(/La liste générale reste affichée/)).toBeVisible();
    expect(screen.getByRole("region", { name: "Carte des restaurants test" })).toHaveTextContent("2 restaurants");
  });
  it("exposes a mobile map toggle without hiding the desktop map from assistive technologies", () => {
    state.items = [{ id: "mapped", name: "Adresse cartographiée", latitude: 46.2, longitude: 6.14 }];
    setup();

    const toggle = screen.getByRole("button", { name: "Afficher la carte" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Masquer la carte" })).toHaveAttribute("aria-expanded", "true");
  });
});
