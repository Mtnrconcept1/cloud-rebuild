import { z } from "zod";
import { getSupabase } from "@/integrations/supabase/client";

export const KITCHEN_MAX_QUANTITY = 30;
export const KITCHEN_MAX_LINES = 40;
export const KITCHEN_MAX_TOTAL = 120;

export type KitchenTicketStatus = "queued" | "preparing" | "ready" | "served" | "cancelled";
export type KitchenBasket = Record<string, number>;
export type KitchenLine = { menu_item_id: string; quantity: number };

const kitchenItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  quantity: z.number().int().min(1).max(KITCHEN_MAX_QUANTITY),
  unit_price: z.coerce.number().nonnegative(),
});

const kitchenTicketSchema = z.object({
  id: z.string().uuid(),
  restaurant_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable(),
  table_number: z.string(),
  note: z.string().nullable(),
  status: z.enum(["queued", "preparing", "ready", "served", "cancelled"]),
  created_at: z.string(),
  started_at: z.string().nullable(),
  ready_at: z.string().nullable(),
  items: z.array(kitchenItemSchema),
});

export type KitchenTicket = z.infer<typeof kitchenTicketSchema>;

export const kitchenSetupSchema = z.object({
  branches: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
  })).max(30),
  tables: z.array(z.object({
    id: z.string().uuid(),
    branch_id: z.string().uuid(),
    table_number: z.string().min(1),
    capacity: z.number().int().nonnegative(),
  })).max(200),
  menu: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    category: z.string().nullable(),
    price: z.coerce.number().nonnegative(),
  })).max(500),
});

export type KitchenSetup = z.infer<typeof kitchenSetupSchema>;

const allowedTransitions: Record<KitchenTicketStatus, readonly KitchenTicketStatus[]> = {
  queued: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: ["served"],
  served: [],
  cancelled: [],
};

export function canAdvanceKitchenTicket(
  from: KitchenTicketStatus,
  to: KitchenTicketStatus,
): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export function changeKitchenQuantity(
  basket: KitchenBasket,
  menuItemId: string,
  delta: 1 | -1,
): KitchenBasket {
  const current = basket[menuItemId] || 0;
  const next = Math.max(0, current + delta);
  if (next > KITCHEN_MAX_QUANTITY) {
    throw new Error("Maximum 30 portions par plat.");
  }
  if (next > 0 && current === 0 && Object.keys(basket).length >= KITCHEN_MAX_LINES) {
    throw new Error("Maximum 40 plats différents par ticket.");
  }
  if (delta > 0 && Object.values(basket).reduce((sum, count) => sum + count, 0) >= KITCHEN_MAX_TOTAL) {
    throw new Error("Maximum 120 portions par ticket.");
  }
  const changed = { ...basket };
  if (next === 0) delete changed[menuItemId];
  else changed[menuItemId] = next;
  return changed;
}

export function buildKitchenLines(basket: KitchenBasket): KitchenLine[] {
  return Object.entries(basket)
    .filter(([, count]) => Number.isInteger(count) && count >= 1)
    .map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
}

export function sortKitchenTickets(tickets: KitchenTicket[]): KitchenTicket[] {
  return [...tickets].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

export function kitchenWaitingMinutes(createdAt: string, now = Date.now()): number {
  const start = Date.parse(createdAt);
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 60_000)) : 0;
}

// These RPCs are introduced by the kitchen migration; the generated Supabase
// schema will include them on the next normal types regeneration.
type KitchenRpcName = "kitchen_list_tickets" | "kitchen_create_ticket" | "kitchen_advance_ticket" | "kitchen_get_setup";
type KitchenRpcResult = { data: unknown; error: { message: string } | null };
async function callKitchenRpc(name: KitchenRpcName, args: Record<string, unknown>): Promise<unknown> {
  const supabase = getSupabase();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    functionName: KitchenRpcName, parameters: Record<string, unknown>
  ) => Promise<KitchenRpcResult>;
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function getKitchenSetup(restaurantId: string): Promise<KitchenSetup> {
  const data = await callKitchenRpc("kitchen_get_setup", { p_restaurant_id: restaurantId });
  const parsed = kitchenSetupSchema.safeParse(data);
  if (!parsed.success) throw new Error("La configuration de salle renvoyée est invalide.");
  return parsed.data;
}

export async function listKitchenTickets(restaurantId: string): Promise<KitchenTicket[]> {
  const data = await callKitchenRpc("kitchen_list_tickets", { p_restaurant_id: restaurantId });
  const parsed = z.array(kitchenTicketSchema).max(120).safeParse(data);
  if (!parsed.success) throw new Error("Réponse de l'écran cuisine invalide.");
  return parsed.data;
}

export async function submitKitchenTicket(input: {
  restaurantId: string;
  tableId: string;
  basket: KitchenBasket;
  note: string;
  requestKey: string;
}): Promise<string> {
  const lines = buildKitchenLines(input.basket);
  const total = lines.reduce((sum, item) => sum + item.quantity, 0);
  if (lines.length < 1 || lines.length > KITCHEN_MAX_LINES || total > KITCHEN_MAX_TOTAL
      || input.note.length > 500) {
    throw new Error("Choisissez des plats et vérifiez les quantités et consignes.");
  }
  const data = await callKitchenRpc("kitchen_create_ticket", {
    p_restaurant_id: input.restaurantId,
    p_table_id: input.tableId,
    p_lines: lines,
    p_note: input.note.trim(),
    p_request_key: input.requestKey,
  });
  if (typeof data !== "string") throw new Error("Confirmation de commande invalide.");
  return data;
}

export async function advanceKitchenTicket(
  ticket: Pick<KitchenTicket, "id" | "status">,
  nextStatus: KitchenTicketStatus,
): Promise<void> {
  if (!canAdvanceKitchenTicket(ticket.status, nextStatus)) {
    throw new Error("Cette transition de commande n'est pas autorisée.");
  }
  const data = await callKitchenRpc("kitchen_advance_ticket", {
    p_ticket_id: ticket.id,
    p_expected_status: ticket.status,
    p_next_status: nextStatus,
  });
  if (data !== true) throw new Error("Le nouveau statut n'a pas été confirmé.");
}
