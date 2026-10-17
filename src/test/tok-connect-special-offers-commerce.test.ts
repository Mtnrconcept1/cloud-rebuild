import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as contract from "../../supabase/functions/_shared/tok-connect-customer-commerce";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget";
import { projectTokCustomerResult } from "../../supabase/functions/_shared/tok-connect-customer-result";

type Row = Record<string, unknown>;
const restaurant = "12f4babe-9438-4fda-8892-20c26ea7f7bb", offerId = "d6e50f04-5777-4d5a-906d-c77af199dd1e", attempt = "d9f6ad38-4ed7-42eb-8293-8ef38f4e6cdd";
const transpile = (path: string) => ts.transpileModule(readFileSync(path, "utf8").replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "").replace(/^export\s+/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const pricingSource = transpile("supabase/functions/_shared/order-pricing.ts"), bridgeSource = transpile("supabase/functions/tok-connect-app-bridge/index.ts");
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function harness(options: { kind?: "antigaspi" | "flash"; now?: string; date?: string; start?: string; end?: string; stock?: number; disabled?: boolean; otherRestaurant?: boolean; timeout?: boolean; nativeStockRefusal?: boolean } = {}) {
  const kind = options.kind || "antigaspi", date = options.date || "2026-10-17";
  vi.useFakeTimers(); vi.setSystemTime(new Date(options.now || "2026-10-17T17:15:00Z"));
  const records = new Map<string, Row>(), writes: string[] = [];
  const offer = { id: offerId, restaurant_id: options.otherRestaurant ? attempt : restaurant, title: "Offre serveur", discounted_price: 8, quantity_available: options.stock ?? 3, is_active: true,
    available_date: date, pickup_start: options.start || "19:00", pickup_end: options.end || "21:00", sale_date: date, sale_start: options.start || "19:00", sale_end: options.end || "21:00", delivery_available: true, takeaway_available: true };
  const tables: Record<string, Row[]> = { restaurants: [{ id: restaurant, name: "Gazelle", is_active: true, status: "active", is_demo: false, tok_connect_mcp_enabled: true, delivery_available: true, delivery_fee: 5, supports_pickup: true }], profiles: [{ loyalty_points: 0 }], anti_waste_offers: [offer], flash_sales: [offer] };
  const db = { from: (table: string) => {
    const filters: Array<(row: Row) => boolean> = []; const identity: Row = {}; let patch: Row | null = null;
    const key = () => identity.user_id + ":" + identity.idempotency_key;
    const data = () => table === "tok_connect_mcp_action_idempotency" ? [records.get(key())].filter(Boolean) : (tables[table] || []).filter((row) => filters.every((match) => match(row)));
    const query = { select: () => query, eq: (field: string, value: unknown) => { identity[field] = value; if (!["user_id"].includes(field)) filters.push((row) => row[field] === value); return query; },
      in: (field: string, values: unknown[]) => { filters.push((row) => values.includes(row[field])); return query; },
      gt: () => query, gte: () => query, lte: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: data()[0] || null, error: null }),
      insert: async (row: Row) => { const id = row.user_id + ":" + row.idempotency_key; if (records.has(id)) return { error: { code: "23505" } }; records.set(id, row); return { error: null }; },
      update: (value: Row) => { patch = value; return query; },
      then: (resolve: (value: unknown) => unknown) => { if (patch) records.set(key(), { ...records.get(key()), ...patch }); return Promise.resolve(resolve({ data: data(), error: null })); },
    }; return query;
  }, rpc: async () => ({ data: null, error: null }) };
  const flags = new Set(["commandes", "emporter", "card", "livraison", ...options.disabled ? [] : ["anti-gaspi", "ventes-flash"]]);
  const pricing = new Function("getEffectiveFeatureFlagSet", "assertPaymentMethodAllowed", "isTokOneEntitledStatus", pricingSource + ";return buildVerifiedOrderPricing;")(async () => flags, () => {}, () => false);
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const name = url.split("/").at(-1), body = JSON.parse(String(init.body));
    if (name === "validate-order") {
      const price = await pricing({ adminClient: db, userId: "caller", restaurantId: restaurant, items: body.items, metadata: body.metadata });
      if (!body.preview_only) { if (options.nativeStockRefusal) return Response.json({ error: "native_stock_exhausted" }, { status: 409 }); writes.push("native-order"); }
      return Response.json({ verified_total: price.total, order_id: "native-order" });
    }
    if (name === "create-checkout") { writes.push("stripe"); if (options.timeout) throw new Error("provider_response_lost"); return Response.json({ url: "https://checkout.stripe.com/c/pay/test" }); }
    throw new Error("Unexpected provider " + name);
  });
  const deps = { ...contract, HttpError, fetch, Deno: { env: { get: () => "https://tok.test" }, serve() {} },
    requireUserRole: (actor: { roles: string[] }, roles: string[]) => { if (!roles.some((role) => actor.roles.includes(role))) throw new HttpError(403, "forbidden"); },
    sha256Base64Url: async (value: string) => createHash("sha256").update(value).digest("hex"), isClientCheckoutRestaurantEligible: (row: unknown) => Boolean(row),
    getEffectiveFeatureFlagSet: async () => flags, buildVerifiedOrderPricing: pricing,
  };
  const invoke = new Function(...Object.keys(deps), bridgeSource + ";return invokeCustomerCommerce;")(...Object.values(deps));
  const input = { action: "checkout", restaurant_id: restaurant, journey: "takeaway", date, time: "19:30", items: [{ menu_item_id: kind + "-" + offerId, quantity: 2 }], expected_total_cents: 1600, payment_attempt_id: attempt, idempotency_key: "tok-cart:" + attempt, confirmed_by_user: true };
  const actor = { userId: "caller", roles: ["client"], adminClient: db };
  const req = new Request("https://tok.test", { headers: { authorization: "Bearer caller-session" } });
  return { input, offer, db, tables, pricing, fetch, writes, run: (patch: Row = {}) => invoke(req, actor, { ...input, ...patch }) };
}
afterEach(() => vi.useRealTimers());

