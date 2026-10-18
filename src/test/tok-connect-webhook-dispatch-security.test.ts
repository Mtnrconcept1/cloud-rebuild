import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Row = {
  id: string; endpoint_id: string; partner_id: string; event_type: string;
  payload: Record<string, unknown>; attempts: number; dispatch_lease_token: string; dispatch_lease_expires_at: string;
};
type Endpoint = { id: string; partner_id: string; status: string; url: string; signing_secret: string };
type Result = { processed: number; delivered: number; failed: number; retrying: number; unacknowledged: number; results: { id: string; status: string }[] };
class MockHttpError extends Error { constructor(public status: number, message: string) { super(message); } }

function fixture(count = 1) {
  const deliveries: Row[] = Array.from({ length: count }, (_, index) => ({
    id: "delivery-" + index, endpoint_id: "endpoint-1", partner_id: "partner-1", event_type: "reservation.created",
    payload: { fixture: true }, attempts: 1, dispatch_lease_token: "lease-" + index,
    dispatch_lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  }));
  const endpoint: Endpoint = { id: "endpoint-1", partner_id: "partner-1", status: "active", url: "https://receiver.example.com/hook", signing_secret: "synthetic-test-signing-secret" };
  const queue = [...deliveries];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_tok_connect_webhook_deliveries") return { data: queue.splice(0, Number(args.p_limit)), error: null };
    const outcome = String(args.p_outcome);
    return { data: outcome === "retry" ? "pending" : outcome, error: null };
  });
  const select = vi.fn(() => ({ in: vi.fn(async () => ({ data: [endpoint], error: null })) }));
  const from = vi.fn(() => ({ select }));
  const adminClient = { rpc, from };
  const actor = { isServiceRole: true, authMode: "service_role", roles: [] as string[], adminClient };
  const postPublicWebhook = vi.fn(async () => ({ ok: true, status: 200, body: "ok", truncated: false }));
  const writeAuditLog = vi.fn(async () => {});
  const authenticateRequest = vi.fn(async () => actor);
  const assertTokConnectFeatureEnabled = vi.fn(async () => {});
  let handler: (request: Request) => Promise<Response> = async () => new Response(null, { status: 500 });
  const source = readFileSync(resolve("supabase/functions/tok-connect-webhook-dispatch/index.ts"), "utf8").replace(/^import[^;]+;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const dependencies = {
    Deno: { serve: (fn: typeof handler) => { handler = fn; } },
    buildCorsHeaders: () => ({}), handleCorsPreflight: () => null, authenticateRequest,
    HttpError: MockHttpError, jsonResponse: (data: unknown, status: number) => new Response(JSON.stringify(data), { status }),
    writeAuditLog, buildTokConnectEnvelope: (value: unknown) => value,
    buildTokConnectWebhookHeaders: async () => ({ "X-TOK-Signature": "test-signature" }),
    makeTokConnectRequestId: () => "request-test", assertTokConnectFeatureEnabled, postPublicWebhook, WEBHOOK_TIMEOUT_MS: 10_000,
  };
  const evaluated = new Function(...Object.keys(dependencies), compiled + "\nreturn { dispatchWebhooks, parseLimit }; ")(...Object.values(dependencies)) as {
    dispatchWebhooks: (value: typeof actor, limit: number) => Promise<Result>;
    parseLimit: (value: unknown) => number;
  };
  return { ...evaluated, invoke: (request: Request) => handler(request), actor, deliveries, endpoint, rpc, from, postPublicWebhook, writeAuditLog, authenticateRequest, assertTokConnectFeatureEnabled };
}

