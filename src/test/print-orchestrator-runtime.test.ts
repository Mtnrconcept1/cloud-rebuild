import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  order: {} as any, job: {} as any, admin: true, authError: null as Error | null,
  remoteOrders: new Map<string, any>(), claimed: false,
  rpc: vi.fn(), from: vi.fn(), getOrder: vi.fn(), createOrder: vi.fn(),
  signedUrl: vi.fn(), audit: vi.fn(), productionAllowed: vi.fn(),
}));

vi.mock("../../supabase/functions/_shared/cors.ts", () => ({
  buildCorsHeaders: () => ({}), handleCorsPreflight: () => null,
}));
vi.mock("../../supabase/functions/_shared/print/cloudprinter.ts", async () => ({
  CloudprinterError: (await import("../../supabase/functions/_shared/print/request.ts")).CloudprinterError,
  getPrintProvider: () => ({ getOrder: state.getOrder, createOrder: state.createOrder }),
}));
vi.mock("../../supabase/functions/_shared/auth.ts", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  return {
    HttpError,
    authenticateRequest: async () => {
      if (state.authError) throw state.authError;
      return { authMode: "user_jwt", roles: state.admin ? ["admin"] : ["restaurateur"] };
    },
    requireRole: () => { if (!state.admin) throw new HttpError(403, "Forbidden"); },
    assertProductionFlowAllowed: state.productionAllowed,
    writeAuditLog: state.audit,
    jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    createAdminClient: () => ({
      from: state.from, rpc: state.rpc,
      storage: { from: () => ({ createSignedUrl: state.signedUrl }) },
    }),
  };
});

let handler: (request: Request) => Promise<Response>;
let CloudprinterError: typeof import("../../supabase/functions/_shared/print/request.ts").CloudprinterError;
const orderId = "11111111-1111-4111-8111-111111111111";
const reference = `TOKP_${orderId.replace(/-/g, "").toUpperCase()}`;
const remoteOrder = () => ({ state: "submitted", stateCode: "submitted", items: [] });
const request = (body: unknown = {}) => {
  state.claimed = false;
  return handler(new Request("https://example.test/print-orchestrator", {
    method: "POST", body: JSON.stringify(body),
  }));
};
const completions = () => state.rpc.mock.calls.filter(([name]) => name === "complete_print_fulfillment_job").map(([, args]) => args);

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("Deno", { serve: (callback: typeof handler) => { handler = callback; }, env: { get: () => undefined } });
  state.admin = true; state.authError = null;
  state.order = { id: orderId, payment_status: "paid", status: "paid", provider_reference: null,
    print_quote_id: "quote", print_export_id: "export", shipping_address: { country: "CH" } };
  state.job = { id: "job", print_order_id: orderId, job_type: "submit_order", lease_token: "lease",
    attempt_count: 1, max_attempts: 3 };
  state.remoteOrders.clear();
  for (const mock of [state.rpc, state.from, state.getOrder, state.createOrder, state.signedUrl, state.audit, state.productionAllowed]) mock.mockReset();
  state.signedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.test/approved.pdf" }, error: null });
  state.getOrder.mockImplementation(async (key: string) => state.remoteOrders.get(key) || null);
  state.createOrder.mockImplementation(async (order: { reference: string }) => {
    state.remoteOrders.set(order.reference, remoteOrder());
    return { reference: order.reference };
  });
  state.rpc.mockImplementation(async (name: string, args: any) => {
    if (name === "claim_print_fulfillment_jobs") {
      if (state.claimed) return { data: [], error: null };
      state.claimed = true;
      return { data: [state.job], error: null };
    }
    if (name === "prepare_print_fulfillment_submission") {
      if (state.order.submission_started_at) return { data: { action: "reconcile_only" }, error: null };
      state.order.submission_started_at = new Date().toISOString();
      return { data: { action: "create" }, error: null };
    }
    if (name === "finish_print_fulfillment_submission") {
      const previous = state.order.status;
      state.order.status = "submitted";
      const outcome = await state.rpc("complete_print_fulfillment_job", {
        p_job_id: args.p_job_id, p_lease_token: args.p_lease_token, p_status: "completed",
      });
      if (outcome.error) state.order.status = previous; // SQL transaction rollback
      return outcome;
    }
    return { data: { status: args.p_status }, error: null };
  });
  state.from.mockImplementation((table: string) => {
    const query: any = {};
    for (const method of ["select", "eq", "not", "in", "order", "limit"]) query[method] = () => query;
    query.update = (patch: unknown) => { Object.assign(state.order, patch); return query; };
    query.then = (resolve: (result: unknown) => void) => resolve({ data: [], error: null });
    query.maybeSingle = async () => ({ data: table === "print_orders" ? state.order : {
      print_order_id: orderId, item_reference: "item", quantity: 100, provider_product_reference: "flyer", options: [],
    }, error: null });
    query.single = async () => ({ data: table === "print_settings" ? { enabled: true, new_orders_enabled: true }
      : table === "print_exports" ? { status: "approved", production_storage_path: "approved.pdf", md5: "digest" }
      : { id: "quote", expires_at: new Date(Date.now() + 3_600_000).toISOString(), selected_shipping_quote: "quote-hash" }, error: null });
    return query;
  });
  await import("../../supabase/functions/print-orchestrator/index.ts");
  ({ CloudprinterError } = await import("../../supabase/functions/_shared/print/cloudprinter.ts"));
});
afterEach(() => vi.unstubAllGlobals());