function nativeCheckoutHarness(kind: "antigaspi" | "flash") {
  const h = harness({ kind, stock: 0 });
  const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  h.tables.orders = [{ id: orderId, user_id: "caller", restaurant_id: restaurant, checkout_id: attempt, status: "pending_payment", payment_status: "pending" }];
  h.tables.order_special_offer_stock_reservations = [{ order_id: orderId, restaurant_id: restaurant, kind: kind === "antigaspi" ? "anti_waste" : "flash", offer_id: offerId, quantity: 2, restored_at: null }];
  let handler: (request: Request) => Promise<Response>;
  const routing = vi.fn(async () => { throw new Error("TEST_PROVIDER_BOUNDARY_AFTER_NATIVE_PRICING"); });
  const dependencies = {
    Deno: { serve: (fn: typeof handler) => { handler = fn; } }, HttpError,
    buildCorsHeaders: () => ({}), handleCorsPreflight: () => null,
    makeLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
    isCommercialDemoHostRequest: () => false, isCommercialDemoUrl: () => false,
    authenticateRequest: async () => ({ userId: "caller", adminClient: h.db }),
    assertProductionFlowAllowed: async () => {}, assertClientLaunchOpen: async () => {},
    buildRequestMetadata: () => ({}), createRateLimiter: () => ({ consume: async () => {} }),
    requireClientPaymentAttemptId: (id: string) => id,
    getStripeRuntimeForCheckoutKind: () => ({ stripe: {}, mode: "test" }),
    normalizeCheckoutReturnUrl: (url: string) => url, fingerprintPaymentAttemptRequest: async () => "server-fingerprint",
    getEffectiveFeatureFlagSet: async () => new Set(["commandes", "emporter", "card", "anti-gaspi", "ventes-flash"]),
    assertPaymentMethodAllowed: () => {}, buildVerifiedOrderPricing: h.pricing,
    isClientCheckoutRestaurantEligible: () => true,
    resolveMarketplaceRouting: routing, MARKETPLACE_CHECKOUT_KINDS: new Set(["order"]),
    writeAuditLog: async () => {}, errorDiagnostics: () => ({}), errorRecovery: () => ({}),
    jsonResponse: (body: Row, status: number) => Response.json(body, { status }),
  };
  new Function(...Object.keys(dependencies), transpile("supabase/functions/create-checkout/index.ts"))(...Object.values(dependencies));
  const run = (patch: Row = {}) => handler!(new Request("https://tok.test/create-checkout", { method: "POST", body: JSON.stringify({ checkout_kind: "order", payment_method: "card", payment_attempt_id: attempt, return_url: "https://www.thetok.ch/commande/confirmation", items: [{ menu_item_id: kind + "-" + offerId, restaurant_id: restaurant, quantity: 2, metadata: kind === "antigaspi" ? { anti_waste_offer_id: offerId } : { flash_sale_id: offerId } }], order_metadata: { restaurant_id: restaurant, primary_order_id: orderId, tok_connect_expected_total_cents: 1600 }, ...patch }) }));
  return { ...h, runCheckout: run, routing };
}

