import { describe, expect, it, vi } from "vitest";
import { invokeTokRoleOperation, TOK_ROLE_OPERATION_TOOLS, TOK_ROLE_OPERATION_COVERAGE } from "../../supabase/functions/_shared/tok-connect-role-operations";
import type { RequestActor } from "../../supabase/functions/_shared/auth";
import { DEFAULT_SERVICE_SETTINGS } from "../lib/serviceSettings";

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
    reservation_slots: [{ reservation_id: reservation, table_id: other }], reservation_table_layout_overrides: [], reservation_tables: [{ id: other, branch_id: reservation, table_number: "1", capacity: 4, sector: "Salle", is_active: true, layout: { kind: "table", shape: "round", x: 20, y: 30, preserved: true } }], social_posts: [],
  };
  const writes: { table: string; patch: Row }[] = [];
  const client = { from: (table: string) => {
    const filters: Row = {}; let patch: Row | null = null; let insert: Row | null = null; let single = false; let range = [0, 100]; let remove = false;
    const query = {
      select: () => query, order: () => query, limit: () => query, in: (key: string, values: unknown[]) => { filters[key] = values; return query; }, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, is: (key: string, value: unknown) => { filters[key] = value; return query; }, filter: (key: string, _operator: string, value: string) => { filters[key] = JSON.parse(value); return query; },
      range: (a: number, b: number) => { range = [a, b]; return query; }, maybeSingle: () => { single = true; return query; }, single: () => { single = true; return query; },
      update: (value: Row) => { patch = value; if (options.concurrentServiceEdit && table === "restaurants" && value.opening_hours) rows.restaurants[0].opening_hours = { ...(rows.restaurants[0].opening_hours as Row), concurrent_change: "keep" }; return query; }, delete: () => { remove = true; return query; },
      insert: (value: Row) => { insert = value; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        if (insert) { rows[table].push({ id: "created-id", ...insert }); writes.push({ table, patch: insert }); }
        const found = (rows[table] || []).filter((row) => Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : typeof value === "object" ? JSON.stringify(row[key]) === JSON.stringify(value) : row[key] === value));
        if (patch && found.length) { for (const row of found) Object.assign(row, patch); writes.push({ table, patch }); }
        if (remove) { rows[table] = rows[table].filter((row) => !found.includes(row)); writes.push({ table, patch: { deleted: true } }); }
        return Promise.resolve(resolve({ data: structuredClone(single ? found[0] || null : found.slice(range[0], range[1] + 1)), error: null }));
      },
    }; return query;
  }, rpc: vi.fn(() => Object.assign(Promise.resolve({ data: { updated: true }, error: null }), { range: async () => ({ data: [{ restaurant_id: restaurant, plan: "pro" }], error: null }) })) };
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

