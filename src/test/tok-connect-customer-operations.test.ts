import { describe, expect, it, vi } from "vitest";
import type { RequestActor } from "../../supabase/functions/_shared/auth";
import { TOK_CUSTOMER_OPERATION_TOOLS, invokeTokCustomerOperation, validateTokCustomerOperation } from "../../supabase/functions/_shared/tok-connect-customer-operations";

type Json = Record<string, unknown>;
const id = "00000000-0000-4000-8000-000000000001";
const restaurant = "00000000-0000-4000-8000-000000000002";
const subscription = "00000000-0000-4000-8000-000000000003";
const confirm = { confirmed_by_user: true, idempotency_key: "customer-operation:1" };
function harness(options: { owner?: string; flag?: boolean; roles?: string[] } = {}) {
  const filters: Json[] = [];
  const rows: Record<string, Json[]> = { orders: [{ id, restaurant_id: restaurant, user_id: options.owner || "caller" }], reservations: [],
    user_subscription_plans: [{ id, name: "TOK One", status: "active", price_monthly: 9.90 }],
    tok_one_subscriptions: [{ id: subscription, user_id: "caller", status: "active", stripe_mode: "live" }], feature_flags: [{ name: "points-cadeau", is_active: options.flag ?? true }] };
  const userClient = { from(table: string) {
    const filter: Json = {}; filters.push({ table, filter }); let single = false;
    const query = { select: () => query, eq: (key: string, value: unknown) => { filter[key] = value; return query; },
      order: () => query, limit: () => query, maybeSingle: () => { single = true; return query; },
      then: (resolve: (value: unknown) => unknown) => { const matched = rows[table].filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value)); return Promise.resolve(resolve({ data: single ? matched[0] || null : matched, error: null })); },
    }; return query;
  }, rpc: vi.fn(async () => ({ data: [{ can_submit: true, has_verified_consumption: true, already_reviewed: false }], error: null })) };
  const actor = { userId: "caller", roles: options.roles || ["client", "admin"], isServiceRole: false, userClient } as unknown as RequestActor;
  const deps = { authorizeMutation: vi.fn(async () => {}), invokeRpc: vi.fn(async (body: Json) => ({ statusCode: 200, payload: { ok: true, native: body } })), invokeEdge: vi.fn(async (body: Json) => ({ statusCode: 200, payload: { ok: true, native: body } })), mutate: vi.fn(async (_name: string, _args: Json, run: () => Promise<{ statusCode: number; payload: Json }>) => run()) };
  return { actor, deps, filters, rows, userClient, run: (operation: string, args: Json) => invokeTokCustomerOperation(actor, { operation, args }, deps) };
}

