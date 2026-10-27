import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectedId: "restaurant-a" as string | null,
  ownerLoading: false,
  ownerError: null as string | null,
  setSelectedId: vi.fn(),
  loadRestaurant: vi.fn(),
  loadCuisineOptions: vi.fn(),
  loadCuisineLinks: vi.fn(),
  rpc: vi.fn(),
  insertRestaurant: vi.fn(),
  updateRestaurant: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "restaurants") {
        return {
          select: () => ({ eq: (_column: string, id: string) => ({ single: () => mocks.loadRestaurant(id) }) }),
          insert: (payload: unknown) => ({ select: () => ({ single: () => mocks.insertRestaurant(payload) }) }),
          update: (payload: unknown) => ({ eq: (_column: string, id: string) => mocks.updateRestaurant(id, payload) }),
        };
      }
      if (table === "cuisines") return { select: () => ({ order: () => mocks.loadCuisineOptions() }) };
      if (table === "restaurant_cuisines") return { select: () => ({ eq: (_column: string, id: string) => mocks.loadCuisineLinks(id) }) };
      const query = {
        select: () => query,
        eq: () => query,
        lte: () => query,
        gte: () => query,
        order: () => query,
        limit: () => Promise.resolve({ data: [], error: null }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/pages/dashboard/useDashboardRestaurant", () => ({
  useDashboardRestaurant: () => ({ selectedId: mocks.selectedId, setSelectedId: mocks.setSelectedId, loading: mocks.ownerLoading, error: mocks.ownerError }),
}));
vi.mock("@/lib/featureFlags", () => ({ useActiveFeatures: () => new Set(["reservation", "emporter", "sur-place"]) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/dashboard/DashboardPageHero", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/contracts/RestaurantPartnerContractCard", () => ({ default: () => null }));
vi.mock("@/components/ImageUpload", () => ({ default: () => null }));
vi.mock("@/components/AddressAutocomplete", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import DashboardRestaurant from "@/pages/dashboard/DashboardRestaurant";

function restaurant(id: string, name: string) {
  return { id, name, address: "Rue du Marché 1", city: "Genève", amenities: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = () => <QueryClientProvider client={client}><DashboardRestaurant /></QueryClientProvider>;
  return { ...render(page()), rerenderPage: page, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectedId = "restaurant-a";
  mocks.ownerLoading = false;
  mocks.ownerError = null;
  mocks.insertRestaurant.mockResolvedValue({ data: { id: "created-restaurant" }, error: null });
  mocks.updateRestaurant.mockResolvedValue({ error: null });
  mocks.loadCuisineOptions.mockResolvedValue({ data: [], error: null });
  mocks.loadCuisineLinks.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

afterEach(cleanup);

describe("restaurant profile loading and save scope", () => {
  it("waits for an existing profile before allowing a save", async () => {
    const request = deferred<{ data: ReturnType<typeof restaurant>; error: null }>();
    mocks.loadRestaurant.mockReturnValue(request.promise);
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Chargement du restaurant");
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Créer mon restaurant" })).not.toBeInTheDocument();
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();

    await act(async () => { request.resolve({ data: restaurant("restaurant-a", "Café Nord"), error: null }); });
    expect(await screen.findByDisplayValue("Café Nord")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sauvegarder" }));
    await waitFor(() => expect(mocks.updateRestaurant).toHaveBeenCalledWith("restaurant-a", expect.objectContaining({ name: "Café Nord" })));
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();
  });

  it("offers retry after a failed profile request without entering creation", async () => {
    mocks.loadRestaurant.mockResolvedValueOnce({ data: null, error: new Error("Network unavailable") });
    mocks.loadRestaurant.mockResolvedValue({ data: restaurant("restaurant-a", "Café Nord"), error: null });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Le restaurant n’a pas pu être chargé");
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Créer mon restaurant" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByDisplayValue("Café Nord")).toBeInTheDocument();
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();
  });

  it("hides the previous form while switching and saves only the newly selected profile", async () => {
    const secondRequest = deferred<{ data: ReturnType<typeof restaurant>; error: null }>();
    mocks.loadRestaurant.mockImplementation((id: string) => id === "restaurant-a"
      ? Promise.resolve({ data: restaurant(id, "Café Nord"), error: null })
      : secondRequest.promise);
    const view = renderPage();
    expect(await screen.findByDisplayValue("Café Nord")).toBeInTheDocument();

    mocks.selectedId = "restaurant-b";
    view.rerender(view.rerenderPage());
    expect(screen.getByRole("status")).toHaveTextContent("Chargement du restaurant");
    expect(screen.queryByDisplayValue("Café Nord")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();

    await act(async () => { secondRequest.resolve({ data: restaurant("restaurant-b", "Bistro Sud"), error: null }); });
    expect(await screen.findByDisplayValue("Bistro Sud")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sauvegarder" }));
    await waitFor(() => expect(mocks.updateRestaurant).toHaveBeenCalledWith("restaurant-b", expect.objectContaining({ name: "Bistro Sud" })));
    expect(mocks.updateRestaurant).not.toHaveBeenCalledWith("restaurant-a", expect.anything());
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();
  });

  it("rejects profile data that does not match the selected restaurant", async () => {
    mocks.loadRestaurant.mockResolvedValue({ data: restaurant("restaurant-other", "Autre restaurant"), error: null });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Le restaurant n’a pas pu être chargé");
    expect(screen.queryByDisplayValue("Autre restaurant")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();
    expect(mocks.updateRestaurant).not.toHaveBeenCalled();
  });

  it("waits for structured cuisine links and preserves them instead of inferring legacy categories", async () => {
    const frenchId = "11111111-1111-4111-8111-111111111111";
    const japaneseId = "22222222-2222-4222-8222-222222222222";
    const options = deferred<{ data: { id: string; name: string }[]; error: null }>();
    const links = deferred<{ data: { cuisine_id: string }[]; error: null }>();
    mocks.loadRestaurant.mockResolvedValue({ data: { ...restaurant("restaurant-a", "Café Nord"), cuisine_type: "Français" }, error: null });
    mocks.loadCuisineOptions.mockReturnValue(options.promise);
    mocks.loadCuisineLinks.mockReturnValue(links.promise);
    const { client } = renderPage();

    await waitFor(() => expect(client.getQueryState(["my-restaurant", "restaurant-a"])?.status).toBe("success"));
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    expect(mocks.updateRestaurant).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();

    await act(async () => { options.resolve({ data: [{ id: frenchId, name: "Français" }, { id: japaneseId, name: "Japonais" }], error: null }); });
    await waitFor(() => expect(client.getQueryState(["restaurant-cuisine-options"])?.status).toBe("success"));
    expect(screen.getByRole("status")).toHaveTextContent("Chargement des catégories");
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();

    await act(async () => { links.resolve({ data: [{ cuisine_id: japaneseId }], error: null }); });
    expect(await screen.findByDisplayValue("Café Nord")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sauvegarder" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("restaurant_set_cuisines", {
      p_restaurant_id: "restaurant-a",
      p_cuisine_ids: [japaneseId],
    }));
    expect(mocks.updateRestaurant).toHaveBeenCalledWith("restaurant-a", expect.objectContaining({ cuisine_type: "Japonais" }));
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();
  });

  it("blocks saving after cuisine links fail and retries before restoring the form", async () => {
    const options = deferred<{ data: never[]; error: null }>();
    mocks.loadRestaurant.mockResolvedValue({ data: restaurant("restaurant-a", "Café Nord"), error: null });
    mocks.loadCuisineOptions.mockReturnValue(options.promise);
    mocks.loadCuisineLinks.mockResolvedValueOnce({ data: null, error: new Error("Links unavailable") });
    mocks.loadCuisineLinks.mockResolvedValue({ data: [], error: null });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Les catégories du restaurant n’ont pas pu être chargées");
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    expect(mocks.updateRestaurant).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await act(async () => { options.resolve({ data: [], error: null }); });
    expect(await screen.findByDisplayValue("Café Nord")).toBeInTheDocument();
    expect(mocks.loadCuisineLinks).toHaveBeenCalledTimes(2);
  });

  it("blocks saving after cuisine options fail and retries their reference query", async () => {
    mocks.loadRestaurant.mockResolvedValue({ data: restaurant("restaurant-a", "Café Nord"), error: null });
    mocks.loadCuisineOptions.mockResolvedValueOnce({ data: null, error: new Error("Options unavailable") });
    mocks.loadCuisineOptions.mockResolvedValue({ data: [], error: null });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Les catégories du restaurant n’ont pas pu être chargées");
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    expect(mocks.updateRestaurant).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByDisplayValue("Café Nord")).toBeInTheDocument();
    expect(mocks.loadCuisineOptions).toHaveBeenCalledTimes(2);
  });

  it("does not treat an unavailable owner list as an empty list and retries it", async () => {
    mocks.selectedId = null;
    mocks.ownerError = "Owner list unavailable";
    const view = renderPage();
    const retry = vi.spyOn(view.client, "invalidateQueries");

    expect(screen.getByRole("alert")).toHaveTextContent("La liste de vos restaurants n’a pas pu être chargée");
    expect(screen.queryByRole("heading", { name: "Créer mon restaurant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(retry).toHaveBeenCalledWith({ queryKey: ["owner-restaurants"] });
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();

    mocks.ownerError = null;
    view.rerender(view.rerenderPage());
    expect(screen.getByRole("heading", { name: "Créer mon restaurant" })).toBeInTheDocument();
  });

  it("waits for the owner list before deciding whether to create a restaurant", () => {
    mocks.selectedId = null;
    mocks.ownerLoading = true;
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Chargement de vos restaurants");
    expect(screen.queryByRole("heading", { name: "Créer mon restaurant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sauvegarder" })).not.toBeInTheDocument();
    expect(mocks.insertRestaurant).not.toHaveBeenCalled();
  });

  it("keeps initial restaurant creation available when no restaurant is selected", async () => {
    mocks.selectedId = null;
    mocks.loadCuisineOptions.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole("heading", { name: "Créer mon restaurant" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sauvegarder" }));
    await waitFor(() => expect(mocks.insertRestaurant).toHaveBeenCalledWith(expect.objectContaining({ owner_id: "owner-1", status: "pending", is_active: false })));
    expect(mocks.setSelectedId).toHaveBeenCalledWith("created-restaurant");
    expect(mocks.updateRestaurant).not.toHaveBeenCalled();
  });
});
