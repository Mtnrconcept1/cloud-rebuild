import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSupabase } from "@/integrations/supabase/client";
import {
  advanceKitchenTicket,
  buildKitchenLines,
  canAdvanceKitchenTicket,
  changeKitchenQuantity,
  kitchenWaitingMinutes,
  sortKitchenTickets,
  submitKitchenTicket,
  type KitchenTicket,
} from "@/lib/kitchenTickets";

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: vi.fn() }));

const RESTAURANT = "1414667c-eac4-4f27-925d-43f2eb2c225c";
const TABLE = "8e97ae5a-2221-4cda-9236-c42f0ce4438b";
const DISH = "29905a50-21a3-4cf8-9972-1b422cf30de9";
const KEY = "64171c33-eae4-4adf-b18e-c2b76d9675bb";

describe("Prise de commande et ticket cuisine", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(getSupabase).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabase>);
  });

  it("ajoute et retire des portions sans laisser de quantité nulle", () => {
    const once = changeKitchenQuantity({}, DISH, 1);
    expect(once).toEqual({ [DISH]: 1 });
    expect(changeKitchenQuantity(once, DISH, -1)).toEqual({});
    expect(buildKitchenLines(once)).toEqual([{ menu_item_id: DISH, quantity: 1 }]);
  });

  it("bloque 31 unités, 41 références et 121 portions", () => {
    expect(() => changeKitchenQuantity({ [DISH]: 30 }, DISH, 1)).toThrow(/Maximum 30/);
    const items = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["dish-" + i, 1]));
    expect(() => changeKitchenQuantity(items, "extra", 1)).toThrow(/Maximum 40/);
    expect(() => changeKitchenQuantity({ a: 30, b: 30, c: 30, d: 30 }, "e", 1))
      .toThrow(/Maximum 120/);
  });

  it("refuse un ticket vide avant appel réseau", async () => {
    await expect(submitKitchenTicket({
      restaurantId: RESTAURANT, tableId: TABLE, basket: {}, note: "", requestKey: KEY,
    })).rejects.toThrow(/Choisissez des plats/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("envoie le même identifiant d'idempotence au serveur et refuse les erreurs SQL", async () => {
    rpc.mockResolvedValueOnce({ data: KEY, error: null });
    expect(await submitKitchenTicket({
      restaurantId: RESTAURANT, tableId: TABLE, basket: { [DISH]: 2 },
      note: "Sans gluten", requestKey: KEY,
    })).toBe(KEY);
    expect(rpc).toHaveBeenCalledWith("kitchen_create_ticket", {
      p_restaurant_id: RESTAURANT, p_table_id: TABLE,
      p_lines: [{ menu_item_id: DISH, quantity: 2 }],
      p_note: "Sans gluten", p_request_key: KEY,
    });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Droits insuffisants" } });
    await expect(submitKitchenTicket({
      restaurantId: RESTAURANT, tableId: TABLE, basket: { [DISH]: 1 },
      note: "", requestKey: KEY,
    })).rejects.toThrow(/Droits insuffisants/);
  });

  it("interdit les sauts de statut et transmet une précondition CAS", async () => {
    expect(canAdvanceKitchenTicket("queued", "preparing")).toBe(true);
    expect(canAdvanceKitchenTicket("queued", "cancelled")).toBe(true);
    expect(canAdvanceKitchenTicket("queued", "ready")).toBe(false);
    expect(canAdvanceKitchenTicket("preparing", "ready")).toBe(true);
    expect(canAdvanceKitchenTicket("ready", "served")).toBe(true);
    expect(canAdvanceKitchenTicket("served", "preparing")).toBe(false);
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await advanceKitchenTicket({ id: KEY, status: "queued" }, "preparing");
    expect(rpc).toHaveBeenCalledWith("kitchen_advance_ticket", {
      p_ticket_id: KEY, p_expected_status: "queued", p_next_status: "preparing",
    });
    await expect(advanceKitchenTicket({ id: KEY, status: "served" }, "queued"))
      .rejects.toThrow(/transition/);
  });

  it("ordonne les tickets par heure puis ID, sans mutation du tableau source", () => {
    const base = {
      restaurant_id: RESTAURANT, branch_id: null, table_number: "1", note: null,
      status: "queued", started_at: null, ready_at: null, items: [],
    } satisfies Omit<KitchenTicket, "id" | "created_at">;
    const newer: KitchenTicket = { ...base, id: KEY, created_at: "2026-11-03T12:01:00Z" };
    const older: KitchenTicket = { ...base, id: DISH, created_at: "2026-11-03T12:00:00Z" };
    const input = [newer, older];
    expect(sortKitchenTickets(input)).toEqual([older, newer]);
    expect(input).toEqual([newer, older]);
    expect(kitchenWaitingMinutes(older.created_at, Date.parse("2026-11-03T12:25:00Z"))).toBe(25);
  });

  it("verrouille la migration : lecture isolée, mutations RPC, anti-doublon", () => {
    const migration = readFileSync(resolve(process.cwd(),
      "supabase/migrations/20261103062023_kitchen_table_service.sql"), "utf8");
    expect(migration).toContain("alter table public.kitchen_tickets enable row level security");
    expect(migration).toContain("r.owner_id = (select auth.uid())");
    expect(migration).toContain("on conflict (restaurant_id, submitted_by, request_key) do nothing");
    expect(migration).toContain("for update");
    expect(migration).toContain("security definer set search_path = ''");
    expect(migration).toContain("revoke all on public.kitchen_tickets");
    expect(migration).not.toContain("grant insert on public.kitchen_tickets");
  });
});