describe("targeted advanced customer MCP operations", () => {
  it("publishes closed schemas and no arbitrary role, RPC, price or owner input", () => {
    expect(TOK_CUSTOMER_OPERATION_TOOLS).toHaveLength(11);
    for (const tool of TOK_CUSTOMER_OPERATION_TOOLS) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (const forbidden of ["role", "user_id", "rpc_name", "price", "amount_chf"]) expect(tool.inputSchema.properties).not.toHaveProperty(forbidden);
    }
  });
  it("denies missing identity, service role and restaurant-only accounts", async () => {
    const h = harness({ roles: ["restaurateur"] });
    await expect(h.run("tok_check_my_review_eligibility", { restaurant_id: restaurant })).rejects.toThrow("client_role_required");
    h.actor.roles = ["client"]; h.actor.isServiceRole = true;
    await expect(h.run("tok_check_my_review_eligibility", { restaurant_id: restaurant })).rejects.toThrow("user_required");
    expect(h.deps.invokeRpc).not.toHaveBeenCalled();
  });
  it("requires exact confirmation and valid rating/points/email without coercion", () => {
    expect(() => validateTokCustomerOperation("tok_send_my_gift_points", { recipient_email: "a@b.ch", points: "100", ...confirm })).toThrow("argument_invalid");
    expect(() => validateTokCustomerOperation("tok_send_my_gift_points", { recipient_email: "broken", points: 100, ...confirm })).toThrow("argument_invalid");
    expect(() => validateTokCustomerOperation("tok_claim_my_gift_points", { claim_code: "abc", ...confirm, confirmed_by_user: false })).toThrow("confirmation_required");
    expect(() => validateTokCustomerOperation("tok_claim_my_gift_points", { claim_code: "abc", ...confirm, user_id: "another" })).toThrow("unknown_argument");
  });
  it("checks review eligibility read-only and routes publication solely through native verified RPC", async () => {
    const h = harness();
    await h.run("tok_check_my_review_eligibility", { restaurant_id: restaurant });
    expect(h.userClient.rpc).toHaveBeenCalledWith("get_restaurant_review_submission_state", { p_restaurant_id: restaurant });
    expect(h.deps.authorizeMutation).not.toHaveBeenCalled();
    const args = { restaurant_id: restaurant, rating: 8, service_rating: 7, quality_rating: 9, speed_rating: 8, comment: "Mon avis", ...confirm };
    await h.run("tok_submit_my_verified_review", args);
    expect(h.deps.invokeRpc).toHaveBeenCalledWith({ ...confirm, rpc_name: "submit_verified_review", args: { p_restaurant_id: restaurant, p_rating: 8, p_service_rating: 7, p_quality_rating: 9, p_speed_rating: 8, p_comment: "Mon avis", p_tags: [], p_reservation_id: null, p_order_id: null } });
    h.deps.invokeRpc.mockResolvedValueOnce({ statusCode: 409, payload: { ok: false, native: { error: "review_not_eligible" } } });
    expect(await h.run("tok_submit_my_verified_review", args)).toMatchObject({ statusCode: 409, payload: { ok: false } });
    expect(h.deps.authorizeMutation).toHaveBeenCalledTimes(2);
  });
  it("derives support restaurant from own order and never accepts another customer's resource even for admin", async () => {
    const args = { order_id: id, subject: "Commande en retard", description: "Ma commande n'est pas arrivée.", category: "order_late", ...confirm };
    const h = harness(); await h.run("tok_create_my_support_incident", args);
    expect(h.filters).toContainEqual({ table: "orders", filter: { id, user_id: "caller" } });
    expect(h.deps.invokeRpc).toHaveBeenCalledWith({ ...confirm, rpc_name: "create_support_incident", args: { p_category: "order_late", p_subject: args.subject, p_description: args.description, p_order_id: id, p_reservation_id: null, p_restaurant_id: restaurant, p_priority: "normal", p_metadata: { source: "tok_connect_customer" } } });
    const other = harness({ owner: "another" });
    await expect(other.run("tok_create_my_support_incident", args)).rejects.toThrow("owned_reference_not_found");
    expect(other.deps.invokeRpc).not.toHaveBeenCalled();
    expect(() => validateTokCustomerOperation("tok_create_my_support_incident", { ...args, reservation_id: id })).toThrow("one_owned_reference_required");
  });
  it("cancels only the explicit current subscription via native business service", async () => {
    const h = harness();
    await expect(h.run("tok_cancel_my_tok_one_subscription", { subscription_id: id, ...confirm })).rejects.toThrow("subscription_changed");
    expect(h.deps.invokeEdge).not.toHaveBeenCalled();
    await h.run("tok_cancel_my_tok_one_subscription", { subscription_id: subscription, ...confirm });
    expect(h.deps.invokeEdge).toHaveBeenCalledWith({ ...confirm, capability: "subscription.tok_one.manage", payload: { action: "cancel", subscription_id: subscription } });
    expect(h.filters[0]).toEqual({ table: "tok_one_subscriptions", filter: { user_id: "caller", stripe_mode: "live" } });
  });
  it("quotes without mutation and resumes with exact server-rechecked recurring terms", async () => {
    const h = harness();
    await h.run("tok_quote_my_tok_one_subscription", { subscription_id: subscription });
    expect(h.deps.authorizeMutation).not.toHaveBeenCalled();
    expect(h.deps.invokeEdge).toHaveBeenLastCalledWith({ confirmed_by_user: undefined, idempotency_key: undefined, capability: "subscription.tok_one.quote", payload: { action: "quote", subscription_id: subscription } });
    const terms = { expected_recurring_amount_cents: 990, expected_currency: "CHF", expected_interval: "month", expected_interval_count: 1 };
    await h.run("tok_resume_my_tok_one_subscription", { subscription_id: subscription, ...terms, ...confirm });
    expect(h.deps.invokeEdge).toHaveBeenLastCalledWith({ ...confirm, capability: "subscription.tok_one.manage", payload: { action: "resume", subscription_id: subscription, confirmed_by_user: true, ...terms } });
  });
  it("quotes native plans and creates a stable checkout only after exact recurring consent", async () => {
    const h = harness();
    expect((await h.run("tok_list_tok_one_plans", {})).payload.plans).toEqual([expect.objectContaining({ plan_id: id, recurring_amount_cents: 990, trial_days: 14, automatic_renewal: true, cancellation_notice_days: 3 })]);
    expect((await h.run("tok_quote_tok_one_plan", { plan_id: id })).payload.quote).toMatchObject({ recurring_amount_cents: 990 });
    const args = { plan_id: id, payment_attempt_id: restaurant, expected_recurring_amount_cents: 990, expected_currency: "CHF", expected_interval: "month", expected_interval_count: 1, recurring_terms_accepted: true, ...confirm, idempotency_key: "tok-one:" + restaurant };
    h.deps.invokeEdge.mockResolvedValueOnce({ statusCode: 409, payload: { ok: false, native: { error: "tok_one_plan_price_changed_requote" } } });
    expect(await h.run("tok_checkout_my_tok_one_plan", { ...args, expected_recurring_amount_cents: 980 })).toMatchObject({ statusCode: 409, payload: { ok: false } });
    h.deps.invokeEdge.mockClear();
    h.deps.invokeEdge.mockResolvedValue({ statusCode: 200, payload: { ok: true, native: {}, data: { url: "https://checkout.stripe.com/c/pay/test" } } } as never);
    const first = await h.run("tok_checkout_my_tok_one_plan", args);
    expect(first.payload.subscription_checkout).toMatchObject({ subscription_active: false, checkout_url: "https://checkout.stripe.com/c/pay/test", payment_attempt_id: restaurant });
    await h.run("tok_checkout_my_tok_one_plan", args);
    expect(h.deps.invokeEdge.mock.calls[0]).toEqual(h.deps.invokeEdge.mock.calls[1]);
    expect(h.deps.invokeEdge.mock.calls[0][0]).toMatchObject({ capability: "subscription.tok_one.checkout", payload: { payment_attempt_id: restaurant, checkout_kind: "tok-one", payment_method: "card", order_metadata: { expected_plan_id: id, expected_recurring_amount_cents: 990, expected_currency: "CHF" } } });
    await expect(h.run("tok_checkout_my_tok_one_plan", { ...args, recurring_terms_accepted: false })).rejects.toThrow("confirmation_required");
  });
  it("respects feature flags and sends the exact gift debit through transactional v2 RPC", async () => {
    const args = { recipient_email: "Friend@Example.ch", points: 100, message: "Merci", ...confirm };
    const disabled = harness({ flag: false });
    await expect(disabled.run("tok_send_my_gift_points", args)).rejects.toThrow("feature_disabled");
    expect(disabled.deps.invokeRpc).not.toHaveBeenCalled();
    const h = harness(); await h.run("tok_send_my_gift_points", args);
    expect(h.deps.invokeRpc).toHaveBeenCalledWith({ ...confirm, rpc_name: "send_gift_points_v2", args: { recipient_email_param: "friend@example.ch", points_param: 100, message_param: "Merci" } });
    await h.run("tok_claim_my_gift_points", { claim_code: "CODE-123", ...confirm });
    expect(h.deps.invokeRpc).toHaveBeenLastCalledWith({ ...confirm, rpc_name: "claim_gift_points_v2", args: { claim_code_param: "code-123" } });
  });
  it("preserves native idempotency metadata for review retries after publication", async () => {
    const h = harness();
    h.userClient.rpc.mockResolvedValue({ data: [{ can_submit: false, has_verified_consumption: true, already_reviewed: true }], error: null });
    const args = { restaurant_id: restaurant, rating: 8, service_rating: 8, quality_rating: 8, speed_rating: 8, ...confirm };
    await h.run("tok_submit_my_verified_review", args); await h.run("tok_submit_my_verified_review", args);
    expect(h.userClient.rpc).not.toHaveBeenCalled();
    expect(h.deps.invokeRpc.mock.calls[0]).toEqual(h.deps.invokeRpc.mock.calls[1]);
  });
});
