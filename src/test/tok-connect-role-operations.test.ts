import { describe, expect, it, vi } from "vitest";
import { invokeTokRoleOperation, validateTokRoleOperation, TOK_ROLE_OPERATION_TOOLS, TOK_ROLE_OPERATION_COVERAGE } from "../../supabase/functions/_shared/tok-connect-role-operations";
import type { RequestActor } from "../../supabase/functions/_shared/auth";
import { DEFAULT_SERVICE_SETTINGS, getConfiguredServiceSettings, generateTimeSlotsForService } from "../lib/serviceSettings";

const restaurant = "10000000-0000-4000-8000-000000000001";
const reservation = "20000000-0000-4000-8000-000000000001";
const other = "30000000-0000-4000-8000-000000000001";
const confirmation = { confirmed_by_user: true, idempotency_key: "tok-operation:123" };
type Row = Record<string, unknown>;
function harness(options: { owner?: string; roles?: string[]; reservationRestaurant?: string; disabled?: boolean; concurrentServiceEdit?: boolean } = {}) {
  const rows: Record<string, Row[]> = {
    restaurants: [{ id: restaurant, owner_id: options.owner || "caller", name: "Gazelle", tok_connect_mcp_enabled: !options.disabled, opening_hours: { monday: "Fermé", preserved_key: true, service_settings: structuredClone(DEFAULT_SERVICE_SETTINGS) } }],
    reservations: [{ id: reservation, restaurant_id: options.reservationRestaurant || restaurant, status: "pending" }],
    orders: [{ id: reservation, restaurant_id: restaurant, status: "pending" }],
    profiles: [{ user_id: "caller", full_name: "Me" }, { user_id: "another", full_name: "Private" }],
    user_profiles: [{ user_id: "caller", first_name: "Existing", last_name: "Name" }],
    notifications: [{ id: reservation, user_id: "caller", title: "Mine" }, { id: other, user_id: "another", title: "Private" }],
    favorites: [], reviews: [], restaurant_branches: [{ id: reservation, restaurant_id: restaurant }],
    restaurant_hours: [{ id: other, branch_id: reservation, open_time: "12:00", close_time: "14:00", is_closed: false }],
    menu_items: [{ id: reservation, restaurant_id: restaurant, price: 12, is_available: true }],
    restaurant_promotions: [{ id: reservation, restaurant_id: restaurant, active: false }],
    reservation_tables: [{ id: other, branch_id: reservation, table_number: "1", capacity: 4 }], social_posts: [],
  };
  const writes: { table: string; patch: Row }[] = [];
  const client = { from: (table: string) => {
    const filters: Row = {}; let patch: Row | null = null; let insert: Row | null = null; let single = false; let range = [0, 100]; let remove = false;
    const query = {
      select: () => query, order: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, is: (key: string, value: unknown) => { filters[key] = value; return query; }, filter: (key: string, _operator: string, value: string) => { filters[key] = JSON.parse(value); return query; },
      range: (a: number, b: number) => { range = [a, b]; return query; }, maybeSingle: () => { single = true; return query; }, single: () => { single = true; return query; },
      update: (value: Row) => { patch = value; if (options.concurrentServiceEdit && table === "restaurants" && value.opening_hours) rows.restaurants[0].opening_hours = { ...(rows.restaurants[0].opening_hours as Row), concurrent_change: "keep" }; return query; }, delete: () => { remove = true; return query; },
      insert: (value: Row) => { insert = value; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        if (insert) { rows[table].push({ id: "created-id", ...insert }); writes.push({ table, patch: insert }); }
        const found = (rows[table] || []).filter((row) => Object.entries(filters).every(([key, value]) => typeof value === "object" ? JSON.stringify(row[key]) === JSON.stringify(value) : row[key] === value));
        if (patch && found.length) { for (const row of found) Object.assign(row, patch); writes.push({ table, patch }); }
        if (remove) { rows[table] = rows[table].filter((row) => !found.includes(row)); writes.push({ table, patch: { deleted: true } }); }
        return Promise.resolve(resolve({ data: structuredClone(single ? found[0] || null : found.slice(range[0], range[1] + 1)), error: null }));
      },
    }; return query;
  }, rpc: vi.fn(() => Object.assign(Promise.resolve({ data: null, error: null }), { range: async () => ({ data: [{ restaurant_id: restaurant, plan: "pro" }], error: null }) })) };
  const actor = { userId: "caller", userClient: client, roles: options.roles || ["restaurateur", "client"], isAdmin: false, isServiceRole: false } as unknown as RequestActor;
  const cached = new Map<string, { signature: string; result: unknown }>();
  const deps = {
    authorizeMutation: vi.fn(async () => {}),
    invokeEdge: vi.fn(async (body: Row) => ({ statusCode: 200, payload: { ok: true, native: body } })),
    invokeRpc: vi.fn(async (body: Row) => ({ statusCode: 200, payload: { ok: true, native: body } })),
    mutate: vi.fn(async (_operation: string, args: Row, run: () => Promise<{ statusCode: number; payload: Row }>) => {
      const key = String(args.idempotency_key), signature = JSON.stringify(args), previous = cached.get(key);
      if (previous && previous.signature !== signature) throw new Error("idempotency_conflict");
      if (previous) return previous.result as { statusCode: number; payload: Row };
      const result = await run(); cached.set(key, { signature, result }); return result;
    }),
  };
  const run = (name: string, args: Row = {}) => invokeTokRoleOperation(actor, { operation: name, args }, deps);
  return { actor, rows, writes, deps, run, client };
}

