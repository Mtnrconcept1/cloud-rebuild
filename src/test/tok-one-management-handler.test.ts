import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as quoteContract from "../../supabase/functions/_shared/tok-one-recurring-quote";

const source = readFileSync("supabase/functions/manage-tok-one-subscription/index.ts", "utf8").replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function harness(options: { apple?: boolean; local?: boolean; unitAmount?: number } = {}) {
  let handler: (req: Request) => Promise<Response>;
  const native = { id: "sub-provider", livemode: true, status: "active", metadata: { user_id: "caller" }, cancel_at_period_end: true,
    items: { data: [{ quantity: 1, current_period_end: 4102444800, price: { currency: "chf", livemode: true, billing_scheme: "per_unit", unit_amount: options.unitAmount ?? 990, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } }], has_more: false } };
  const retrieve = vi.fn(async () => native), update = vi.fn(async () => ({ ...native, cancel_at_period_end: false }));
  const deps = { ...quoteContract, HttpError,
    Deno: { serve: (callback: typeof handler) => { handler = callback; } },
    buildCorsHeaders: () => ({}), handleCorsPreflight: () => null,
    authenticateRequest: async () => ({ userId: "caller", adminClient: {} }), assertProductionFlowAllowed: async () => {},
    createAdminClient: () => ({}), jsonResponse: (body: unknown, status = 200) => Response.json(body, { status }),
    writeAuditLog: vi.fn(async () => {}), makeLogger: () => ({ error() {} }),
    getLatestTokOneSubscription: async () => ({ id: "local-sub", stripe_mode: "live", billing_provider: options.apple ? "apple" : "stripe", status: "active", current_period_end: "2100-01-01T00:00:00Z", stripe_subscription_id: options.local ? null : "sub-provider", plan_id: "plan" }),
    getTokOneStripeRuntime: () => ({ stripe: { subscriptions: { retrieve, update } }, mode: "live", isolatedTokOneKey: true }),
    getTokOneStripeRuntimeForCheckoutSession: () => { throw new Error("unexpected checkout sync"); },
    isTokOneEntitledStatus: (status: string) => status === "active",
    syncTokOneSubscriptionRecord: async () => ({ row: { id: "local-sub", status: "active" } }),
  };
  new Function(...Object.keys(deps), compiled)(...Object.values(deps));
  const call = (body: Record<string, unknown>) => handler(new Request("https://tok.test/manage", { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer test", "content-type": "application/json" } }));
  return { call, retrieve, update };
}
describe("native TOK One management handler", () => {
  it("never converts a misspelled read action into cancellation", async () => {
    const h = harness();
    expect((await h.call({ action: "qoute" })).status).toBe(400);
    expect(h.retrieve).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it("rejects a changed subscription before contacting Stripe", async () => {
    const h = harness();
    expect((await h.call({ action: "cancel", subscription_id: "another" })).status).toBe(409);
    expect(h.retrieve).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it("quotes actual Stripe terms without updating or syncing a subscription", async () => {
    const h = harness(), response = await h.call({ action: "quote", subscription_id: "local-sub" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, quote: { subscription_id: "local-sub", recurring_amount_cents: 990, currency: "CHF", interval: "month", mutation_executed: false } });
    expect(h.retrieve).toHaveBeenCalledWith("sub-provider", { expand: ["items.data.price"] });
    expect(h.update).not.toHaveBeenCalled();
  });
  it("rechecks provider price before resume and refuses changed or unconfirmed terms", async () => {
    const h = harness({ unitAmount: 1200 });
    const body = { action: "resume", subscription_id: "local-sub", confirmed_by_user: true, expected_recurring_amount_cents: 990, expected_currency: "CHF", expected_interval: "month", expected_interval_count: 1 };
    expect((await h.call(body)).status).toBe(409);
    expect(h.update).not.toHaveBeenCalled();
    expect((await h.call({ ...body, expected_recurring_amount_cents: 1200, confirmed_by_user: false })).status).toBe(409);
    expect(h.update).not.toHaveBeenCalled();
    expect((await h.call({ ...body, expected_recurring_amount_cents: 1200 })).status).toBe(200);
    expect(h.update).toHaveBeenCalledExactlyOnceWith("sub-provider", { cancel_at_period_end: false });
  });
  it("keeps old cancellation clients compatible while native notice rules apply", async () => {
    const h = harness();
    expect((await h.call({ action: "cancel" })).status).toBe(200);
    expect(h.update).toHaveBeenCalledWith("sub-provider", { cancel_at_period_end: true });
  });
  it.each([{ apple: true }, { local: true }])("fails closed for non-Stripe billing %j", async (options) => {
    const h = harness(options);
    expect((await h.call({ action: "quote", subscription_id: "local-sub" })).status).toBe(409);
    expect((await h.call({ action: "resume", subscription_id: "local-sub" })).status).toBe(409);
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe("native TOK One checkout price consent", () => {
  async function nativePlanBranch(amount: number, expectedAmount?: number) {
    const checkout = readFileSync("supabase/functions/create-checkout/index.ts", "utf8");
    const marker = '} else if (effectiveKind === "tok-one") {';
    const branch = checkout.slice(checkout.indexOf(marker) + marker.length, checkout.indexOf('} else if (effectiveKind === "campaign")'));
    const code = ts.transpileModule(branch, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const plan = { id: "plan", name: "TOK One", price_monthly: amount, status: "active" };
    const actor = { userId: "caller", adminClient: { from: (table: string) => {
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: table === "user_subscription_plans" ? plan : null, error: null }) }; return query;
    } } };
    const order_metadata = { plan_id: "plan", ...(expectedAmount === undefined ? {} : { expected_plan_id: "plan", expected_recurring_amount_cents: expectedAmount, expected_currency: "CHF", expected_interval: "month", expected_interval_count: 1 }) };
    return new Function("actor", "order_metadata", "HttpError", "assertTokOnePlanPriceAccepted", "isTokOneEntitledStatus", `return (async () => { let auditKind, auditTargetEntityType, auditTargetEntityId, lineItems, sessionMetadata = {}; const normalizedPaymentMethod = 'card', stripeRuntime = { mode: 'test', isolatedTokOneKey: true }; ${code}; return { lineItems, sessionMetadata }; })();`)(actor, order_metadata, HttpError, quoteContract.assertTokOnePlanPriceAccepted, () => false);
  }
  it("refuses a plan price change in the real checkout branch before any Stripe line item exists", async () => {
    await expect(nativePlanBranch(12, 990)).rejects.toThrow("price_changed_requote");
  });
  it("uses the verified amount for native Stripe recurring line items and keeps old callers compatible", async () => {
    expect(await nativePlanBranch(9.90, 990)).toMatchObject({ lineItems: [{ quantity: 1, price_data: { currency: "chf", unit_amount: 990, recurring: { interval: "month" } } }] });
    expect(await nativePlanBranch(9.90)).toMatchObject({ sessionMetadata: { billing_renewal: "auto_monthly", cancellation_notice_days: "3", authoritative_total: "9.90" } });
  });
});
