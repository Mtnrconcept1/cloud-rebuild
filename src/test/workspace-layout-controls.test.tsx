import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import DashboardLayout from "@/components/DashboardLayout";
import { DashboardContext, type DashboardContextValue } from "@/pages/dashboard/useDashboardRestaurant";

const state = vi.hoisted(() => ({
  itemCount: 0,
  features: new Set<string>(),
  demo: null as null | { surface: string; snapshot: { active_features: string[] } },
  openHelpChat: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  user: { id: "customer-1", user_metadata: { full_name: "Camille Martin" } },
  role: "client", roles: ["client"], canSwitchRole: false, signOut: vi.fn(),
}) }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({ itemCount: state.itemCount }) }));
vi.mock("@/lib/featureFlags", () => ({ useActiveFeatures: () => state.features }));
vi.mock("@/hooks/useTokLogo", () => ({ useTokLogoSrc: () => "/logo.png" }));
vi.mock("@/hooks/useNotificationCenter", () => ({ useNotificationCenter: () => ({
  unreadNotifications: [], notifications: [], unreadCount: 0, inAppEnabled: true,
  markNotificationRead: vi.fn(), markAllRead: vi.fn(),
}) }));
vi.mock("@/hooks/useRealtimeNotifications", () => ({ useRealtimeNotifications: vi.fn() }));
vi.mock("@/hooks/useTokWorkforce", () => ({ useWorkforceSettings: () => ({ data: { enabled: false } }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => state.demo }));
vi.mock("@/lib/helpChat", () => ({ openHelpChat: state.openHelpChat }));

const dashboard: DashboardContextValue = {
  restaurants: [], selectedId: null, setSelectedId: vi.fn(), loading: false, error: null,
  disabledFeatures: new Set(), dashboardAccessLocked: true,
  onboardingConfigurationUnlocked: false, dashboardAccessLockReason: null, isDemoMode: false,
};
const queryClients: QueryClient[] = [];

function CustomerShell() {
  return (
    <MemoryRouter initialEntries={["/PROFIL/?tab=favoris"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CustomerDashboardLayout><h1>Mes favoris</h1></CustomerDashboardLayout>
    </MemoryRouter>
  );
}

function renderRestaurantShell(overrides: Partial<DashboardContextValue> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/dashboard"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardContext.Provider value={{ ...dashboard, ...overrides }}>
          <DashboardLayout><h1>Restaurant</h1></DashboardLayout>
        </DashboardContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.itemCount = 0;
  state.features = new Set();
  state.demo = null;
  state.openHelpChat.mockClear();
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  Reflect.deleteProperty(Element.prototype, "scrollTo");
});

describe("customer workspace toolbar integration", () => {
  it("preserves the real cart quantity and client chat action after replacing the public navbar", () => {
    state.itemCount = 2;
    const { rerender } = render(<CustomerShell />);
    const cart = screen.getByRole("link", { name: "Mon panier, 2 articles" });
    expect(cart).toHaveAttribute("href", "/panier");
    expect(within(cart).getByText("2")).toBeVisible();
    fireEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Help ! Ouvrir le chat IA" }));
    expect(state.openHelpChat).toHaveBeenCalledExactlyOnceWith({ surface: "client" });

    state.itemCount = 1;
    rerender(<CustomerShell />);
    expect(screen.getByRole("link", { name: "Mon panier, 1 article" })).toHaveTextContent("1");
    expect(screen.queryByRole("link", { name: "Mon panier, 2 articles" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mes favoris" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the commercial demo's existing feature gates and hides the real client help action", () => {
    state.demo = { surface: "client", snapshot: { active_features: [] } };
    render(<CustomerShell />);
    expect(screen.queryByRole("link", { name: "Mon panier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Help ! Ouvrir le chat IA" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ouvrir mon compte" })).not.toBeInTheDocument();
  });
});

describe("restaurant workspace tool access integration", () => {
  it("opens the branded mobile menu with restaurant context and primary navigation first", () => {
    state.features = new Set(["dashboard-overview", "dashboard-service", "dashboard-plan-salle"]);
    renderRestaurantShell({
      restaurants: [{ id: "restaurant-1", name: "La Table d’Octobre" }] as DashboardContextValue["restaurants"],
      selectedId: "restaurant-1",
      dashboardAccessLocked: false,
      onboardingConfigurationUnlocked: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu du dashboard" }));

    const panel = screen.getByTestId("restaurant-mobile-menu-panel");
    expect(panel).toBeVisible();
    expect(within(panel).getByRole("heading", { name: "Menu principal" })).toBeVisible();
    expect(within(panel).getAllByText("La Table d’Octobre")).toHaveLength(1);
    expect(within(panel).getByRole("navigation", { name: "Navigation mobile de l’espace restaurateur" })).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Vue d'ensemble" })).toHaveAttribute("aria-current", "page");
    expect(within(panel).getByRole("button", { name: "Help ! Ouvrir le chat IA" })).toBeVisible();
  });

  it("supplies only permitted destinations to search while transactional access remains locked", () => {
    state.features = new Set(["dashboard-overview", "dashboard-menu", "dashboard-commandes"]);
    renderRestaurantShell();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un outil du dashboard" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("option").map((item) => item.textContent)).toEqual([
      "Vue d'ensemble", "Guide d’utilisation",
    ]);
    expect(within(dialog).queryByRole("option", { name: "Menu" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: "Commandes et retraits" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: "Assistant IA" })).not.toBeInTheDocument();
  });

  it("includes permitted preparation pages while excluding disabled features and unavailable workforce", () => {
    state.features = new Set(["dashboard-overview", "dashboard-restaurant", "dashboard-menu", "dashboard-commandes"]);
    renderRestaurantShell({ onboardingConfigurationUnlocked: true, disabledFeatures: new Set(["dashboard-menu"]) });
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un outil du dashboard" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("option").map((item) => item.textContent)).toEqual([
      "Vue d'ensemble", "Mon restaurant", "Guide d’utilisation",
    ]);
    expect(within(dialog).queryByRole("option", { name: "TOK Équipe" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: "Menu" })).not.toBeInTheDocument();
  });
});