describe("real create-checkout handler with real native special-offer repricing", () => {
  it.each(["antigaspi", "flash"] as const)("accepts the last two %s portions already debited by native order creation", async (kind) => {
    const h = nativeCheckoutHarness(kind);
    const response = await h.runCheckout();
    expect(await response.json()).toEqual({ error: "TEST_PROVIDER_BOUNDARY_AFTER_NATIVE_PRICING" });
    expect(h.routing).toHaveBeenCalledWith(expect.objectContaining({ grossCents: 1600 }));
    expect(h.offer.quantity_available).toBe(0);
  });
  it.each(["other-user", "restored", "changed-quantity", "wrong-checkout", "paid", "missing-ledger"])("refuses %s reservation credit before any payment routing", async (invalid) => {
    const h = nativeCheckoutHarness("antigaspi");
    const order = h.tables.orders[0], ledger = h.tables.order_special_offer_stock_reservations[0];
    if (invalid === "other-user") order.user_id = "other";
    if (invalid === "restored") ledger.restored_at = "2026-10-17T17:00:00Z";
    if (invalid === "changed-quantity") ledger.quantity = 1;
    if (invalid === "wrong-checkout") order.checkout_id = offerId;
    if (invalid === "paid") order.payment_status = "captured";
    if (invalid === "missing-ledger") h.tables.order_special_offer_stock_reservations = [];
    const response = await h.runCheckout();
    expect((await response.json()).error).toMatch(/^ORDER_RESERVED_STOCK_/);
    expect(h.routing).not.toHaveBeenCalled();
  });
  it("cannot grant reserved stock through metadata in a normal pricing preview", async () => {
    const h = nativeCheckoutHarness("antigaspi");
    await expect(h.pricing({ adminClient: h.db, userId: "caller", restaurantId: restaurant, items: [{ menu_item_id: "antigaspi-" + offerId, quantity: 2, metadata: { anti_waste_offer_id: offerId, reservedQuantity: 2 } }], metadata: { reservedStockCheckoutId: attempt } })).rejects.toThrow("Stock anti-gaspi insuffisant");
  });
  it.each(["disabled", "expired", "price-changed"])("retains native %s checks despite valid reserved stock", async (invalid) => {
    const h = nativeCheckoutHarness("antigaspi");
    if (invalid === "disabled") h.offer.is_active = false;
    if (invalid === "expired") h.offer.available_date = "2026-10-16";
    if (invalid === "price-changed") h.offer.discounted_price = 9;
    const response = await h.runCheckout();
    expect((await response.json()).error).toMatch(invalid === "price-changed" ? /TOK_CONNECT_PRICE_CHANGED_REQUOTE_REQUIRED/ : /anti-gaspi/);
    expect(h.routing).not.toHaveBeenCalled();
  });
});

