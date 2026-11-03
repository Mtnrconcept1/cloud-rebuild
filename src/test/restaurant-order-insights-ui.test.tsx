import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import RestaurantOrderInsightsPanel from "@/components/dashboard/RestaurantOrderInsightsPanel";
import { loadRestaurantOrderHistory, loadRestaurantOrderInsights } from "@/lib/restaurantOrderInsights";

const RESTAURANT = "1414667c-eac4-4f27-925d-43f2eb2c225c";
const DISH = "29905a50-21a3-4cf8-9972-1b422cf30de9";
const BRANCH = "56b31120-54a5-4f46-8fe1-5bc940ec20d5";
const TICKET = "64171c33-eae4-4adf-b18e-c2b76d9675bb";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "9a52ed26-2845-4a20-a45b-9f7c60d9e0f8" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/restaurantOrderInsights", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/restaurantOrderInsights")>();
  return {
    ...real,
    getZurichDay: () => "2026-11-03",
    loadRestaurantOrderHistory: vi.fn(),
    loadRestaurantOrderInsights: vi.fn(),
  };
});

const report = {
  from_day: "2026-10-05", to_day: "2026-11-03", timezone: "Europe/Zurich" as const,
  summary: {
    recorded_orders: 3, confirmed_orders: 2, completed_orders: 1,
    excluded_orders: 1, confirmed_units: 5, estimated_value_chf: 98,
    room_value_chf: 38, online_value_chf: 60, average_prep_minutes: 12,
  },
  top_products: [{
    item_key: DISH, name: "Pizza margherita", category: "Pizzas",
    channel: "salle" as const, order_count: 1, units_recorded: 2,
    units_confirmed: 2, units_completed: 1, estimated_value_chf: 38,
  }],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hour === 13 ? 2 : 0 })),
  weekdays: Array.from({ length: 7 }, (_, index) => ({ day: index + 1, orders: index === 1 ? 2 : 0 })),
  days: [{ day: "2026-11-03", orders: 2, units: 5 }],
  channels: [
    { channel: "salle" as const, orders: 1, confirmed: 1 },
    { channel: "en_ligne" as const, orders: 2, confirmed: 1 },
  ],
  statuses: [
    { channel: "salle" as const, status: "served", orders: 1 },
    { channel: "en_ligne" as const, status: "payment_failed", orders: 1 },
  ],
};
const order = {
  id: TICKET, channel: "salle" as const, branch_id: BRANCH, table_number: "12",
  status: "served", created_at: "2026-11-03T12:00:00Z",
  started_at: "2026-11-03T12:01:00Z", ready_at: "2026-11-03T12:13:00Z",
  finished_at: "2026-11-03T12:18:00Z", cancelled_at: null,
  payment_status: null, source: null, scheduled_for: null,
  amount_chf: 38, discount_chf: 0, tax_chf: 0, tip_chf: 0,
  items: [{ name: "Pizza margherita", quantity: 2, unit_price: 19, menu_item_id: DISH }],
};
const clients: QueryClient[] = [];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><RestaurantOrderInsightsPanel restaurantId={RESTAURANT} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => {
    const q = {
      select: () => q, eq: () => q, limit: () => q,
      order: async () => ({ data: [{ id: BRANCH, name: "Centre" }], error: null }),
    };
    return q;
  });
  vi.mocked(loadRestaurantOrderInsights).mockResolvedValue(report);
  vi.mocked(loadRestaurantOrderHistory).mockResolvedValue({
    total: 1, page: 0, page_size: 30, orders: [order],
  });
});

afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
});

describe("tableau des statistiques restaurateur", () => {
  it("montre les produits populaires, les heures, les échecs et le ticket sauvegardé", async () => {
    mount();
    expect(await screen.findByText("Plats les plus commandés")).toBeInTheDocument();
    expect(screen.getByText("Pizza margherita")).toBeInTheDocument();
    expect(screen.getAllByText(/1 commande/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Paiement échoué/)).toBeInTheDocument();
    expect(screen.getByText("Historique détaillé")).toBeInTheDocument();
    expect(screen.getByText(/1 commande\(s\) dans cette fenêtre/)).toBeInTheDocument();
    const summary = screen.getByText(/Table 12/).closest("summary");
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(within(summary!.parentElement!).getByText("2 × Pizza margherita")).toBeInTheDocument();
    expect(within(summary!.parentElement!).getByText(/Début/)).toBeInTheDocument();
  });

  it("permet de consulter une période précédente sans perdre les commandes anciennes", async () => {
    mount();
    await screen.findByText("Plats les plus commandés");
    fireEvent.click(screen.getByRole("button", { name: /Période précédente/ }));
    await waitFor(() => expect(loadRestaurantOrderInsights).toHaveBeenCalledWith(
      expect.objectContaining({ endDate: "2026-10-04", restaurantId: RESTAURANT }),
    ));
  });

  it("n'expose pas de données si la statistique ou l'historique échoue", async () => {
    vi.mocked(loadRestaurantOrderInsights).mockRejectedValueOnce(new Error("Permission denied"));
    vi.mocked(loadRestaurantOrderHistory).mockRejectedValueOnce(new Error("Permission denied"));
    mount();
    expect(await screen.findByText(/Statistiques indisponibles/)).toBeInTheDocument();
    expect(screen.getByText(/Historique indisponible/)).toBeInTheDocument();
    expect(screen.queryByText("Pizza margherita")).not.toBeInTheDocument();
  });
});
