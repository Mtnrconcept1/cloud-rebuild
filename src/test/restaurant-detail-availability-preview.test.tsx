import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RestaurantDetail from "@/pages/RestaurantDetail";
const state = vi.hoisted(() => ({ directory: true, restaurantError: false, menuError: false, retry: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({}) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({ addItem: vi.fn(), setOrderMode: vi.fn(), orderMode: "delivery", items: [] }) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlagSnapshot: () => ({ activeFeatures: new Set(), loading: false }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/hooks/useSeoMeta", () => ({ useSeoMeta: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), trackImpression: vi.fn() }));
vi.mock("@/components/MenuItemCard", () => ({ default: () => null }));
vi.mock("@/components/ReviewForm", () => ({ default: () => null }));
vi.mock("@/components/ReservationDialog", () => ({ default: () => null }));
vi.mock("@/components/ReservationWidget", () => ({ default: () => null }));
vi.mock("@/components/AntiWasteCard", () => ({ default: () => null }));
vi.mock("@/components/restaurant/RestaurantDailyDishCard", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "restaurant" ? state.restaurantError ? null : { id: "r1", name: "Chez TOK", city: "Genève", is_directory_listing: state.directory } : queryKey[0] === "favorite" ? false : [], isFetched: true, isPending: false, isError: queryKey[0] === "restaurant" ? state.restaurantError : queryKey[0] === "menu-items" && state.menuError, refetch: state.retry }) }));
afterEach(() => { cleanup(); state.directory = true; state.restaurantError = false; state.menuError = false; vi.clearAllMocks(); });
const mount = () => render(<MemoryRouter><RestaurantDetail resolvedRestaurantId="r1" /></MemoryRouter>);
describe("restaurant public availability", () => {
 it("prioritizes practical information for an indexed venue without advertising unavailable services", () => {
  mount(); expect(screen.getByRole("tab", { name: "À propos" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByText("Services disponibles")).not.toBeInTheDocument(); expect(screen.queryByText("Connexion rapide")).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Menu" }), { button: 0, ctrlKey: false });
  expect(screen.getByText("Menu non renseigné")).toBeVisible();
 });
 it("distinguishes a connection error from a missing restaurant and allows retry", () => {
  state.restaurantError = true; mount(); expect(screen.queryByText("Restaurant introuvable")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" })); expect(state.retry).toHaveBeenCalledOnce();
 });
 it("keeps menu failure distinct from empty content", () => {
  state.directory = false; state.menuError = true; mount(); expect(screen.getByRole("alert")).toHaveTextContent("Le menu n’a pas pu être chargé.");
  expect(screen.queryByText("Menu non renseigné")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Réessayer" })); expect(state.retry).toHaveBeenCalledOnce();
 });
});