describe("print orchestrator runtime integrity", () => {
  it.each(["cancellation_requested", "canceled", "cancelled", "refunded", "refund_pending"])("never submits a paid order already %s", async (status) => {
    state.order.status = status;
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).results[0]).toMatchObject({ status: "canceled" });
    expect(completions()).toEqual([expect.objectContaining({ p_status: "canceled", p_lease_token: "lease" })]);
    expect(state.getOrder).not.toHaveBeenCalled();
    expect(state.createOrder).not.toHaveBeenCalled();
    expect(state.signedUrl).not.toHaveBeenCalled();
  });

  it.each([null, 0, 51, -1, 1.5, true, {}, [], "no", "1.5", "1e2", "", " 2 "])("rejects invalid limit %j before claiming work", async (limit) => {
    expect((await request({ limit })).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });

  it.each([undefined, 1, 50, "2"])("accepts a bounded integer limit %s", async (limit) => {
    expect((await request({ limit })).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("claim_print_fulfillment_jobs", expect.objectContaining({ p_limit: 1 }));
  });

  it("keeps a non-admin out of the fulfillment queue", async () => {
    state.admin = false;
    expect((await request()).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it.each(["existing", "created", "ambiguous"])("does not complete a job when the %s provider transition fails to persist", async (path) => {
    if (path === "existing") state.remoteOrders.set(reference, remoteOrder());
    if (path === "ambiguous") state.createOrder.mockImplementation(async (order: { reference: string }) => {
      state.remoteOrders.set(order.reference, remoteOrder());
      throw new CloudprinterError({ code: "provider_timeout", message: "Timeout", retryable: true, ambiguous: true });
    });
    const originalRpc = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation(async (name, args) => name === "finish_print_fulfillment_submission"
      ? { error: { code: "08006", message: "Database temporarily unavailable" } }
      : originalRpc(name, args));
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).results[0]).toMatchObject({ status: "retrying" });
    expect(completions()).toEqual([expect.objectContaining({ p_status: "retrying", p_error: "PRINT_ORDER_TRANSITION_NOT_PERSISTED" })]);
    expect(state.createOrder).toHaveBeenCalledTimes(path === "existing" ? 0 : 1);
    // The stored remote reference is reconciled on the next lease, never resubmitted.
    state.rpc.mockImplementation(originalRpc);
    state.job.attempt_count = 2;
    state.job.lease_token = "next-lease";
    expect((await request()).status).toBe(200);
    expect(completions().at(-1)).toMatchObject({ p_status: "completed", p_lease_token: "next-lease" });
    expect(state.createOrder).toHaveBeenCalledTimes(path === "existing" ? 0 : 1);
    expect(state.getOrder.mock.calls.every(([key]) => key === reference)).toBe(true);
  });

  it("reconciles a provider-accepted timeout without repeating creation", async () => {
    state.createOrder.mockImplementation(async (order: { reference: string }) => {
      state.remoteOrders.set(order.reference, remoteOrder());
      throw new CloudprinterError({ code: "provider_timeout", message: "Timeout", ambiguous: true, retryable: true });
    });
    const response = await request();
    expect((await response.json()).results[0]).toMatchObject({ status: "completed", reconciledAfterTimeout: true });
    expect(state.createOrder).toHaveBeenCalledOnce();
    expect(state.getOrder).toHaveBeenCalledTimes(2);
    expect(completions()[0]).toMatchObject({ p_status: "completed" });
    state.job.lease_token = "replayed-lease";
    expect((await request()).status).toBe(200);
    expect(state.createOrder).toHaveBeenCalledOnce();
  });

  it("returns 503 when a failed job outcome cannot be persisted", async () => {
    state.getOrder.mockRejectedValue(new Error("Transient provider failure"));
    const originalRpc = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation(async (name, args) => name === "complete_print_fulfillment_job"
      ? { error: { code: "08006", message: "private database detail" } } : originalRpc(name, args));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Erreur interne orchestrateur impression" });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ status: "failure", errorMessage: "PRINT_JOB_OUTCOME_NOT_PERSISTED" }));
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it("recovers a submitted order after completion persistence fails without creating it again", async () => {
    const originalRpc = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation(async (name, args) => name === "complete_print_fulfillment_job"
      ? { error: { code: "08006" } } : originalRpc(name, args));
    expect((await request()).status).toBe(503);
    expect(state.order.status).toBe("paid"); // transition and completion roll back together
    expect(state.createOrder).toHaveBeenCalledOnce();
    state.rpc.mockImplementation(originalRpc);
    state.job.lease_token = "recovered-lease";
    expect((await request()).status).toBe(200);
    expect(completions().at(-1)).toMatchObject({ p_status: "completed", p_lease_token: "recovered-lease" });
    expect(state.createOrder).toHaveBeenCalledOnce();
  });

  it("waits for reconciliation when both creation and the follow-up read time out", async () => {
    state.createOrder.mockImplementation(async (order: { reference: string }) => {
      state.remoteOrders.set(order.reference, remoteOrder());
      state.getOrder.mockRejectedValueOnce(new CloudprinterError({ code: "read_timeout", message: "Timeout", retryable: true }));
      throw new CloudprinterError({ code: "create_timeout", message: "Timeout", ambiguous: true, retryable: true });
    });
    expect((await request()).status).toBe(200);
    expect(completions()[0]).toMatchObject({ p_status: "retrying" });
    state.job.attempt_count = 2;
    state.job.lease_token = "reconciled-lease";
    expect((await request()).status).toBe(200);
    expect(completions().at(-1)).toMatchObject({ p_status: "completed", p_lease_token: "reconciled-lease" });
    expect(state.createOrder).toHaveBeenCalledOnce();
    expect(state.getOrder.mock.calls.every(([key]) => key === reference)).toBe(true);
  });

  it.each([false, true])("honors Cloudprinter retryable=%s", async (retryable) => {
    state.getOrder.mockRejectedValue(new CloudprinterError({ code: "provider_error", message: "Safe error", status: retryable ? 503 : 422, retryable }));
    expect((await request()).status).toBe(200);
    expect(completions()[0]).toMatchObject({ p_status: retryable ? "retrying" : "failed", p_error_code: "provider_error" });
    expect(completions()[0].p_next_attempt_at === null).toBe(!retryable);
  });

  it.each([408, 429, 503, 400])("retries only transient HTTP error %s", async (status) => {
    const { HttpError } = await import("../../supabase/functions/_shared/auth.ts");
    state.getOrder.mockRejectedValue(new HttpError(status, "Safe failure"));
    expect((await request()).status).toBe(200);
    expect(completions()[0]).toMatchObject({ p_status: status === 400 ? "failed" : "retrying" });
  });

  it("does not exceed the configured retry budget", async () => {
    state.job.attempt_count = state.job.max_attempts;
    state.getOrder.mockRejectedValue(new CloudprinterError({ code: "provider_timeout", message: "Timeout", retryable: true }));
    expect((await request()).status).toBe(200);
    expect(completions()[0]).toMatchObject({ p_status: "failed", p_next_attempt_at: null });
  });
  it("can retry a pre-send validation failure without a submission marker", async () => {
    state.signedUrl.mockResolvedValueOnce({ data: null, error: { code: "storage_unavailable" } });
    expect((await request()).status).toBe(200);
    expect(state.order.submission_started_at).toBeUndefined();
    expect(state.createOrder).not.toHaveBeenCalled();
    state.job.attempt_count = 2;
    expect((await request()).status).toBe(200);
    expect(state.createOrder).toHaveBeenCalledOnce();
  });

  it("does not send again when an ambiguous create is still invisible to lookup", async () => {
    state.createOrder.mockRejectedValue(new CloudprinterError({ code: "timeout", message: "Timeout", retryable: true, ambiguous: true }));
    expect((await request()).status).toBe(200);
    state.job.attempt_count = 2;
    expect((await request()).status).toBe(200);
    expect(state.createOrder).toHaveBeenCalledOnce();
    expect(completions().at(-1)).toMatchObject({ p_status: "retrying", p_error: "PRINT_SUBMISSION_RECONCILIATION_REQUIRED" });
  });

  it.each(["canceled", "completed", "failed"])("honors a concurrent order change to %s at the send gate", async (status) => {
    const original = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name, args) => name === "prepare_print_fulfillment_submission"
      ? { data: { action: "stop", status }, error: null } : original(name, args));
    const response = await request();
    expect((await response.json()).results[0].status).toBe(status);
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it("never sends with an expired or replaced lease", async () => {
    const original = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name, args) => name === "prepare_print_fulfillment_submission"
      ? { data: null, error: { code: "40001" } } : original(name, args));
    expect((await request()).status).toBe(200);
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it("reports the persisted canceled outcome when cancellation beats acceptance", async () => {
    const original = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name, args) => name === "finish_print_fulfillment_submission"
      ? { data: { status: "canceled", transition_advanced: false }, error: null } : original(name, args));
    expect((await (await request()).json()).results[0].status).toBe("canceled");
    expect(state.createOrder).toHaveBeenCalledOnce();
  });

  it("does not reserve the next job until the current one finishes", async () => {
    const original = state.rpc.getMockImplementation()!;
    const events: string[] = [];
    let claims = 0;
    state.rpc.mockImplementation(async (name, args) => {
      if (name === "claim_print_fulfillment_jobs") {
        events.push("claim");
        claims += 1;
        return { data: claims <= 2 ? [{ ...state.job, id: `job-${claims}` }] : [], error: null };
      }
      if (name === "complete_print_fulfillment_job") events.push("complete");
      return original(name, args);
    });
    const response = await request({ limit: 2 });
    expect((await response.json()).results).toHaveLength(2);
    expect(events).toEqual(["claim", "complete", "claim", "complete"]);
    expect(state.rpc.mock.calls.filter(([name]) => name === "claim_print_fulfillment_jobs")
      .every(([, args]) => args.p_limit === 1)).toBe(true);
  });

});