describe("native atomic special-offer restoration bridge", () => {
  const restore = new Function(transpile("supabase/functions/_shared/order-checkout.ts") + ";return restoreReservedSpecialOfferStock;")();
  it("always uses the order-scoped atomic RPC, even with a stale local restored marker", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { special_offer_stock_restored: true }, error: null });
    const from = vi.fn(() => { throw new Error("Client must not reconstruct reserved quantities"); });
    const input = { adminClient: { rpc, from }, order: { id: attempt }, metadata: { special_offer_stock_restored_at: "stale" } };
    await expect(restore(input)).resolves.toEqual({ special_offer_stock_restored: true });
    expect(rpc).toHaveBeenCalledWith("restore_order_special_offer_stock", { p_order_id: attempt });
    expect(from).not.toHaveBeenCalled();
  });
  it("does not fallback or mark restored after a lost response or invalid RPC result", async () => {
    const failure = new Error("response lost after transaction commit");
    const rpc = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ data: null, error: null });
    const input = { adminClient: { rpc }, order: { id: attempt }, metadata: {} };
    await expect(restore(input)).rejects.toBe(failure);
    await expect(restore(input)).rejects.toThrow("ORDER_STOCK_RESTORE_INVALID_RESULT");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("preserves a database reconciliation message as an Error on payment finalization", async () => {
    const databaseError = { message: "PAID_ORDER_SPECIAL_OFFER_STOCK_RECONCILIATION_REQUIRED", code: "P0001" };
    const finalize = new Function("isDeliveryOrder", transpile("supabase/functions/_shared/order-checkout.ts") + ";findOrdersForSession=async()=>[{id:'order',total_amount:10,metadata:{},status:'pending_payment'}];return finalizePaidOrderCheckout;")(() => false);
    const query = { update: () => query, eq: () => query, select: () => query, maybeSingle: async () => ({ data: null, error: databaseError }) };
    const failure = await finalize({ adminClient: { from: () => query }, session: { metadata: {}, currency: "chf", amount_total: 1000 }, cardBrand: "visa", cardLast4: "4242" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe(databaseError.message);
    expect(failure.cause).toBe(databaseError);
  });
});

describe("MCP native special-offer purchasing", () => {
  it.each(["antigaspi", "flash"] as const)("quotes %s from native database prices and preserves trusted offer metadata through checkout", async (kind) => {
    const h = harness({ kind });
    expect((await h.run({ action: "quote" })).payload.quote).toMatchObject({ total_cents: 1600, checkout_created: false, items: [{ menu_item_id: kind + "-" + offerId, unit_amount_cents: 800 }] });
    expect(h.writes).toEqual([]);
    await h.run(); await h.run(); expect(h.writes).toEqual(["native-order", "stripe"]);
    const bodies = h.fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies.find((body) => body.checkout_kind === "order").items[0].metadata).toMatchObject(kind === "antigaspi" ? { anti_waste_offer_id: offerId } : { flash_sale_id: offerId });
    expect(bodies.filter((body) => body.items && body.total_amount)[0].items[0].metadata).toMatchObject(kind === "antigaspi" ? { anti_waste_offer_id: offerId } : { flash_sale_id: offerId });
    expect(new Headers(h.fetch.mock.calls[0][1].headers).get("authorization")).toBe("Bearer caller-session");
  });
  it("lists native canonical IDs without reserving stock", async () => {
    const h = harness(); const listed = await h.run({ action: "special_offers", kind: "antigaspi" });
    expect(listed.payload).toMatchObject({ action: "special_offers", stock_reserved: false, offers: [{ menu_item_id: "antigaspi-" + offerId, unit_amount_cents: 800, stock_reserved: false }] });
    expect(h.writes).toEqual([]);
  });
  it.each([{ stock: 1 }, { disabled: true }, { otherRestaurant: true }])("refuses unavailable native stock/flags/restaurant %j", async (options) => {
    const h = harness(options); expect((await h.run()).payload).toMatchObject({ ok: false, retry_safe: true }); expect(h.writes).toEqual([]);
  });
  it("rejects forged item metadata/prices, wrong service date and incompatible journeys", async () => {
    const h = harness();
    await expect(h.run({ items: [{ ...h.input.items[0], metadata: { anti_waste_offer_id: attempt } }] })).rejects.toThrow("server_fields_only");
    await expect(h.run({ items: [{ ...h.input.items[0], unit_price: 0 }] })).rejects.toThrow("server_fields_only");
    expect((await h.run({ date: "2026-10-18" })).payload).toMatchObject({ ok: false, retry_safe: true });
    await expect(h.run({ journey: "zero-attente" })).rejects.toThrow("journey_invalid");
    expect(h.writes).toEqual([]);
  });
  it("keeps native stock refusal before Stripe and preserves ambiguous-payment idempotency", async () => {
    const denied = harness({ nativeStockRefusal: true });
    expect((await denied.run()).payload.ok).toBe(false); expect(denied.writes).toEqual([]);
    const lost = harness({ timeout: true });
    expect((await lost.run()).payload.retry_safe).toBe(false); expect((await lost.run()).payload.replayed).toBe(true);
    expect(lost.writes).toEqual(["native-order", "stripe"]);
    await expect(lost.run({ items: [{ menu_item_id: "flash-" + offerId, quantity: 2 }] })).rejects.toThrow("different_body");
  });
});

