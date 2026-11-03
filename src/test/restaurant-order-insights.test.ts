import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/integrations/supabase/client";
import {
  buildOrderTrend, getZurichDay, loadRestaurantOrderHistory,
  loadRestaurantOrderInsights, offsetDay,
  type OrderInsightsFilters,
} from "@/lib/restaurantOrderInsights";

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: vi.fn() }));

const RESTAURANT = "1414667c-eac4-4f27-925d-43f2eb2c225c";
const BRANCH = "56b31120-54a5-4f46-8fe1-5bc940ec20d5";
const ORDER = "8e97ae5a-2221-4cda-9236-c42f0ce4438b";
const filters: OrderInsightsFilters = {
  restaurantId: RESTAURANT,
  days: 30,
  endDate: "2026-11-03",
  branchId: BRANCH,
  channel: "all",
};

const makeReport = () => ({
  from_day: "2026-10-05",
  to_day: "2026-11-03",
  timezone: "Europe/Zurich",
  summary: {
    recorded_orders: 5, confirmed_orders: 3, completed_orders: 2,
    excluded_orders: 2, confirmed_units: 8,
    estimated_value_chf: 125, room_value_chf: 80, online_value_chf: 45,
    average_prep_minutes: 12.5,
  },
  top_products: [{
    item_key: ORDER, name: "Pizza margherita", category: "Pizzas",
    channel: "salle", order_count: 2, units_recorded: 5,
    units_confirmed: 4, units_completed: 2, estimated_value_chf: 80,
  }],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hour === 12 ? 3 : 0 })),
  weekdays: Array.from({ length: 7 }, (_, index) => ({ day: index + 1, orders: index === 1 ? 3 : 0 })),
  days: Array.from({ length: 30 }, (_, index) => ({
    day: offsetDay("2026-10-05", index),
    orders: index === 29 ? 3 : 0, units: index === 29 ? 8 : 0,
  })),
  channels: [
    { channel: "salle", orders: 3, confirmed: 2 },
    { channel: "en_ligne", orders: 2, confirmed: 1 },
  ],
  statuses: [
    { channel: "salle", status: "served", orders: 2 },
    { channel: "en_ligne", status: "payment_failed", orders: 1 },
  ],
});
const makeHistory = () => ({
  total: 2, page: 0, page_size: 30, orders: [{
    id: ORDER, channel: "salle", branch_id: BRANCH,
    table_number: "12", status: "served",
    created_at: "2026-11-03T12:00:00Z",
    started_at: "2026-11-03T12:01:00Z",
    ready_at: "2026-11-03T12:13:00Z",
    finished_at: "2026-11-03T12:18:00Z",
    cancelled_at: null, payment_status: null, source: null,
    scheduled_for: null, amount_chf: 38,
    discount_chf: 0, tax_chf: 0, tip_chf: 0,
    items: [{
      name: "Pizza margherita", quantity: 2, unit_price: 19,
      menu_item_id: ORDER,
    }],
  }],
});

describe("mémorisation des commandes et analyses sans doublon", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(getSupabase).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabase>);
  });

  it("filtre les classements par restaurant, succursale, canal et fenêtre suisse", async () => {
    rpc.mockResolvedValueOnce({ data: makeReport(), error: null });
    const report = await loadRestaurantOrderInsights(filters);
    expect(report.summary.confirmed_units).toBe(8);
    expect(report.summary.recorded_orders).toBe(5);
    expect(report.summary.excluded_orders).toBe(2);
    expect(report.top_products[0].units_completed).toBe(2);
    expect(rpc).toHaveBeenCalledWith("restaurant_order_insights", {
      p_restaurant_id: RESTAURANT, p_days: 30, p_end_date: "2026-11-03",
      p_branch_id: BRANCH, p_channel: "all",
    });
  });

  it("pagine la mémoire des tickets historiques, y compris les tickets servis", async () => {
    rpc.mockResolvedValueOnce({ data: makeHistory(), error: null });
    const history = await loadRestaurantOrderHistory(filters, 0);
    expect(history.orders[0].items[0].name).toBe("Pizza margherita");
    expect(history.orders[0].finished_at).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("restaurant_order_history", {
      p_restaurant_id: RESTAURANT, p_days: 30, p_end_date: "2026-11-03",
      p_branch_id: BRANCH, p_channel: "all", p_page: 0,
    });
  });

  it("refuse des réponses falsifiées ou incomplètes et une page non bornée", async () => {
    rpc.mockResolvedValueOnce({ data: { top_products: [] }, error: null });
    await expect(loadRestaurantOrderInsights(filters)).rejects.toThrow(/invalides/);
    rpc.mockResolvedValueOnce({ data: { ...makeHistory(), page: 1 }, error: null });
    await expect(loadRestaurantOrderHistory(filters, 0)).rejects.toThrow(/invalide/);
    await expect(loadRestaurantOrderHistory(filters, 1001)).rejects.toThrow(/invalide/);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("remonte les refus du serveur et n'effectue pas de requête sans UUID correct", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Permission denied" } });
    await expect(loadRestaurantOrderInsights(filters)).rejects.toThrow("Permission denied");
    await expect(loadRestaurantOrderInsights({ ...filters, restaurantId: "invalide" }))
      .rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("gère les jours civils suisses et regroupe les périodes longues par mois", () => {
    expect(getZurichDay(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    expect(getZurichDay(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    expect(offsetDay("2026-03-29", 1)).toBe("2026-03-30");
    expect(offsetDay("2026-10-25", -1)).toBe("2026-10-24");
    expect(buildOrderTrend([
      { day: "2026-10-30", orders: 2, units: 4 },
      { day: "2026-10-31", orders: 1, units: 2 },
      { day: "2026-11-01", orders: 3, units: 5 },
    ], 90)).toEqual([
      { label: "2026-10", orders: 3 },
      { label: "2026-11", orders: 3 },
    ]);
  });
});
