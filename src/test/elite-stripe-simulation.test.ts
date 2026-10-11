import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Executes the actual Edge handler. Only external Stripe/auth/database boundaries
// are simulated: no credentials, network request or real charge is used.
const state = vi.hoisted(() => ({
  subscription: {} as any, seat: {} as any, events: [] as string[],
  rpc: vi.fn(), retrieve: vi.fn(), create: vi.fn(), update: vi.fn(),
  access: vi.fn(), audit: vi.fn(), production: vi.fn(), runtime: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/cors.ts", () => ({
  buildCorsHeaders: () => ({}), handleCorsPreflight: () => null,
}));
vi.mock("../../supabase/functions/_shared/auth.ts", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  return {
    HttpError,
    authenticateRequest: async () => ({ userId: "owner", adminClient: { rpc: state.rpc } }),
    requireRestaurantAccess: state.access, assertProductionFlowAllowed: state.production,
    writeAuditLog: state.audit,
    jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
  };
});
vi.mock("../../supabase/functions/_shared/stripe-client.ts", () => ({
  getStripeRuntimeForCheckoutKindAndMode: state.runtime,
}));
let handler: (request: Request) => Promise<Response>;
const source = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const request = (accept = true) => handler(new Request("https://example.test/elite", {
  method: "POST", body: JSON.stringify({ source_restaurant_id: source, restaurant_id: target, accept_additional_billing: accept }),
}));
const calls = (name: string) => state.rpc.mock.calls.filter(([called]) => called === name);
const paidItem = (quantity = 1) => ({ id: "si_extra", quantity, metadata: { tok_establishment_addon: "true" } });

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("Deno", { serve: (callback: typeof handler) => { handler = callback; } });
  for (const mock of [state.rpc, state.retrieve, state.create, state.update, state.access, state.audit, state.production, state.runtime]) mock.mockReset();
  state.events = [];
  state.seat = { id: "durable-request", status: "pending", subscription_id: "db-sub", stripe_subscription_id: "sub_simulated", extra_quantity: 1, monthly_cents: 14900 };
  state.subscription = { id: "sub_simulated", livemode: true, status: "active", cancel_at_period_end: false, pending_update: null,
    items: { data: [{ id: "si_primary", quantity: 1, metadata: {}, price: { product: "prod_simulated", recurring: { interval: "month" }, tax_behavior: "inclusive" } }] } };
  state.runtime.mockReturnValue({ stripe: { subscriptions: { retrieve: state.retrieve }, subscriptionItems: { create: state.create, update: state.update } } });
  state.retrieve.mockImplementation(async () => state.subscription);
  state.create.mockImplementation(async () => {
    state.events.push("paid");
    const item = paidItem(state.seat.extra_quantity);
    state.subscription.items.data.push(item);
    return item;
  });
  state.update.mockImplementation(async (_id, input) => {
    state.events.push("paid");
    const item = state.subscription.items.data.find((item: any) => item.id === "si_extra");
    item.quantity = input.quantity;
    return item;
  });
  state.rpc.mockImplementation(async (name) => {
    state.events.push(name);
    if (name === "prepare_restaurant_seat") return { data: state.seat, error: null };
    if (name === "complete_restaurant_seat") state.seat.status = "completed";
    return { error: null };
  });
  await import("../../supabase/functions/manage-restaurant-establishments/index.ts");
});
afterEach(() => vi.unstubAllGlobals());