describe("webhook dispatcher authorization and leases", () => {
  it.each([
    { isServiceRole: false, authMode: "user_jwt", roles: [] },
    { isServiceRole: false, authMode: "user_jwt", roles: ["admin"] },
    { isServiceRole: true, authMode: "user_jwt", roles: ["admin"] },
  ])("rejects a non-internal actor before accessing the queue: %j", async (flags) => {
    const test = fixture();
    Object.assign(test.actor, flags);
    const response = await test.invoke(new Request("https://edge.example/", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(test.rpc).not.toHaveBeenCalled();
    expect(test.from).not.toHaveBeenCalled();
    expect(test.postPublicWebhook).not.toHaveBeenCalled();
  });

  it.each(["service_role", "scheduler_secret"])("accepts explicitly authorized %s dispatchers", async (authMode) => {
    const test = fixture();
    test.actor.authMode = authMode;
    expect((await test.dispatchWebhooks(test.actor, 1)).delivered).toBe(1);
    expect(test.rpc).toHaveBeenCalledWith("complete_tok_connect_webhook_delivery", expect.objectContaining({ p_lease_token: "lease-0", p_outcome: "delivered" }));
  });

  it("claims bounded batches and consumes each claimed delivery once", async () => {
    const test = fixture(12);
    expect((await test.dispatchWebhooks(test.actor, 12)).delivered).toBe(12);
    expect(test.rpc.mock.calls.filter(([name]) => name === "claim_tok_connect_webhook_deliveries").map(([, args]) => args.p_limit)).toEqual([5, 5, 2]);
    expect(test.postPublicWebhook).toHaveBeenCalledTimes(12);
  });

  it("refuses an endpoint belonging to another partner", async () => {
    const test = fixture();
    test.endpoint.partner_id = "other-partner";
    expect((await test.dispatchWebhooks(test.actor, 1)).failed).toBe(1);
    expect(test.postPublicWebhook).not.toHaveBeenCalled();
  });

  it("never starts HTTP if the lease cannot cover its deadline", async () => {
    const test = fixture();
    test.deliveries[0].dispatch_lease_expires_at = new Date(Date.now() + 5_000).toISOString();
    const result = await test.dispatchWebhooks(test.actor, 1);
    expect(result.unacknowledged).toBe(1);
    expect(result.results[0].status).toBe("lease_lost");
    expect(test.postPublicWebhook).not.toHaveBeenCalled();
    expect(test.rpc.mock.calls.filter(([name]) => name === "complete_tok_connect_webhook_delivery")).toHaveLength(0);
  });

  it("marks redirects terminal and does not retry their target", async () => {
    const test = fixture();
    test.postPublicWebhook.mockResolvedValue({ ok: false, status: 302, body: "", truncated: false });
    expect((await test.dispatchWebhooks(test.actor, 1)).failed).toBe(1);
    expect(test.rpc).toHaveBeenCalledWith("complete_tok_connect_webhook_delivery", expect.objectContaining({ p_outcome: "failed", p_response_status: 302 }));
  });

  it("marks unsafe destinations terminal and sanitizes other network failures", async () => {
    const unsafe = fixture();
    unsafe.postPublicWebhook.mockRejectedValue(new Error("unsafe_webhook_url"));
    expect((await unsafe.dispatchWebhooks(unsafe.actor, 1)).failed).toBe(1);
    const transient = fixture();
    transient.postPublicWebhook.mockRejectedValue(new Error("upstream-secret:private-host"));
    expect((await transient.dispatchWebhooks(transient.actor, 1)).retrying).toBe(1);
    expect(transient.rpc).toHaveBeenCalledWith("complete_tok_connect_webhook_delivery", expect.objectContaining({ p_outcome: "retry", p_error_message: "webhook_request_failed" }));
  });

  it("does not reinterpret a failed database acknowledgement as an HTTP failure", async () => {
    const test = fixture();
    const original = test.rpc.getMockImplementation()!;
    test.rpc.mockImplementation(async (name, args) => {
      if (name === "complete_tok_connect_webhook_delivery") throw new Error("database unavailable");
      return original(name, args);
    });
    const response = await test.invoke(new Request("https://edge.example/", { method: "POST", body: "{\"limit\":1}" }));
    expect(response.status).toBe(503);
    expect(test.postPublicWebhook).toHaveBeenCalledTimes(1);
    expect(test.rpc.mock.calls.filter(([name]) => name === "complete_tok_connect_webhook_delivery")).toHaveLength(1);
    expect(test.rpc).toHaveBeenCalledWith("complete_tok_connect_webhook_delivery", expect.objectContaining({ p_outcome: "delivered" }));
    expect(test.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failure" }));
  });

  it("reports a lost lease without claiming the delivery succeeded", async () => {
    const test = fixture();
    const original = test.rpc.getMockImplementation()!;
    test.rpc.mockImplementation(async (name, args) => name === "complete_tok_connect_webhook_delivery" ? { data: null, error: null } : original(name, args));
    const result = await test.dispatchWebhooks(test.actor, 1);
    expect(result.delivered).toBe(0);
    expect(result.unacknowledged).toBe(1);
  });
});