describe("native offer windows use the restaurant calendar", () => {
  it.each([{ now: "2026-07-15T17:15:00Z", date: "2026-07-15" }, { now: "2026-12-15T18:15:00Z", date: "2026-12-15" }, { now: "2026-07-14T22:15:00Z", date: "2026-07-15", start: "00:00", end: "01:00" }])("prices a live flash window in summer/winter/after midnight %j", async (options) => {
    const h = harness({ ...options, kind: "flash" });
    expect((await h.pricing({ adminClient: h.db, userId: "caller", restaurantId: restaurant, items: [{ menu_item_id: "flash-" + offerId, quantity: 1, metadata: { flash_sale_id: offerId } }], metadata: {} })).total).toBe(8);
  });
  it.each([{ now: "2026-07-15T17:00:00Z", valid: true }, { now: "2026-07-15T18:00:00Z", valid: false }, { now: "2026-07-15T16:59:59Z", valid: false }])("uses inclusive start and exclusive end %j", async ({ now, valid }) => {
    const h = harness({ kind: "flash", now, date: "2026-07-15", end: "20:00" });
    const result = h.pricing({ adminClient: h.db, userId: "caller", restaurantId: restaurant, items: [{ menu_item_id: "flash-" + offerId, quantity: 1, metadata: { flash_sale_id: offerId } }] });
    if (valid) expect((await result).total).toBe(8); else await expect(result).rejects.toThrow("expiree");
  });
  it("rejects invalid dates and cross-midnight windows instead of inventing a next day", async () => {
    for (const patch of [{ sale_date: "2026-02-30" }, { sale_start: "23:00", sale_end: "01:00" }]) {
      const h = harness({ kind: "flash" }); Object.assign(h.offer, patch);
      await expect(h.pricing({ adminClient: h.db, userId: "caller", restaurantId: restaurant, items: [{ menu_item_id: "flash-" + offerId, quantity: 1, metadata: { flash_sale_id: offerId } }] })).rejects.toThrow("Fenetre");
    }
  });
});

describe("special offers in the ChatGPT widget", () => {
  it("opens the real offer list and preserves the chosen canonical item through the quote", () => {
    const projected = projectTokCustomerResult("tok_list_customer_special_offers", { restaurant_id: restaurant }, { ok: true, action: "special_offers", restaurant_id: restaurant, offers: [{ menu_item_id: "antigaspi-" + offerId, name: "Panier serveur", unit_amount_cents: 800, date: "2026-10-17", start_time: "19:00", end_time: "21:00", takeaway_available: true }] });
    const calls: string[] = [];
    const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { runScripts: "dangerously", beforeParse(window) { Object.defineProperty(window, "openai", { value: { toolOutput: projected, callTool: (name: string) => { calls.push(name); }, setWidgetState() {} } }); } });
    try {
      expect(dom.window.document.body.textContent).toContain("Panier serveur");
      Array.from(dom.window.document.querySelectorAll("button")).find((button) => button.textContent === "Choisir cette offre")?.click();
      expect(dom.window.document.querySelector(".tok-cart")?.textContent).toContain("Panier serveur");
      expect(calls).toEqual([]);
    } finally { dom.window.close(); }
  });
});
