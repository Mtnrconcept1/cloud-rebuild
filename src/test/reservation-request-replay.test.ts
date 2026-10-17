import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/create-reservation/index.ts", "utf8")
  .replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const restaurantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reservationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function harness(conflict = false) {
  let handler: (req: Request) => Promise<Response>;
  const tables: string[] = [];
  const filters: unknown[] = [];
  const rpc = vi.fn(async (name: string) => {
    expect(name).toBe("validate_and_create_reservation_idempotent");
    return { data: [{ reservation_id: conflict ? null : reservationId,
      error_code: conflict ? "idempotency_conflict" : null,
      error_message: conflict ? "Autre demande" : null }], error: null };
  });
  const adminClient = { rpc, from: (table: string) => {
    tables.push(table);
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => { filters.push(args); return query; },
      maybeSingle: async () => ({ data: table === "restaurants" ? { opening_hours: {} }
        : { id: reservationId, restaurant_id: restaurantId, date: "2027-01-02", time: "19:00:00", party_size: 7, status: "pending" }, error: null }),
    };
    return query;
  } };
  const actor = { userId: "client-1", adminClient, roles: ["client"] };
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  const audit = vi.fn(async () => {});
  const dependencies = {
    HttpError, authenticateRequest: async () => actor,
    assertProductionFlowAllowed: async () => {}, buildRequestMetadata: () => ({}),
    createRateLimiter: () => ({ consume: async () => {} }),
    buildCorsHeaders: () => ({}), handleCorsPreflight: () => null,
    makeLogger: () => ({ error: vi.fn() }), writeAuditLog: audit,
    jsonResponse: (body: unknown, status: number) => Response.json(body, { status }),
    Deno: { env: { get: () => undefined }, serve: (callback: typeof handler) => { handler = callback; } },
  };
  new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies));
  return { tables, filters, rpc, audit, request: () => handler(new Request("https://tok.test/create-reservation", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "stable-booking-attempt-1" },
    body: JSON.stringify({ restaurant_id: restaurantId, date: "2027-01-02", time: "19:00", party_size: 7 }),
  })) };
}
describe("native reservation recovery before guarantee recalculation", () => {
  it("returns exact committed booking without creating a guarantee session", async () => {
    const h = harness();
    const response = await h.request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reservation_id: reservationId, status: "pending", party_size: 7 });
    expect(h.tables).toEqual(["restaurants", "reservations"]);
    expect(h.filters).toContainEqual(["user_id", "client-1"]);
    expect(h.rpc).toHaveBeenCalledWith("validate_and_create_reservation_idempotent", expect.objectContaining({
      p_request_key: "stable-booking-attempt-1", p_user_id: "client-1", p_replay_only: true,
      p_party_size: 7, p_restaurant_id: restaurantId,
    }));
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { idempotent_replay: true } }));
  });
  it("returns a payload conflict without quoting, charging, or creating", async () => {
    const h = harness(true);
    expect(await (await h.request()).json()).toMatchObject({ ok: false, error_code: "idempotency_conflict" });
    expect(h.tables).toEqual(["restaurants"]);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});