describe("Elite with simulated Stripe responses", () => {
  it("grants the seat only after payment, then records the audit", async () => {
    expect((await request()).status).toBe(200);
    expect(state.events).toEqual(["prepare_restaurant_seat", "paid", "sync_restaurant_extra_capacity", "complete_restaurant_seat"]);
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({
      payment_behavior: "error_if_incomplete", proration_behavior: "always_invoice",
      price_data: expect.objectContaining({ currency: "chf", unit_amount: 14900 }),
    }), { idempotencyKey: "tok-elite-seat-durable-request" });
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.access.mock.calls.map(([, id]) => id)).toEqual([source, target]);
  });
  it("uses eleven monthly payments for an annual additional site", async () => {
    state.subscription.items.data[0].price.recurring.interval = "year";
    expect((await request()).status).toBe(200);
    expect(state.create.mock.calls[0][0].price_data).toMatchObject({ unit_amount: 163900, recurring: { interval: "year" } });
  });
  it("attaches an included site without buying anything", async () => {
    state.seat.extra_quantity = 0;
    expect((await request(false)).status).toBe(200);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
  it("requires explicit consent before additional billing", async () => {
    expect((await request(false)).status).toBe(409);
    expect(state.create).not.toHaveBeenCalled();
    expect(calls("complete_restaurant_seat")).toHaveLength(0);
  });
  it.each(["card_declined", "authentication_required", "network_timeout"])("does not grant rights after %s", async error => {
    state.create.mockRejectedValueOnce(new Error(error));
    expect((await request()).status).toBe(502);
    expect(calls("sync_restaurant_extra_capacity")).toHaveLength(0);
    expect(calls("complete_restaurant_seat")).toHaveLength(0);
    expect(state.audit).not.toHaveBeenCalled();
  });
  it.each([
    { status: "past_due" }, { status: "canceled" }, { status: "incomplete" },
    { livemode: false }, { pending_update: {} }, { cancel_at_period_end: true },
  ])("blocks an ineligible Stripe contract: %j", async patch => {
    Object.assign(state.subscription, patch);
    expect((await request()).status).toBe(409);
    expect(state.create).not.toHaveBeenCalled();
    expect(calls("complete_restaurant_seat")).toHaveLength(0);
  });
  it("replays a completed request without a second Stripe call", async () => {
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect(state.retrieve).toHaveBeenCalledOnce();
    expect(state.create).toHaveBeenCalledOnce();
    expect(calls("complete_restaurant_seat")).toHaveLength(1);
  });
  it("recovers a timeout after Stripe accepted payment without buying twice", async () => {
    state.create.mockImplementationOnce(async () => {
      state.subscription.items.data.push(paidItem());
      throw new Error("response lost after Stripe commit");
    });
    expect((await request()).status).toBe(502);
    expect(calls("complete_restaurant_seat")).toHaveLength(0);
    expect((await request()).status).toBe(200);
    expect(state.create).toHaveBeenCalledOnce();
  });
  it("keeps the same idempotency key if Stripe cannot yet return the paid item", async () => {
    state.create.mockRejectedValueOnce(new Error("timeout"));
    expect((await request()).status).toBe(502);
    expect((await request()).status).toBe(200);
    expect(state.create.mock.calls.map(([, options]) => options.idempotencyKey)).toEqual(["tok-elite-seat-durable-request", "tok-elite-seat-durable-request"]);
  });
  it.each(["sync_restaurant_extra_capacity", "complete_restaurant_seat"])("recovers a database failure at %s without a second purchase", async failing => {
    const normal = state.rpc.getMockImplementation()!;
    let fail = true;
    state.rpc.mockImplementation(async (name, ...args) => {
      if (name === failing && fail) { fail = false; return { error: new Error("db unavailable") }; }
      return normal(name, ...args);
    });
    expect((await request()).status).toBe(409);
    expect(state.seat.status).toBe("pending");
    expect((await request()).status).toBe(200);
    expect(state.create).toHaveBeenCalledOnce();
  });
  it("updates the existing add-on instead of creating another", async () => {
    state.subscription.items.data.push(paidItem()); state.seat.extra_quantity = 2;
    expect((await request()).status).toBe(200);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.update).toHaveBeenCalledWith("si_extra", expect.objectContaining({ quantity: 2, payment_behavior: "error_if_incomplete" }), { idempotencyKey: "tok-elite-seat-durable-request" });
  });
  it("does not reach Stripe when access is rejected", async () => {
    state.access.mockRejectedValueOnce(new Error("access denied"));
    expect((await request()).status).not.toBe(200);
    expect(state.runtime).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
