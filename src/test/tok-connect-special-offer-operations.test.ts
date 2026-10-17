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
    anti_waste_offers: [{ id: other, restaurant_id: restaurant }], flash_sales: [{ id: other, restaurant_id: restaurant }], favorites: [], reviews: [], restaurant_branches: [{ id: reservation, restaurant_id: restaurant }],
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
  const inProgress = new Map<string, string>();
  const deps = {
    authorizeMutation: vi.fn(async () => {}),
    invokeEdge: vi.fn(async (body: Row) => ({ statusCode: 200, payload: { ok: true, native: body } })),
    invokeRpc: vi.fn(async (body: Row) => ({ statusCode: 200, payload: { ok: true, native: body } })),
    mutate: vi.fn(async (_operation: string, args: Row, run: () => Promise<{ statusCode: number; payload: Row }>) => {
      const key = String(args.idempotency_key), signature = JSON.stringify(args), previous = cached.get(key);
      if (previous && previous.signature !== signature) throw new Error("idempotency_conflict");
      if (previous) return previous.result as { statusCode: number; payload: Row };
      if (inProgress.has(key)) throw new Error(inProgress.get(key) === signature ? "idempotency_in_progress" : "idempotency_conflict");
      inProgress.set(key, signature);
      const result = await run(); cached.set(key, { signature, result }); inProgress.delete(key); return result;
    }),
  };
  const run = (name: string, args: Row = {}) => invokeTokRoleOperation(actor, { operation: name, args }, deps);
  return { actor, rows, writes, deps, run, client, cached, inProgress };
}

