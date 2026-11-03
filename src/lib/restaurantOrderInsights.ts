import { z } from "zod";
import { getSupabase } from "@/integrations/supabase/client";

export const orderInsightPeriods = [7, 30, 90, 365] as const;
export type OrderInsightDays = (typeof orderInsightPeriods)[number];
export type OrderInsightChannel = "all" | "salle" | "en_ligne";

const nonnegative = z.coerce.number().finite().nonnegative();
const counter = nonnegative.int();
const channelSchema = z.enum(["salle", "en_ligne"]);

const orderInsightsSchema = z.object({
  from_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.literal("Europe/Zurich"),
  summary: z.object({
    recorded_orders: counter,
    confirmed_orders: counter,
    completed_orders: counter,
    excluded_orders: counter,
    confirmed_units: counter,
    estimated_value_chf: nonnegative,
    room_value_chf: nonnegative,
    online_value_chf: nonnegative,
    average_prep_minutes: nonnegative,
  }),
  top_products: z.array(z.object({
    item_key: z.string().nullable(),
    name: z.string().min(1).max(200),
    category: z.string(),
    channel: channelSchema,
    order_count: counter,
    units_recorded: counter,
    units_confirmed: counter,
    units_completed: counter,
    estimated_value_chf: nonnegative,
  })).max(30),
  hours: z.array(z.object({ hour: z.number().int().min(0).max(23), orders: counter })).length(24),
  weekdays: z.array(z.object({ day: z.number().int().min(1).max(7), orders: counter })).length(7),
  days: z.array(z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    orders: counter,
    units: counter,
  })).max(366),
  channels: z.array(z.object({
    channel: channelSchema, orders: counter, confirmed: counter,
  })).max(2),
  statuses: z.array(z.object({
    channel: channelSchema, status: z.string(), orders: counter,
  })).max(100),
});

const orderHistorySchema = z.object({
  total: counter,
  page: z.number().int().nonnegative(),
  page_size: z.literal(30),
  orders: z.array(z.object({
    id: z.string().uuid(),
    channel: channelSchema,
    branch_id: z.string().uuid().nullable(),
    table_number: z.string().nullable(),
    status: z.string(),
    created_at: z.string(),
    started_at: z.string().nullable(),
    ready_at: z.string().nullable(),
    finished_at: z.string().nullable(),
    cancelled_at: z.string().nullable(),
    payment_status: z.string().nullable(),
    source: z.string().nullable(),
    scheduled_for: z.string().nullable(),
    amount_chf: nonnegative,
    discount_chf: nonnegative,
    tax_chf: nonnegative,
    tip_chf: nonnegative,
    items: z.array(z.object({
      name: z.string().max(200),
      quantity: counter,
      unit_price: nonnegative,
      menu_item_id: z.string().uuid().nullable(),
    })).max(120),
  })).max(30),
});

export type RestaurantOrderInsights = z.infer<typeof orderInsightsSchema>;
export type RestaurantOrderHistory = z.infer<typeof orderHistorySchema>;

export type OrderInsightsFilters = {
  restaurantId: string;
  days: OrderInsightDays;
  endDate: string;
  branchId?: string | null;
  channel: OrderInsightChannel;
};

type OrderAnalyticsRpc = "restaurant_order_insights" | "restaurant_order_history";

async function callInsightsRpc(name: OrderAnalyticsRpc, args: Record<string, unknown>): Promise<unknown> {
  const client = getSupabase();
  const rpc = client.rpc.bind(client) as unknown as (
    rpcName: OrderAnalyticsRpc, params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

const filtersSchema = z.object({
  restaurantId: z.string().uuid(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().nullish(),
  channel: z.enum(["all", "salle", "en_ligne"]),
});

export async function loadRestaurantOrderInsights(
  filters: OrderInsightsFilters,
): Promise<RestaurantOrderInsights> {
  const selected = filtersSchema.parse(filters);
  const data = await callInsightsRpc("restaurant_order_insights", {
    p_restaurant_id: selected.restaurantId,
    p_days: selected.days,
    p_end_date: selected.endDate,
    p_branch_id: selected.branchId ?? null,
    p_channel: selected.channel,
  });
  const parsed = orderInsightsSchema.safeParse(data);
  if (!parsed.success) throw new Error("Statistiques de commande invalides. Actualisez la page.");
  return parsed.data;
}

export async function loadRestaurantOrderHistory(
  filters: OrderInsightsFilters, page = 0,
): Promise<RestaurantOrderHistory> {
  const selected = filtersSchema.parse(filters);
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000) {
    throw new Error("Page de l'historique invalide.");
  }
  const data = await callInsightsRpc("restaurant_order_history", {
    p_restaurant_id: selected.restaurantId,
    p_days: selected.days,
    p_end_date: selected.endDate,
    p_branch_id: selected.branchId ?? null,
    p_channel: selected.channel,
    p_page: page,
  });
  const parsed = orderHistorySchema.safeParse(data);
  if (!parsed.success || parsed.data.page !== page) {
    throw new Error("Historique des commandes invalide. Actualisez la page.");
  }
  return parsed.data;
}

export function getZurichDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(now);
  const get = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === name)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function offsetDay(day: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(days)) {
    throw new Error("Date invalide.");
  }
  const result = new Date(day + "T12:00:00Z");
  if (Number.isNaN(result.getTime())) throw new Error("Date invalide.");
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function buildOrderTrend(
  days: RestaurantOrderInsights["days"],
  period: OrderInsightDays,
): Array<{ label: string; orders: number }> {
  if (period <= 30) return days.map((row) => ({
    label: row.day.slice(5), orders: row.orders,
  }));
  const grouped = new Map<string, number>();
  for (const row of days) {
    const month = row.day.slice(0, 7);
    grouped.set(month, (grouped.get(month) || 0) + row.orders);
  }
  return [...grouped].map(([label, orders]) => ({ label, orders }));
}