describe("TOK explicit role operations", () => {
  it("publishes closed schemas and distinguishes backend-only domains", () => {
    expect(new Set(TOK_ROLE_OPERATION_TOOLS.map((tool) => tool.name)).size).toBe(TOK_ROLE_OPERATION_TOOLS.length);
    expect(TOK_ROLE_OPERATION_TOOLS.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(TOK_ROLE_OPERATION_COVERAGE.find((entry) => entry.domain === "marketing_publication")).toMatchObject({ status: "backend_only", tools: [] });
  });
  it("rejects invalid dates, amounts, unknown owner fields and unconfirmed writes", () => {
    for (const args of [{ restaurant_id: restaurant, date: "2026-02-30" }, { restaurant_id: restaurant, date: "garbage" }]) expect(() => validateTokRoleOperation("tok_list_restaurant_reservations", args)).toThrow();
    expect(() => validateTokRoleOperation("tok_update_restaurant_menu_item", { restaurant_id: restaurant, menu_item_id: reservation, price_chf: -1, ...confirmation })).toThrow("price_chf_invalid");
    expect(() => validateTokRoleOperation("tok_get_my_account", { user_id: "another" })).toThrow("unknown_argument");
    expect(() => validateTokRoleOperation("tok_accept_restaurant_reservation", { restaurant_id: restaurant, reservation_id: reservation, ...confirmation, confirmed_by_user: false })).toThrow("confirmation_required");
  });
  it("requires real identity and actual restaurateur role", async () => {
    const h = harness({ roles: ["admin", "client"] });
    await expect(h.run("tok_list_my_restaurants")).rejects.toThrow("restaurateur_required");
    h.actor.isServiceRole = true;
    await expect(h.run("tok_get_my_account")).rejects.toThrow("user_required");
  });
  it("denies other owners even when caller is administrator", async () => {
    const h = harness({ owner: "another", roles: ["admin", "restaurateur"] });
    await expect(h.run("tok_accept_restaurant_reservation", { restaurant_id: restaurant, reservation_id: reservation, ...confirmation })).rejects.toThrow("owned_restaurant_not_found");
    expect(h.deps.invokeRpc).not.toHaveBeenCalled();
  });
  it("honors immediate restaurant MCP revocation for reads and writes", async () => {
    const h = harness({ disabled: true });
    await expect(h.run("tok_list_restaurant_orders", { restaurant_id: restaurant })).rejects.toThrow("restaurant_mcp_disabled");
    await expect(h.run("tok_update_restaurant_order_status", { restaurant_id: restaurant, order_id: reservation, status: "ready", ...confirmation })).rejects.toThrow("restaurant_mcp_disabled");
    expect(h.deps.invokeEdge).not.toHaveBeenCalled();
    expect(h.writes).toHaveLength(0);
    expect((await h.run("tok_list_my_restaurants")).payload.items).toEqual([]);
  });
  it("does not allow a reservation from another restaurant", async () => {
    const h = harness({ reservationRestaurant: other });
    await expect(h.run("tok_refuse_restaurant_reservation", { restaurant_id: restaurant, reservation_id: reservation, reason_code: "closure", ...confirmation })).rejects.toThrow("entity_not_found");
    expect(h.deps.invokeRpc).not.toHaveBeenCalled();
  });
  it("accepts/refuses through native reservation RPCs and propagates business refusal", async () => {
    const h = harness();
    await h.run("tok_accept_restaurant_reservation", { restaurant_id: restaurant, reservation_id: reservation, ...confirmation });
    expect(h.deps.invokeRpc).toHaveBeenLastCalledWith({ ...confirmation, rpc_name: "update_restaurant_reservation_status_safe", args: { p_reservation_id: reservation, p_status: "confirmed" } });
    h.deps.invokeRpc.mockResolvedValueOnce({ statusCode: 409, payload: { ok: false } });
    expect(await h.run("tok_refuse_restaurant_reservation", { restaurant_id: restaurant, reservation_id: reservation, reason_code: "closure", ...confirmation })).toMatchObject({ statusCode: 409, payload: { ok: false } });
    expect(h.deps.invokeRpc).toHaveBeenLastCalledWith({ ...confirmation, rpc_name: "cancel_reservation_by_restaurant", args: { p_reservation_id: reservation, p_reason_code: "closure", p_reason_details: null } });
    expect(h.writes).toHaveLength(0);
  });
  it("changes order status only through restaurant-order-status native capability", async () => {
    const h = harness();
    await h.run("tok_update_restaurant_order_status", { restaurant_id: restaurant, order_id: reservation, status: "ready", ...confirmation });
    expect(h.deps.invokeEdge).toHaveBeenCalledWith({ ...confirmation, capability: "restaurant.orders.status", payload: { order_id: reservation, status: "ready" } });
    expect(h.writes).toHaveLength(0);
  });
  it("scopes personal reads to caller regardless of other roles", async () => {
    const h = harness();
    const result = await h.run("tok_list_my_notifications");
    expect(result.payload.items).toHaveLength(1);
    expect(result.payload.items).toEqual([expect.objectContaining({ title: "Mine" })]);
    await expect(h.run("tok_mark_my_notification_read", { notification_id: other, ...confirmation })).rejects.toThrow("notification_not_found");
    expect(h.rows.notifications[1].read_at).toBeUndefined();
  });
  it("bounds menu changes and replays the same idempotent mutation without another write", async () => {
    const h = harness(); const args = { restaurant_id: restaurant, menu_item_id: reservation, price_chf: 28, is_available: false, ...confirmation };
    await h.run("tok_update_restaurant_menu_item", args);
    await h.run("tok_update_restaurant_menu_item", args);
    expect(h.writes).toEqual([{ table: "menu_items", patch: { is_available: false, price: 28 } }]);
    await expect(h.run("tok_update_restaurant_menu_item", { ...args, price_chf: 29 })).rejects.toThrow("idempotency_conflict");
  });
  it("rejects an obsolete branch-hours payload rather than writing an inert table", async () => {
    const h = harness();
    await expect(h.run("tok_update_restaurant_hours", { restaurant_id: restaurant, branch_id: other, hours_id: other, open_time: "19:00", close_time: "23:00", is_closed: false, ...confirmation })).rejects.toThrow("unknown_argument");
    expect(h.writes).toHaveLength(0);
  });
  it("adds and removes only caller favorites", async () => {
    const h = harness();
    await h.run("tok_set_my_favorite", { restaurant_id: restaurant, favorite: true, ...confirmation });
    expect(h.rows.favorites).toEqual([{ id: "created-id", user_id: "caller", restaurant_id: restaurant }]);
    await h.run("tok_set_my_favorite", { restaurant_id: restaurant, favorite: false, ...confirmation, idempotency_key: "remove-favorite-123" });
    expect(h.rows.favorites).toHaveLength(0);
  });
  it("preserves native profile fields and replays without re-reading/overwriting a later change", async () => {
    const h = harness(); const args = { phone: "123", ...confirmation };
    await h.run("tok_update_my_profile", args);
    expect(h.client.rpc).toHaveBeenCalledWith("update_client_profile", expect.objectContaining({ p_phone: "123", p_full_name: "Me", p_first_name: "Existing", p_last_name: "Name", p_address: null }));
    h.rows.profiles[0].full_name = "Changed elsewhere";
    await h.run("tok_update_my_profile", args);
    expect(h.client.rpc).toHaveBeenCalledTimes(1);
    expect(() => validateTokRoleOperation("tok_update_my_profile", { ...confirmation, loyalty_points: 1000 })).toThrow("unknown_argument");
  });
  it("creates menu items for owner only and keeps deletion replayable after the row disappeared", async () => {
    const h = harness();
    await h.run("tok_create_restaurant_menu_item", { restaurant_id: restaurant, name: "Tibs", price_chf: 28, is_available: true, ...confirmation });
    expect(h.rows.menu_items).toContainEqual(expect.objectContaining({ restaurant_id: restaurant, name: "Tibs", price: 28 }));
    const args = { restaurant_id: restaurant, menu_item_id: reservation, ...confirmation, idempotency_key: "delete-menu-123" };
    await h.run("tok_delete_restaurant_menu_item", args);
    await h.run("tok_delete_restaurant_menu_item", args);
    expect(h.writes.filter((entry) => entry.patch.deleted)).toHaveLength(1);
  });
  it("creates bounded promotions and rejects invalid date ranges and discounts", async () => {
    const h = harness(); const args = { restaurant_id: restaurant, name: "Midi", promotion_type: "percentage", promotion_value: 20, target: "all", start_at: "2026-10-18T10:00:00+02:00", end_at: "2026-10-18T14:00:00+02:00", active: false, ...confirmation };
    await h.run("tok_create_restaurant_promotion", args);
    expect(h.rows.restaurant_promotions).toContainEqual(expect.objectContaining({ name: "Midi", active: false, restaurant_id: restaurant }));
    expect(() => validateTokRoleOperation("tok_create_restaurant_promotion", { ...args, promotion_value: 101 })).toThrow("promotion_invalid");
    expect(() => validateTokRoleOperation("tok_create_restaurant_promotion", { ...args, end_at: args.start_at })).toThrow("promotion_invalid");
    expect(() => validateTokRoleOperation("tok_create_restaurant_promotion", { ...args, promotion_type: "free_delivery", promotion_value: 2 })).toThrow("promotion_invalid");
  });
  it("persists a news draft without publication, scheduling or boost", async () => {
    const h = harness();
    await h.run("tok_create_restaurant_news_draft", { restaurant_id: restaurant, body: "Menu de demain", post_type: "plat", ...confirmation });
    expect(h.writes).toEqual([{ table: "social_posts", patch: { restaurant_id: restaurant, author_id: "caller", body: "Menu de demain", post_type: "plat", status: "draft", visibility: "unlisted", cta_type: "none", scheduled_at: null } }]);
    expect(h.deps.invokeEdge).not.toHaveBeenCalled();
  });
  it("updates floor table metadata without capacity change or cross-branch access", async () => {
    const h = harness();
    await h.run("tok_update_restaurant_floor_table", { restaurant_id: restaurant, branch_id: reservation, table_id: other, sector: "Terrasse", ...confirmation });
    expect(h.rows.reservation_tables[0]).toMatchObject({ capacity: 4, sector: "Terrasse" });
    expect(() => validateTokRoleOperation("tok_update_restaurant_floor_table", { restaurant_id: restaurant, branch_id: reservation, table_id: other, capacity: 1, ...confirmation })).toThrow("unknown_argument");
  });
  it("refuses existing-table activation changes before any update and only creates active tables", async () => {
    const h = harness();
    await expect(h.run("tok_update_restaurant_floor_table", { restaurant_id: restaurant, branch_id: reservation, table_id: other, is_active: false, ...confirmation })).rejects.toThrow("unknown_argument");
    await expect(h.run("tok_create_restaurant_floor_table", { restaurant_id: restaurant, branch_id: reservation, table_number: "2", capacity: 4, sector: "Salle", is_active: false, ...confirmation })).rejects.toThrow("is_active_invalid");
    expect(h.writes).toHaveLength(0);
    await h.run("tok_create_restaurant_floor_table", { restaurant_id: restaurant, branch_id: reservation, table_number: "2", capacity: 4, sector: "Salle", is_active: true, ...confirmation });
    expect(h.rows.reservation_tables).toContainEqual(expect.objectContaining({ table_number: "2", is_active: true }));
  });
  it("blocks all role mutations when the native commercial/demo guard rejects", async () => {
    const h = harness(); h.deps.authorizeMutation.mockRejectedValueOnce(new Error("COMMERCIAL_DEMO_PRODUCTION_FLOW_BLOCKED"));
    await expect(h.run("tok_create_restaurant_news_draft", { restaurant_id: restaurant, body: "Menu", post_type: "plat", ...confirmation })).rejects.toThrow("COMMERCIAL_DEMO");
    expect(h.writes).toHaveLength(0);
  });
  it("uses native support delivery only for owned restaurants", async () => {
    const h = harness();
    await h.run("tok_contact_restaurant_support", { restaurant_id: restaurant, subject: "Une question", message: "Un message au support", ...confirmation });
    expect(h.deps.invokeEdge).toHaveBeenCalledWith({ capability: "support.contact", ...confirmation, payload: { source: "restaurant_dashboard", restaurantId: restaurant, subject: "Une question", message: "Un message au support" } });
  });
  it("reads subscriptions through the privacy-safe native RPC rather than the admin-only raw table", async () => {
    const h = harness();
    const result = await h.run("tok_list_restaurant_subscriptions", { restaurant_id: restaurant });
    expect(h.client.rpc).toHaveBeenCalledWith("get_my_restaurant_ai_subscriptions", { p_restaurant_ids: [restaurant] });
    expect(result.payload.items).toEqual([{ restaurant_id: restaurant, plan: "pro" }]);
  });
  it("changes the canonical slots consumed by native TOK while preserving the other service and legacy fields", async () => {
    const h = harness(); const before = structuredClone(h.rows.restaurants[0].opening_hours) as { service_settings: typeof DEFAULT_SERVICE_SETTINGS };
    const args = { restaurant_id: restaurant, service: "dinner", start_time: "18:00", last_reservation_time: "21:00", end_time: "22:00", slot_capacity_windows: [{ start_time: "18:00", end_time: "21:00", max_tables: 5 }], ...confirmation };
    const result = await h.run("tok_update_restaurant_hours", args);
    expect(result.payload).toMatchObject({ ok: true, source: "restaurants.opening_hours" });
    const opening = h.rows.restaurants[0].opening_hours as { service_settings: typeof DEFAULT_SERVICE_SETTINGS };
    expect(opening).toMatchObject({ monday: "Fermé", preserved_key: true });
    expect(opening.service_settings.lunch).toEqual(before.service_settings.lunch);
    const consumer = getConfiguredServiceSettings(opening);
    expect(consumer).not.toBeNull();
    expect(generateTimeSlotsForService(consumer!.dinner)[0]).toBe("18:00");
    expect(generateTimeSlotsForService(consumer!.dinner).at(-1)).toBe("21:00");
    await h.run("tok_update_restaurant_hours", args);
    expect(h.writes).toHaveLength(1);
    expect(h.rows.restaurant_hours).toEqual([{ id: other, branch_id: reservation, open_time: "12:00", close_time: "14:00", is_closed: false }]);
  });
  it("refuses invalid service windows without changing real availability", async () => {
    const h = harness(); const original = structuredClone(h.rows.restaurants[0].opening_hours);
    const result = await h.run("tok_update_restaurant_hours", { restaurant_id: restaurant, service: "dinner", start_time: "23:00", ...confirmation });
    expect(result).toMatchObject({ statusCode: 400, payload: { ok: false } });
    expect(h.rows.restaurants[0].opening_hours).toEqual(original);
    expect(h.writes).toHaveLength(0);
  });
  it("does not overwrite a simultaneous native service edit", async () => {
    const h = harness({ concurrentServiceEdit: true });
    const result = await h.run("tok_update_restaurant_hours", { restaurant_id: restaurant, service: "dinner", service_closed: true, ...confirmation });
    expect(result).toMatchObject({ statusCode: 409, payload: { ok: false, error: { message: "tok_connect_service_settings_changed_refresh_required" } } });
    expect(h.rows.restaurants[0].opening_hours).toMatchObject({ concurrent_change: "keep", service_settings: { dinner: { service_closed: false } } });
    expect(h.writes).toHaveLength(0);
  });
});