describe("TOK native floor-plan operations", () => {
  const base = { restaurant_id: restaurant, branch_id: reservation, reason: "Placement demandé", ...confirmation };
  it("reads the tenant branch template, dated layouts and paginated reservation assignments", async () => {
    const h = harness(); Object.assign(h.rows.reservations[0], { branch_id: reservation, date: "2026-10-18" });
    h.rows.reservations.push({ id: other, restaurant_id: other, branch_id: reservation, date: "2026-10-18" });
    const result = await h.run("tok_get_restaurant_floor_plan", { restaurant_id: restaurant, branch_id: reservation, service_date: "2026-10-18" });
    expect(result.payload).toMatchObject({ ok: true, tables: [{ id: other }], reservations: [{ id: reservation }], assignments: [{ table_id: other }] });
    expect(h.client.rpc).not.toHaveBeenCalled(); expect(h.writes).toEqual([]);
  });
  it("uses native template RPC for guarded capacity/activation edits, preserving layout keys", async () => {
    const h = harness(); await h.run("tok_save_table_restaurant_floor_plan", { ...base, table_id: other, is_active: false, capacity: 2 });
    expect(h.client.rpc).toHaveBeenCalledWith("restaurant_save_floor_plan_template", { p_branch_id: reservation, p_reason: base.reason, p_delete_ids: [], p_upserts: [{ client_id: other, id: other, table_number: "1", sector: "Salle", capacity: 2, is_active: false, layout: { kind: "table", shape: "round", x: 20, y: 30, preserved: true } }] });
    expect(h.writes).toEqual([]);
    await h.run("tok_save_table_restaurant_floor_plan", { ...base, table_id: other, is_active: false, capacity: 2 });
    expect(h.client.rpc).toHaveBeenCalledTimes(1);
  });
  it("creates and deletes tables through the same audited transaction", async () => {
    const h = harness(); await h.run("tok_add_table_restaurant_floor_plan", { ...base, table_number: "2", capacity: 6, sector: "Terrasse", is_active: true, shape: "rect", x: 100, y: 120 });
    expect(h.client.rpc).toHaveBeenLastCalledWith("restaurant_save_floor_plan_template", expect.objectContaining({ p_delete_ids: [], p_upserts: [{ client_id: "mcp-new-table", table_number: "2", capacity: 6, sector: "Terrasse", is_active: true, layout: { kind: "table", shape: "rect", x: 100, y: 120 } }] }));
    await h.run("tok_delete_table_restaurant_floor_plan", { ...base, table_id: other, idempotency_key: "delete-table-unique" });
    expect(h.client.rpc).toHaveBeenLastCalledWith("restaurant_save_floor_plan_template", { p_branch_id: reservation, p_reason: base.reason, p_upserts: [], p_delete_ids: [other] });
  });
  it("changes/resets service layout via the exact native argument shape", async () => {
    const h = harness(); await h.run("tok_set_layout_restaurant_floor_plan", { ...base, table_id: other, service_date: "2026-10-18", reset: false, shape: "round", x: 40, y: 50 });
    expect(h.client.rpc).toHaveBeenCalledWith("restaurant_save_floor_plan_layouts", { p_branch_id: reservation, p_service_date: "2026-10-18", p_layouts: [{ table_id: other, layout: { kind: "table", shape: "round", x: 40, y: 50 } }], p_reason: base.reason });
    await h.run("tok_set_layout_restaurant_floor_plan", { ...base, table_id: other, service_date: "2026-10-18", reset: true, idempotency_key: "reset-layout-key" });
    expect(h.client.rpc).toHaveBeenLastCalledWith("restaurant_save_floor_plan_layouts", expect.objectContaining({ p_layouts: [{ table_id: other, layout: null }] }));
  });
  it("assigns and clears placements without changing the reservation or payment", async () => {
    const h = harness(); await h.run("tok_assign_reservation_restaurant_floor_plan", { ...base, reservation_id: reservation, clear_assignment: false, table_id: other });
    expect(h.client.rpc).toHaveBeenCalledWith("restaurant_save_floor_plan_assignments", { p_branch_id: reservation, p_assignments: { [reservation]: other }, p_reason: base.reason });
    await h.run("tok_assign_reservation_restaurant_floor_plan", { ...base, reservation_id: reservation, clear_assignment: true, idempotency_key: "clear-placement-key" });
    expect(h.client.rpc).toHaveBeenLastCalledWith("restaurant_save_floor_plan_assignments", expect.objectContaining({ p_assignments: { [reservation]: null } })); expect(h.writes).toEqual([]);
  });
  it("resolves preferred-table customer from the owned reservation and hides user ids", async () => {
    const h = harness(); h.rows.reservations[0].user_id = "customer-real";
    h.client.rpc.mockResolvedValueOnce({ data: { user_id: "customer-real", table_id: other }, error: null } as never);
    const result = await h.run("tok_set_preferred_table_restaurant_floor_plan", { ...base, reservation_id: reservation, clear_preference: false, table_id: other });
    expect(h.client.rpc).toHaveBeenCalledWith("restaurant_set_preferred_table", { p_branch_id: reservation, p_user_id: "customer-real", p_table_id: other });
    expect(JSON.stringify(result)).not.toContain("customer-real");
  });
  it("enforces role, owner, MCP opt-in and branch boundaries before mutations", async () => {
    for (const config of [{ owner: "foreign", roles: ["admin", "restaurateur"] }, { disabled: true }, { roles: ["client"] }]) {
      const h = harness(config); await expect(h.run("tok_delete_table_restaurant_floor_plan", { ...base, table_id: other })).rejects.toThrow(); expect(h.client.rpc).not.toHaveBeenCalled();
    }
    const h = harness(); h.rows.restaurant_branches[0].restaurant_id = other;
    await expect(h.run("tok_delete_table_restaurant_floor_plan", { ...base, table_id: other })).rejects.toThrow("branch_not_found"); expect(h.deps.mutate).not.toHaveBeenCalled();
  });
  it("returns deterministic wrong-table/reservation/branch failures without stuck claims", async () => {
    const h = harness(); h.rows.reservation_tables[0].branch_id = other;
    const input = { ...base, table_id: other };
    expect(await h.run("tok_delete_table_restaurant_floor_plan", input)).toMatchObject({ statusCode: 404 });
    expect(await h.run("tok_delete_table_restaurant_floor_plan", input)).toMatchObject({ statusCode: 404 });
    h.rows.reservations[0].branch_id = other;
    expect(await h.run("tok_assign_reservation_restaurant_floor_plan", { ...base, reservation_id: reservation, clear_assignment: true, idempotency_key: "wrong-branch-key" })).toMatchObject({ statusCode: 409 }); expect(h.client.rpc).not.toHaveBeenCalled();
  });
  it("retains native occupied/paid-table guard failures and never falls back to update", async () => {
    const h = harness(); h.client.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Retirez d'abord les clients" } } as never);
    expect(await h.run("tok_delete_table_restaurant_floor_plan", { ...base, table_id: other })).toMatchObject({ statusCode: 409, payload: { ok: false } }); expect(h.writes).toEqual([]);
  });
  it.each(["unknown", "08006", "PGRST000", "thrown-network-error"])("keeps %s RPC response failures indeterminate without completing or re-executing the claim", async (code) => {
    const h = harness(); const completed = vi.fn(); const claimed = new Set<string>();
    h.deps.mutate.mockImplementation(async (_operation, args, run) => {
      const key = String(args.idempotency_key);
      if (claimed.has(key)) throw new Error("tok_connect_action_in_progress");
      claimed.add(key);
      const result = await run();
      completed(result); return result;
    });
    if (code === "thrown-network-error") h.client.rpc.mockRejectedValue(new Error("Network disconnected"));
    else h.client.rpc.mockResolvedValue({ data: null, error: { code, message: "Response lost after commit" } } as never);
    const args = { ...base, table_id: other };
    await expect(h.run("tok_delete_table_restaurant_floor_plan", args)).rejects.toThrow("reconciliation_required");
    expect(completed).not.toHaveBeenCalled();
    await expect(h.run("tok_delete_table_restaurant_floor_plan", args)).rejects.toThrow("action_in_progress");
    expect(h.client.rpc).toHaveBeenCalledTimes(1); expect(h.writes).toEqual([]);
  });
  it("completes a native business rollback as a deterministic refusal", async () => {
    const h = harness(); const completed = vi.fn();
    h.deps.mutate.mockImplementation(async (_operation, _args, run) => { const result = await run(); completed(result); return result; });
    h.client.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Occupied table" } } as never);
    expect(await h.run("tok_delete_table_restaurant_floor_plan", { ...base, table_id: other })).toMatchObject({ statusCode: 409 });
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, payload: { ok: false, error: "tok_connect_floorplan_native_rejected" } }));
  });
  it("validates bounded inputs, full layout intent and reason before claim", async () => {
    const h = harness();
    for (const args of [{ table_id: other, capacity: 31 }, { table_id: other, x: -1 }, { table_id: other, shape: "triangle" }, { table_id: other, owner_id: "fake" }, { table_id: other, reason: "      " }]) await expect(h.run("tok_save_table_restaurant_floor_plan", { ...base, ...args })).rejects.toThrow();
    await expect(h.run("tok_set_layout_restaurant_floor_plan", { ...base, table_id: other, service_date: "2026-02-30", reset: true })).rejects.toThrow();
    await expect(h.run("tok_set_layout_restaurant_floor_plan", { ...base, table_id: other, service_date: "2026-10-18", reset: false, x: 2 })).rejects.toThrow();
    await expect(h.run("tok_assign_reservation_restaurant_floor_plan", { ...base, reservation_id: reservation, clear_assignment: true, table_id: other })).rejects.toThrow();
    expect(h.deps.mutate).not.toHaveBeenCalled(); expect(h.client.rpc).not.toHaveBeenCalled();
  });
  it("rejects terminal assignments while keeping the native reservation intact", async () => {
    const h = harness(); h.rows.reservations[0].status = "completed";
    expect(await h.run("tok_assign_reservation_restaurant_floor_plan", { ...base, reservation_id: reservation, clear_assignment: true })).toMatchObject({ statusCode: 409 }); expect(h.client.rpc).not.toHaveBeenCalled(); expect(h.writes).toEqual([]);
  });
  it("advertises partial coverage and seven explicit closed schemas", () => {
    const coverage = TOK_ROLE_OPERATION_COVERAGE.find((row) => row.domain === "restaurant.floorplan"); expect(coverage?.status).toBe("partial"); expect(coverage?.tools).toHaveLength(7);
    expect(TOK_ROLE_OPERATION_TOOLS.filter((row) => coverage?.tools.includes(row.name)).every((row) => row.inputSchema.additionalProperties === false)).toBe(true);
  });
});
