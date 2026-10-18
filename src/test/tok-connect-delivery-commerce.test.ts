import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as contract from "../../supabase/functions/_shared/tok-connect-customer-commerce";
import { resolveTokDeliveryAddress } from "../../supabase/functions/_shared/tok-connect-delivery-address";

const transpile = (path: string) => ts.transpileModule(readFileSync(path, "utf8").replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "").replace(/^export\s+/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const nativePricingSource = transpile("supabase/functions/_shared/order-pricing.ts");
const bridgeSource = transpile("supabase/functions/tok-connect-app-bridge/index.ts");
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const restaurant = "12f4babe-9438-4fda-8892-20c26ea7f7bb", item = "d6e50f04-5777-4d5a-906d-c77af199dd1e", attempt = "d9f6ad38-4ed7-42eb-8293-8ef38f4e6cdd";
const address = "Rue de Lyon 55, 1203 Genève";
const input = { mode: "customer_commerce", action: "checkout", restaurant_id: restaurant, journey: "delivery", delivery_address: address, items: [{ menu_item_id: item, quantity: 1 }], date: "2026-10-20", time: "19:00", confirmed_by_user: true, expected_total_cents: 2900, payment_attempt_id: attempt, idempotency_key: "tok-cart:" + attempt };
type Row = Record<string, unknown>;
function harness(options: { flagDisabled?: boolean; restaurantDisabled?: boolean; stockUnavailable?: boolean; timeout?: boolean; wrongPaymentOwner?: boolean; geocoderUnavailable?: boolean; geocoderNoCoordinates?: boolean; routingBlocked?: boolean } = {}) {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  const records = new Map<string, Row>(); const writes: string[] = [];
  const restaurantRow = { id: restaurant, name: "Gazelle", is_active: true, status: "active", is_demo: false, tok_connect_mcp_enabled: true, delivery_available: !options.restaurantDisabled, delivery_fee: 5, supports_pickup: true };
  const db = { from: (table: string) => {
    const filters: Row = {}; let patch: Row | null = null;
    const key = () => String(filters.user_id) + ":" + String(filters.idempotency_key);
    const data = () => table === "restaurants" ? restaurantRow : table === "menu_items" ? [{ id: item, restaurant_id: restaurant, name: "Tibs", price: 24, category: "plat", is_available: !options.stockUnavailable }] : table === "profiles" ? { loyalty_points: 0 } : table === "tok_connect_mcp_action_idempotency" ? records.get(key()) || null : [];
    const query = { select: () => query, eq: (field: string, value: unknown) => { filters[field] = value; return query; }, in: () => query, lte: () => query, gte: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: data(), error: null }),
      insert: async (row: Row) => { const id = String(row.user_id) + ":" + String(row.idempotency_key); if (records.has(id)) return { error: { code: "23505" } }; records.set(id, row); return { error: null }; },
      update: (row: Row) => { patch = row; return query; },
      then: (resolve: (value: unknown) => unknown) => { if (patch) records.set(key(), { ...records.get(key()), ...patch }); return Promise.resolve(resolve({ data: data(), error: null })); },
    }; return query;
  }, rpc: async () => ({ data: null, error: null }) };
  const flags = new Set(["commandes", "emporter", "card", "twint", ...options.flagDisabled ? [] : ["livraison"]]);
  const pricing = new Function("getEffectiveFeatureFlagSet", "assertPaymentMethodAllowed", "isTokOneEntitledStatus", nativePricingSource + ";return buildVerifiedOrderPricing;")(async () => flags, () => {}, () => false);
  const nativePricing = vi.fn(pricing);
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const name = url.split("/").at(-1), body = JSON.parse(String(init.body));
    if (name === "validate-order") {
      const authoritative = await pricing({ adminClient: db, userId: "caller", restaurantId: restaurant, items: body.items, deliveryFee: body.delivery_fee, metadata: body.metadata });
      if (!body.preview_only) writes.push("order");
      return Response.json({ verified_total: authoritative.total, order_id: "native-pending-order" });
    }
    if (name === "create-checkout") { writes.push("stripe"); if (options.timeout) throw new Error("provider_connection_lost"); return Response.json({ url: "https://checkout.stripe.com/c/pay/test" }); }
    if (name === "payment-attempt-status") return options.wrongPaymentOwner ? Response.json({ error: "payment_attempt_forbidden" }, { status: 403 }) : Response.json({ state: "session_bound", payment_status: "pending" });
    throw new Error("Unexpected function " + name);
  });
  const geocodeFetch = vi.fn(async () => options.geocoderUnavailable ? Response.json({ error: "unavailable" }, { status: 503 }) : Response.json({ features: [{ type: "Feature", properties: { countrycode: "CH", street: "Rue de Lyon", housenumber: "55", postcode: "1203", city: "Genève" }, geometry: { type: "Point", coordinates: options.geocoderNoCoordinates ? null : [6.1324, 46.2097] } }] }));
  const deps = { ...contract, HttpError, fetch, tokOAuthEdgeFetch: (_actor: unknown, url: string, init: RequestInit) => fetch(url, init), Deno: { env: { get: () => "https://tok.test" }, serve: () => {} }, requireUserRole: (actor: { roles: string[] }, allowed: string[]) => { if (!actor.roles.some((role) => allowed.includes(role))) throw new HttpError(403, "forbidden"); }, sha256Base64Url: async (value: string) => createHash("sha256").update(value).digest("hex"), isClientCheckoutRestaurantEligible: (row: unknown) => Boolean(row), buildVerifiedOrderPricing: nativePricing,
    resolveMarketplaceRouting: async () => { if(options.routingBlocked) throw new HttpError(503, "MARKETPLACE_CONNECT_ROUTING_NOT_READY"); return { enabled: true, mode: "stripe_connect_destination" }; },
    resolveTokDeliveryAddress: (raw: string, config: Parameters<typeof resolveTokDeliveryAddress>[1]) => resolveTokDeliveryAddress(raw, { ...config, fetchImpl: geocodeFetch, useCache: false }), createRateLimiter: () => ({ consume: async () => {} }),
  };
  const invoke = new Function(...Object.keys(deps), bridgeSource + ";return invokeCustomerCommerce;")(...Object.values(deps));
  const actor = { userId: "caller", roles: ["client"], adminClient: db };
  const request = new Request("https://tok.test", { headers: { authorization: "Bearer actual-caller-token" } });
  return { run: (body: Row = input) => invoke(request, actor, body), writes, fetch, nativePricing, pricing, db, geocodeFetch };
}
afterEach(() => vi.useRealTimers());

