import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Json = Record<string, unknown>;
const restaurant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const source = readFileSync("supabase/functions/create-reservation/index.ts", "utf8").replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function harness(options: { loseBindingOnce?: boolean } = {}) {
  let handler: (req: Request) => Promise<Response>;
  const setups = new Map<string, Json>(), customers = new Map<string, Json>(), sessions = new Map<string, Json>();
  let lost = false;
  const db = { auth: { admin: { getUserById: async () => ({ data: { user: { email: "fixture@example.test" } } }) } },
    rpc: vi.fn(async (name: string, args: Json) => {
      if (name === "validate_and_create_reservation_idempotent") return { data: [], error: null };
      if (name === "reservation_card_guarantee_quote") return { data: [{ is_required: true, fee_amount_cents: 7000, reason: "large_party" }], error: null };
      if (name !== "claim_reservation_guarantee_request") throw new Error("Unexpected RPC");
      const key = String(args.p_request_key), payload = JSON.stringify(args.p_request_payload);
      let saved = setups.get(key);
      if (saved && saved.request_payload !== payload) return { data: null, error: { code: "22023" } };
      if (!saved && args.p_create) { saved = { id: "setup-1", user_id: "caller", request_payload: payload, status: "pending", fee_amount_cents: 7000 }; setups.set(key, saved); }
      return { data: saved ? { ...saved, checkout_url: saved.stripe_checkout_url || null } : null, error: null };
    }),
    from(table: string) {
      let patch: Json | null = null;
      const query = { select: () => query, eq: () => query, in: () => query,
        update: (value: Json) => { patch = value; return query; },
        maybeSingle: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          if (table === "restaurants") return Promise.resolve(resolve({ data: { opening_hours: {} }, error: null }));
          if (table === "feature_flags") return Promise.resolve(resolve({ data: { is_active: true }, error: null }));
          if (table === "reservation_card_guarantee_setups" && patch) {
            if (options.loseBindingOnce && !lost && patch.status === "checkout_ready") { lost = true; return Promise.resolve(resolve({ data: null, error: { message: "storage unavailable" } })); }
            Object.assign(setups.get("guarantee-key-1")!, patch);
            return Promise.resolve(resolve({ data: null, error: null }));
          }
          throw new Error("Unexpected fixture query " + table);
        },
      }; return query;
    },
  };
  const createCustomer = vi.fn(async (_body: Json, request: { idempotencyKey: string }) => {
    if (!customers.has(request.idempotencyKey)) customers.set(request.idempotencyKey, { id: "cus_fixture" });
    return customers.get(request.idempotencyKey);
  });
  const createSession = vi.fn(async (_body: Json, request: { idempotencyKey: string }) => {
    if (!sessions.has(request.idempotencyKey)) sessions.set(request.idempotencyKey, { id: "cs_fixture", url: "https://checkout.stripe.com/c/pay/fixture" });
    return sessions.get(request.idempotencyKey);
  });
  const deps = { HttpError, Deno: { env: { get: () => undefined }, serve: (callback: typeof handler) => { handler = callback; } },
    buildCorsHeaders: () => ({}), handleCorsPreflight: () => null, authenticateRequest: async () => ({ userId: "caller", adminClient: db }),
    assertProductionFlowAllowed: async () => {}, buildRequestMetadata: () => ({}), createAdminClient: () => db,
    jsonResponse: (body: unknown, status = 200) => Response.json(body, { status }), writeAuditLog: async () => {},
    makeLogger: () => ({ error() {} }), createRateLimiter: () => ({ consume: async () => {} }),
    getStripeRuntimeForCheckoutKind: () => ({ mode: "live", stripe: { customers: { create: createCustomer }, checkout: { sessions: { create: createSession } } } }),
    triggerNotificationDispatch: async () => {}, queueReservationConfirmationEmails: async () => {}, finalizeReservationCardGuarantee: async () => {},
  };
  new Function(...Object.keys(deps), compiled)(...Object.values(deps));
  const body = { restaurant_id: restaurant, date: "2027-01-02", time: "19:00", party_size: 7, guarantee_accepted: true };
  return { setups, customers, sessions, createCustomer, createSession,
    call: (patch: Json = {}) => handler(new Request("https://tok.test/create-reservation", { method: "POST", headers: { "Idempotency-Key": "guarantee-key-1" }, body: JSON.stringify({ ...body, ...patch }) })) };
}
describe("native guarantee request recovery", () => {
  it("persists one setup and replays its checkout without another Stripe call", async () => {
    const h = harness();
    const first = await h.call(), replay = await h.call();
    expect(first.status).toBe(200); expect(await replay.json()).toEqual(await first.json());
    expect(h.setups.size).toBe(1); expect(h.createSession).toHaveBeenCalledTimes(1);
  });
  it("recovers response loss before binding using the same provider object keys", async () => {
    const h = harness({ loseBindingOnce: true });
    expect((await h.call()).status).toBe(500);
    expect(h.sessions.size).toBe(1);
    const recovered = await h.call();
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({ ok: true, requires_card_guarantee: true, checkout_url: "https://checkout.stripe.com/c/pay/fixture" });
    expect(h.setups.size).toBe(1); expect(h.customers.size).toBe(1); expect(h.sessions.size).toBe(1);
    expect(h.createSession.mock.calls[0][1]).toEqual(h.createSession.mock.calls[1][1]);
    expect(h.setups.get("guarantee-key-1")).toMatchObject({ status: "checkout_ready", error_code: null });
  });
  it("refuses another body and missing initial card consent before provider creation", async () => {
    const h = harness();
    expect(await (await h.call({ guarantee_accepted: false })).json()).toMatchObject({ ok: false, error_code: "card_guarantee_consent_required" });
    expect(h.setups.size).toBe(0); expect(h.sessions.size).toBe(0);
    await h.call();
    expect((await h.call({ party_size: 8 })).status).toBe(409);
    expect(h.setups.size).toBe(1); expect(h.sessions.size).toBe(1);
  });
});
