import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import LocalRestaurants from "@/pages/LocalRestaurants";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  demoMode: false,
  demoRestaurants: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({ rpc: state.rpc }),
}));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({
  useCommercialDemoFrame: () => state.demoMode
    ? { surface: "client", config: { sessionId: "local-pagination-demo" }, snapshot: {} }
    : null,
}));
vi.mock("@/lib/commercialDemoClientCatalog", () => ({
  getCommercialDemoClientRestaurants: () => state.demoRestaurants,
}));
vi.mock("@/components/RestaurantCard", () => ({
  default: ({ name }: { name: string }) => <article>{name}</article>,
}));
vi.mock("@/pages/RestaurantDetail", () => ({ default: () => null }));
vi.mock("@/pages/NotFound", () => ({ default: () => <p>Page introuvable</p> }));

const clients: QueryClient[] = [];

function restaurants(start: number, count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `restaurant-${start + index + 1}`,
    slug: `restaurant-${start + index + 1}`,
    name: `Restaurant ${start + index + 1}`,
    city: "Genève",
    address: `Rue ${start + index + 1}`,
    cuisine_type: "Suisse",
    supports_reservation: false,
    ...overrides,
  }));
}

function catalogPage(items: ReturnType<typeof restaurants>, nextOffset: unknown, totalCount = items.length) {
  return { data: [{ items, next_offset: nextOffset, total_count: totalCount }], error: null };
}