describe("TOK delivery commerce through native pricing and checkout", () => {
  it("does not create a delivery order or Stripe session while Connect payouts are unavailable", async () => {
    const h = harness({ routingBlocked: true });
    const response = await h.run();
    expect(response).toMatchObject({ statusCode: 503, payload: { ok: false, retry_safe: true } });
    expect(h.writes).toEqual([]);
    expect(h.fetch.mock.calls.every(([url, init]) => url.endsWith("validate-order") && JSON.parse(String(init.body)).preview_only === true)).toBe(true);
    expect((await h.run()).payload).toMatchObject({ replayed: true, retry_safe: true });
  });
  it("quotes the native restaurant delivery fee and exact address without making an order or payment", async () => {
    const h = harness(); const result = await h.run({ ...input, action: "quote" });
    expect(result.payload.quote).toMatchObject({ journey: "delivery", delivery_address: address, delivery_fee_cents: 500, subtotal_cents: 2400, total_cents: 2900, supported_countries: ["CH"], delivery_location: { latitude: 46.2097, longitude: 6.1324, city: "Genève", provider: "photon" } });
    expect(h.writes).toHaveLength(0);
  });
  it("uses the configured native fee even if a low-level caller forges delivery fee and menu price", async () => {
    const h = harness(); const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await h.pricing({ adminClient: h.db, userId: "caller", restaurantId: restaurant, items: [{ menu_item_id: item, quantity: 1, unit_price: 0.01 }], deliveryFee: 0, metadata: { delivery_address: address } });
      expect(result).toMatchObject({ deliveryFee: 5, subtotal: 24, total: 29 });
    } finally { warning.mockRestore(); }
    await expect(h.run({ ...input, delivery_fee: 0 })).rejects.toThrow("server_prices_or_identity_only");
  });
  it("prepares the native delivery order and checkout once, retaining address and scheduling metadata", async () => {
    const h = harness(); const result = await h.run();
    expect(result.payload).toMatchObject({ ok: true, payment_status: "pending", order_id: "native-pending-order", total_cents: 2900, delivery_fee_cents: 500, delivery_address: address });
    expect((await h.run()).payload.replayed).toBe(true);
    expect(h.geocodeFetch).toHaveBeenCalledOnce();
    expect(h.writes).toEqual(["order", "stripe"]);
    const prepared = h.fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body))).find((body) => body.checkout_id);
    expect(prepared).toMatchObject({ delivery_address: address, delivery_fee: 5, metadata: { delivery_address: address, delivery_lat: 46.2097, delivery_lng: 6.1324, delivery_city: "Genève", delivery_geocode_provider: "photon", delivery_date: "2026-10-20", delivery_time: "19:00", delivery_schedule_mode: "scheduled", fulfillment: "delivery", type: "delivery" } });
    const checkout = h.fetch.mock.calls.find(([url]) => url.endsWith("create-checkout"));
    expect(JSON.parse(String(checkout![1].body))).toMatchObject({ checkout_kind: "order", order_metadata: { primary_order_id: "native-pending-order", delivery_address: address, delivery_fee: 5, delivery_lat: 46.2097, delivery_lng: 6.1324 } });
    expect(new Headers(checkout![1].headers).get("authorization")).toBe("Bearer actual-caller-token");
  });
  it("requires a full Swiss address and does not accept forged account or GPS fields", async () => {
    const h = harness();
    for (const invalid of [null, "Genève", "Rue de Lyon 55", "Rue de Lyon 55, 74100 Annemasse", "Rue de Lyon\n55, 1203 Genève"]) await expect(h.run({ ...input, delivery_address: invalid })).rejects.toThrow("delivery_address");
    await expect(h.run({ ...input, user_id: "another" })).rejects.toThrow("server_prices_or_identity_only");
    expect(h.writes).toHaveLength(0);
  });
  it.each([{ flagDisabled: true }, { restaurantDisabled: true }, { stockUnavailable: true }])("preserves native delivery/restaurant/menu availability checks: %j", async (options) => {
    const h = harness(options); const result = await h.run();
    expect(result.payload).toMatchObject({ ok: false, retry_safe: true });
    expect(h.writes).toHaveLength(0);
  });
  it.each([{ geocoderUnavailable: true }, { geocoderNoCoordinates: true }])("refuses unresolved delivery destinations before any order/payment mutation: %j", async (options) => {
    const h = harness(options); const result = await h.run();
    expect(result).toMatchObject({ statusCode: options.geocoderUnavailable ? 503 : 422, payload: { ok: false, retry_safe: true } });
    expect(h.writes).toHaveLength(0);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("requires the quoted total including shipping and prevents address changes under the same attempt", async () => {
    const h = harness(); const rejected = await h.run({ ...input, expected_total_cents: 2400 });
    expect(rejected.payload).toMatchObject({ ok: false, retry_safe: true });
    expect(h.writes).toHaveLength(0);
    const fresh = harness(); await fresh.run();
    await expect(fresh.run({ ...input, delivery_address: "Rue de Lyon 57, 1203 Genève" })).rejects.toThrow("different_body");
    expect(fresh.writes).toEqual(["order", "stripe"]);
  });
  it("keeps an interrupted payment locked and propagates native payment-owner refusals", async () => {
    const h = harness({ timeout: true });
    expect((await h.run()).payload).toMatchObject({ ok: false, retry_safe: false });
    expect((await h.run()).payload.replayed).toBe(true);
    expect(h.writes).toEqual(["order", "stripe"]);
    const other = harness({ wrongPaymentOwner: true });
    await expect(other.run({ action: "status", payment_attempt_id: attempt })).rejects.toThrow("payment_attempt_forbidden");
  });
});