describe("TOK governed restaurant special offers", () => {
  const anti = { restaurant_id: restaurant, menu_item_id: reservation, discounted_price_chf: 8, quantity_available: 3, is_active: true, offer_type: "regular", available_date: "2099-10-18", pickup_start: "18:00", pickup_end: "19:00", reason: "Fin de service", ...confirmation };
  const flash = { restaurant_id: restaurant, menu_item_id: reservation, discounted_price_chf: 8, quantity_available: 3, is_active: true, sale_date: "2099-10-18", sale_start: "18:00", sale_end: "19:00", delivery_available: false, takeaway_available: true, reason: "Fin de service", ...confirmation };
  for (const kind of ["anti_waste", "flash_sale"]) {
    const input = kind === "anti_waste" ? anti : flash;
    it(`creates ${kind} with exact native contract and replays without duplication`, async () => {
      const h = harness(); h.rows.menu_items[0].name = "Plat natif";
      h.client.rpc.mockResolvedValue({ data: { id: other, restaurant_id: restaurant, title: "Plat natif" }, error: null } as never);
      const result = await h.run(`tok_create_restaurant_${kind}`, input);
      expect(result.payload.ok).toBe(true);
      const { restaurant_id, menu_item_id: _menu, discounted_price_chf, reason, confirmed_by_user: _confirmed, idempotency_key: _key, ...specific } = input;
      expect(h.client.rpc).toHaveBeenCalledWith(kind === "anti_waste" ? "restaurant_upsert_anti_waste_offer" : "restaurant_upsert_flash_sale", { [kind === "anti_waste" ? "p_offer_id" : "p_sale_id"]: null, p_reason: reason, p_payload: { restaurant_id, title: "Plat natif", description: null, original_price: 12, discounted_price: discounted_price_chf, ...specific } });
      await h.run(`tok_create_restaurant_${kind}`, input);
      expect(h.client.rpc).toHaveBeenCalledTimes(1);
      await expect(h.run(`tok_create_restaurant_${kind}`, { ...input, quantity_available: 4 })).rejects.toThrow("idempotency_conflict");
    });
    it(`lists ${kind} with tenant filter and calls governed status/archive RPCs`, async () => {
      const h = harness(); const table = kind === "anti_waste" ? "anti_waste_offers" : "flash_sales";
      h.rows[table].push({ id: reservation, restaurant_id: other });
      expect((await h.run(`tok_list_restaurant_${kind}`, { restaurant_id: restaurant })).payload.items).toHaveLength(1);
      h.client.rpc.mockResolvedValue({ data: { id: other, restaurant_id: restaurant }, error: null } as never);
      await h.run(`tok_set_status_restaurant_${kind}`, { restaurant_id: restaurant, offer_id: other, is_active: false, reason: "Pause demandée", ...confirmation });
      expect(h.client.rpc).toHaveBeenLastCalledWith(`restaurant_update_${kind === "anti_waste" ? "anti_waste_offer" : "flash_sale"}_status`, { [kind === "anti_waste" ? "p_offer_id" : "p_sale_id"]: other, p_is_active: false, p_reason: "Pause demandée" });
      await h.run(`tok_archive_restaurant_${kind}`, { restaurant_id: restaurant, offer_id: other, reason: "Fin demandée", ...confirmation, idempotency_key: "archive-unique" });
      expect(h.client.rpc).toHaveBeenLastCalledWith(`restaurant_archive_${kind === "anti_waste" ? "anti_waste_offer" : "flash_sale"}`, { [kind === "anti_waste" ? "p_offer_id" : "p_sale_id"]: other, p_reason: "Fin demandée" });
      expect(await h.run(`tok_archive_restaurant_${kind}`, { restaurant_id: restaurant, offer_id: reservation, reason: "Fin demandée", ...confirmation, idempotency_key: "wrongowner-key" })).toMatchObject({ statusCode: 404, payload: { ok: false } });
    });
  }
  it("rejects forged reference price, invalid date/window/price/stock and blank audit reason before RPC", async () => {
    const h = harness();
    for (const patch of [{ original_price: 100 }, { available_date: "2099-02-30" }, { available_date: "2000-01-01" }, { pickup_end: "17:00" }, { discounted_price_chf: 8.123 }, { quantity_available: 0 }, { quantity_available: -1 }, { reason: "      " }]) await expect(h.run("tok_create_restaurant_anti_waste", { ...anti, ...patch })).rejects.toThrow();
    await expect(h.run("tok_create_restaurant_flash_sale", { ...flash, takeaway_available: false })).rejects.toThrow("window_invalid");
    expect(h.client.rpc).not.toHaveBeenCalled();
  });
  it("denies owner/admin bypass, disabled MCP, wrong menu and privileged callers", async () => {
    for (const options of [{ owner: "another", roles: ["admin", "restaurateur"] }, { disabled: true }, { roles: ["client"] }]) {
      const h = harness(options); await expect(h.run("tok_create_restaurant_anti_waste", anti)).rejects.toThrow(); expect(h.client.rpc).not.toHaveBeenCalled();
    }
    const h = harness(); h.rows.menu_items[0].restaurant_id = other;
    expect(await h.run("tok_create_restaurant_anti_waste", anti)).toMatchObject({ statusCode: 404, payload: { ok: false } });
    h.actor.isServiceRole = true;
    await expect(h.run("tok_list_restaurant_anti_waste", { restaurant_id: restaurant })).rejects.toThrow("user_required");
    expect(h.client.rpc).not.toHaveBeenCalled();
  });
  it("returns native refusal rather than fabricated success and protects ambiguous results", async () => {
    const h = harness(); h.client.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Archived" } } as never);
    expect(await h.run("tok_create_restaurant_anti_waste", anti)).toMatchObject({ statusCode: 409, payload: { ok: false } });
    await h.run("tok_create_restaurant_anti_waste", anti); expect(h.client.rpc).toHaveBeenCalledTimes(1);
    h.client.rpc.mockResolvedValueOnce({ data: null, error: { code: "08006", message: "Network" } } as never);
    await expect(h.run("tok_create_restaurant_anti_waste", { ...anti, idempotency_key: "network-error" })).rejects.toThrow("reconciliation_required");
    h.client.rpc.mockResolvedValueOnce({ data: { restaurant_id: other }, error: null } as never);
    await expect(h.run("tok_create_restaurant_anti_waste", { ...anti, idempotency_key: "different-key" })).rejects.toThrow("reconciliation_required");
  });
  it.each(["", "08006"])("preserves an indeterminate claim after a possibly committed RPC transport error %s", async (code) => {
    const h = harness(), input = { ...anti, idempotency_key: "lost-rpc-response" };
    let nativeCommits = 0;
    h.client.rpc.mockImplementationOnce((async () => {
      nativeCommits += 1;
      return { data: null, error: { code, message: "Connection lost after commit" } };
    }) as never);
    await expect(h.run("tok_create_restaurant_anti_waste", input)).rejects.toThrow("reconciliation_required");
    expect(h.cached.has(input.idempotency_key)).toBe(false);
    expect(h.inProgress.has(input.idempotency_key)).toBe(true);
    await expect(h.run("tok_create_restaurant_anti_waste", input)).rejects.toThrow("idempotency_in_progress");
    expect(h.client.rpc).toHaveBeenCalledTimes(1);
    expect(nativeCommits).toBe(1);
  });
  it("completes invalid authoritative price failures and replays without a stuck claim", async () => {
    const h = harness(); const bad = { ...anti, discounted_price_chf: 13 };
    expect(await h.run("tok_create_restaurant_anti_waste", bad)).toMatchObject({ statusCode: 400, payload: { ok: false } });
    h.rows.menu_items[0].price = 20;
    expect(await h.run("tok_create_restaurant_anti_waste", bad)).toMatchObject({ statusCode: 400, payload: { ok: false } });
    expect(h.client.rpc).not.toHaveBeenCalled();
    h.client.rpc.mockResolvedValue({ data: { id: other, restaurant_id: restaurant }, error: null } as never);
    expect(await h.run("tok_create_restaurant_anti_waste", { ...bad, idempotency_key: "new-corrected-request" })).toMatchObject({ statusCode: 200 });
  });
  it("advertises exactly eight bounded tools and partial client coverage", () => {
    const coverage = TOK_ROLE_OPERATION_COVERAGE.find((item) => item.domain === "restaurant.special_offers");
    expect(coverage).toMatchObject({ status: "partial", remaining: ["offer_edit"] });
    expect(coverage?.tools).toHaveLength(8);
    expect(TOK_ROLE_OPERATION_TOOLS.filter((tool) => coverage?.tools.includes(tool.name)).every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
  });
});