function setup(url = "/restaurants/geneve") {
  window.history.replaceState(null, "", url);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/restaurants/:city" element={<LocalRestaurants />} />
          <Route path="/restaurants/:city/:category" element={<LocalRestaurants />} />
          <Route path="/restaurants-pres/:venueSlug" element={<LocalRestaurants />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function robots() {
  return document.head.querySelector("meta[name='robots']")?.getAttribute("content");
}

function insertInventorySnapshot(overrides: Record<string, unknown> = {}) {
  const script = document.createElement("script");
  script.id = "tok-local-inventory";
  script.type = "application/json";
  script.textContent = JSON.stringify({
    version: 1,
    path: "/restaurants/geneve",
    pageType: "city",
    inventoryCount: 54,
    parentInventoryCount: null,
    itemListComplete: true,
    policy: { minCityRestaurants: 3, minSpecializedRestaurants: 3, maxParentCoverage: 0.8 },
    indexable: false,
    ...overrides,
  });
  document.head.appendChild(script);
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  document.getElementById("tok-local-inventory")?.remove();
  state.rpc.mockReset();
  state.demoMode = false;
  state.demoRestaurants = [];
  window.history.replaceState(null, "", "/");
});

describe("local restaurant catalog pagination", () => {
  it("loads the 54-result batch and then the remaining restaurants using the server cursor", async () => {
    state.rpc
      .mockResolvedValueOnce(catalogPage(restaurants(0, 54), 54, 70))
      .mockResolvedValueOnce(catalogPage(restaurants(54, 16), null, 70));
    setup();

    const next = await screen.findByRole("button", { name: "Charger plus de restaurants" });
    expect(screen.getAllByRole("article")).toHaveLength(54);
    expect(state.rpc).toHaveBeenNthCalledWith(1, "search_restaurants_catalog_page", expect.objectContaining({
      p_city: "Genève", p_limit: 54, p_offset: 0,
    }));

    fireEvent.click(next);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(70));
    expect(state.rpc).toHaveBeenNthCalledWith(2, "search_restaurants_catalog_page", expect.objectContaining({
      p_limit: 54, p_offset: 54,
    }));
    expect(screen.queryByRole("button", { name: "Charger plus de restaurants" })).not.toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });

  it("honors an explicit terminal cursor even when the last page contains 54 restaurants", async () => {
    state.rpc.mockResolvedValueOnce({
      data: { items: restaurants(0, 54), next_offset: null, total_count: 54 },
      error: null,
    });
    setup();

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(54));
    expect(screen.queryByRole("button", { name: "Charger plus de restaurants" })).not.toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, "invalid", "", true])("rejects an unsafe next cursor %s", async (cursor) => {
    state.rpc.mockResolvedValueOnce(catalogPage(restaurants(0, 54), cursor, 100));
    setup();

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(54));
    expect(screen.queryByRole("button", { name: "Charger plus de restaurants" })).not.toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("stops when a later response repeats the requested offset", async () => {
    state.rpc
      .mockResolvedValueOnce(catalogPage(restaurants(0, 54), 54, 120))
      .mockResolvedValueOnce(catalogPage(restaurants(54, 54), 54, 120));
    setup();

    fireEvent.click(await screen.findByRole("button", { name: "Charger plus de restaurants" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(108));
    expect(screen.queryByRole("button", { name: "Charger plus de restaurants" })).not.toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps pagination available when the intent filter hides every result in the first batch", async () => {
    state.rpc
      .mockResolvedValueOnce(catalogPage(restaurants(0, 54), 54, 57))
      .mockResolvedValueOnce(catalogPage(restaurants(54, 3, { supports_reservation: true }), null, 57));
    setup("/restaurants/geneve/reservation");

    const next = await screen.findByRole("button", { name: "Charger plus de restaurants" });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByText("Aucun restaurant trouvé pour cette page locale.")).not.toBeInTheDocument();
    expect(robots()).toMatch(/^index,/);

    fireEvent.click(next);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect(screen.getByText("Restaurant 55")).toBeVisible();
    expect(robots()).toMatch(/^index,/);
    expect(state.rpc).toHaveBeenNthCalledWith(2, "search_restaurants_catalog_page", expect.objectContaining({ p_offset: 54 }));
  });
});

describe("local listing inventory policy", () => {
  it("preserves a same-route prerender noindex while loading and after a populated response", async () => {
    insertInventorySnapshot();
    let resolveResponse!: (response: ReturnType<typeof catalogPage>) => void;
    state.rpc.mockReturnValueOnce(new Promise<ReturnType<typeof catalogPage>>((resolve) => { resolveResponse = resolve; }));
    setup();

    expect(robots()).toMatch(/^noindex,/);
    await act(async () => { resolveResponse(catalogPage(restaurants(0, 54), null, 54)); });
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(54));
    expect(robots()).toMatch(/^noindex,/);
  });

  it("ignores a prerender snapshot belonging to a different route", async () => {
    insertInventorySnapshot({ path: "/restaurants/lausanne" });
    state.rpc.mockResolvedValueOnce(catalogPage(restaurants(0, 3), null));
    setup();

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect(robots()).toMatch(/^index,/);
  });

  it.each(["/restaurants/geneve", "/restaurants/geneve/africain"])("noindexes terminal inventory below the shared threshold on %s", async (url) => {
    state.rpc.mockResolvedValueOnce(catalogPage(restaurants(0, 2), null));
    setup(url);

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(robots()).toMatch(/^noindex,/);
  });

  it("applies the valid prerender policy to the refreshed terminal inventory", async () => {
    insertInventorySnapshot({
      indexable: true,
      policy: { minCityRestaurants: 5, minSpecializedRestaurants: 3, maxParentCoverage: 0.8 },
    });
    state.rpc.mockResolvedValueOnce(catalogPage(restaurants(0, 4), null));
    setup();

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(4));
    expect(robots()).toMatch(/^noindex,/);
  });

  it("keeps an unavailable catalog out of the index", async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: new Error("catalog unavailable") });
    setup();

    await screen.findByText("La sélection locale est temporairement indisponible.");
    expect(robots()).toMatch(/^noindex,/);
  });

  it("preserves the nearby RPC and its one-restaurant indexability threshold", async () => {
    state.rpc.mockResolvedValueOnce({ data: restaurants(0, 1), error: null });
    setup("/restaurants-pres/le-grutli-geneve?lat=46.201&lng=6.144");

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(state.rpc).toHaveBeenCalledWith("search_restaurants_nearby", expect.objectContaining({
      p_lat: 46.201, p_lng: 6.144, p_limit: 60, p_offset: 0,
    }));
    expect(robots()).toMatch(/^index,/);
  });

  it("renders the commercial demo inventory without requesting production catalog data", async () => {
    state.demoMode = true;
    state.demoRestaurants = restaurants(0, 3);
    setup();

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect(state.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Charger plus de restaurants" })).not.toBeInTheDocument();
  });
});
