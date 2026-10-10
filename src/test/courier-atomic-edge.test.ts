import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const compiled = ts.transpileModule(readFileSync("supabase/functions/courier-portal/index.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(result: Record<string, unknown> | null, databaseError: Record<string, unknown> | null = null) {
  let handler: (request: Request) => Promise<Response>;
  class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  const rpc = vi.fn().mockResolvedValue({ data: result, error: databaseError });
  const builder = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "courier-from-session", user_id: "signed-user", status: "approved" }, error: null }),
  };
  const client = { rpc, from: vi.fn((table: string) => {
    if (table !== "couriers") throw new Error(`Unexpected nontransactional write/read: ${table}`);
    return builder;
  }) };
  const actor = { userId: "signed-user", roles: ["courier"], adminClient: client };
  const authenticateRequest = vi.fn().mockResolvedValue(actor);
  const triggerNotificationDispatch = vi.fn().mockResolvedValue({ failedChannels: [] });
  const triggerDispatchOrder = vi.fn().mockResolvedValue({ ok: true });
  const enqueueNotification = vi.fn(() => { throw new Error("Acceptance must enqueue in SQL"); });
  const writeAuditLog = vi.fn().mockResolvedValue(undefined);
  const imports: Record<string, unknown> = {
    "../_shared/auth.ts": {
      HttpError, authenticateRequest, createAdminClient: () => client, writeAuditLog,
      requireRole: (current: typeof actor, roles: string[]) => {
        if (!current.roles.some(role => roles.includes(role))) throw new HttpError(403, "Forbidden");
      },
      jsonResponse: (data: unknown, status: number) => new Response(JSON.stringify(data), { status }),
    },
    "../_shared/delivery-dispatch.ts": { triggerDispatchOrder },
    "../_shared/notifications.ts": { triggerNotificationDispatch, enqueueNotification },
    "../_shared/cors.ts": { buildCorsHeaders: () => ({}), handleCorsPreflight: () => null },
    "../_shared/logging.ts": { makeLogger: () => ({ error: vi.fn() }) },
  };
  runInNewContext(compiled, {
    exports: {}, Response, Request, URL, console,
    Deno: { serve: (callback: typeof handler) => { handler = callback; } },
    require: (name: string) => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; },
  });
  return {
    rpc, actor, authenticateRequest, HttpError, triggerNotificationDispatch, triggerDispatchOrder, enqueueNotification, writeAuditLog,
    call: (payload: Record<string, unknown> = {}) => handler(new Request("https://example.test/courier-portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "respond_attempt", attempt_id: "attempt-from-request", decision: "accept", ...payload }),
    })),
  };
}

const accepted = { status: "accepted", changed: true, order_id: "order-from-database", dispatch_job: { id: "job-from-database" }, redispatch: false };

describe("courier acceptance Edge boundary", () => {
  it("forwards the authenticated actor to one transaction and keeps notifications in SQL", async () => {
    const h = harness(accepted);
    const response = await h.call({ p_actor_user_id: "forged-user", courier_id: "forged-courier" });
    expect(response.status).toBe(200);
    expect(h.authenticateRequest).toHaveBeenCalledWith(expect.any(Request), { allowServiceRole: false });
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("respond_courier_dispatch_attempt", {
      p_attempt_id: "attempt-from-request", p_actor_user_id: "signed-user", p_decision: "accept",
    });
    expect(h.enqueueNotification).not.toHaveBeenCalled();
    expect(h.triggerNotificationDispatch).toHaveBeenCalledOnce();
    expect(h.triggerDispatchOrder).not.toHaveBeenCalled();
  });
  it.each(["attempt_already_processed", "attempt_expired", "courier_already_busy"])("preserves a transaction conflict: %s", async error => {
    const h = harness({ error, http_status: 409 });
    expect((await h.call()).status).toBe(409);
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
    expect(h.triggerDispatchOrder).not.toHaveBeenCalled();
  });
  it("does not reveal a foreign attempt", async () => {
    const h = harness({ error: "attempt_not_found", http_status: 404 });
    expect((await h.call()).status).toBe(404);
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and wrong-role callers before the transaction", async () => {
    const h = harness(accepted);
    h.authenticateRequest.mockRejectedValueOnce(new h.HttpError(401, "Unauthorized"));
    expect((await h.call()).status).toBe(401);
    h.actor.roles = ["restaurateur"];
    expect((await h.call()).status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([{ attempt_id: "" }, { decision: "cancel" }])("rejects invalid response input", async payload => {
    const h = harness(accepted);
    expect((await h.call(payload)).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("keeps a successful acceptance when waking delivery workers fails", async () => {
    const h = harness(accepted);
    h.triggerNotificationDispatch.mockRejectedValueOnce(new Error("worker unavailable"));
    expect((await h.call()).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledOnce();
    expect(h.enqueueNotification).not.toHaveBeenCalled();
  });
  it("allows a repeated accepted result without adding notifications", async () => {
    const h = harness({ ...accepted, changed: false });
    expect((await h.call()).status).toBe(200);
    expect(h.enqueueNotification).not.toHaveBeenCalled();
    expect(h.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ changed: false }) }));
  });
  it("redispatches a decline only when the database requests it", async () => {
    const h = harness({ ...accepted, status: "declined", redispatch: true });
    expect((await h.call({ decision: "decline" })).status).toBe(200);
    expect(h.triggerDispatchOrder).toHaveBeenCalledWith({ dispatchJobId: "job-from-database", orderId: "order-from-database", round: 1 });
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
  });
  it("reports a failed transaction without leaking database details or firing side effects", async () => {
    const h = harness(null, { code: "XX000", message: "private database detail" });
    const response = await h.call();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database detail");
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
    expect(h.triggerDispatchOrder).not.toHaveBeenCalled();
  });
});
