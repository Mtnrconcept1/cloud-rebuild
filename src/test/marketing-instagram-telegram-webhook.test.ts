import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as contract from "../../supabase/functions/_shared/marketing-instagram-review";
import { InstagramReviewError } from "../../supabase/functions/_shared/marketing-instagram-telegram";

const source = readFileSync("supabase/functions/ops-incident-control/index.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function setup(options: { mode?: string; admin?: boolean; env?: Record<string, string> } = {}) {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  const decide = vi.fn().mockResolvedValue({ id: "review-1", status: "approved" });
  const submit = vi.fn().mockResolvedValue({ id: "review-1", status: "pending" });
  const query = { select: () => query, eq: () => query, limit: () => query, maybeSingle: async () => ({ data: options.admin === false ? null : { user_id: "admin" }, error: null }) };
  const client = { from: () => query };
  const auth = vi.fn().mockResolvedValue({ authMode: options.mode || "service_role", adminClient: client });
  const audit = vi.fn();
  const deps: Record<string, unknown> = {
    "../_shared/auth.ts": { HttpError, createAdminClient: () => client, authenticateRequest: auth, writeAuditLog: audit,
      jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }) },
    "../_shared/cors.ts": { buildCorsHeaders: () => ({}), handleCorsPreflight: () => null },
    "../_shared/logging.ts": { makeLogger: () => ({ error: vi.fn() }) },
    "../_shared/marketing-service-auth.ts": { authenticateMarketingRequest: auth },
    "../_shared/marketing-instagram-review.ts": contract,
    "../_shared/marketing-instagram-telegram.ts": { createInstagramReviewStore: () => ({}), decideInstagramReview: decide, submitInstagramReview: submit, InstagramReviewError },
  };
  const env: Record<string, string> = { TELEGRAM_ADMIN_CHAT_ID: "123", TELEGRAM_ADMIN_USER_ID: "456", TELEGRAM_WEBHOOK_SECRET: "webhook-secret", TELEGRAM_BOT_TOKEN: "test-token", ...options.env };
  let handler!: (req: Request) => Promise<Response>;
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true })));
  runInNewContext(compiled, { exports: {}, require: (name: string) => deps[name] || {}, Deno: { env: { get: (name: string) => env[name] }, serve: (callback: typeof handler) => { handler = callback; } },
    Request, Response, Headers, TextDecoder, TextEncoder, AbortController, setTimeout, clearTimeout, fetch, console });
  const request = (body: unknown, headers: Record<string, string> = {}) => handler(new Request("https://project.supabase.co/functions/v1/ops-incident-control", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  return { request, decide, submit, auth, audit };
}
const callback = { update_id: 1, callback_query: { id: "query", data: `igv:a:${"a".repeat(36)}`, from: { id: 456 }, message: { message_id: 42, chat: { id: 123 } } } };
describe("Instagram review webhook trust boundary", () => {
  it("rejects unsigned callbacks before consuming a decision", async () => {
    const app = setup(); expect((await app.request(callback)).status).toBe(401); expect(app.decide).not.toHaveBeenCalled();
  });
  it("rejects a wrong chat or a different user of the same chat", async () => {
    for (const message of [{ ...callback.callback_query, from: { id: 999 } }, { ...callback.callback_query, message: { message_id: 42, chat: { id: 999 } } }]) {
      const app = setup(); expect((await app.request({ ...callback, callback_query: message }, { "x-telegram-bot-api-secret-token": "webhook-secret" })).status).toBe(403); expect(app.decide).not.toHaveBeenCalled();
    }
  });
  it("routes only verified Instagram callbacks to a single persisted decision", async () => {
    const app = setup(); const res = await app.request(callback, { "x-telegram-bot-api-secret-token": "webhook-secret" });
    expect(res.status).toBe(200); expect(app.decide).toHaveBeenCalledExactlyOnceWith({}, callback.callback_query.data, "123", 42, "telegram:456:admin");
  });
  it("keeps incident callbacks on their existing path", async () => {
    const app = setup(); const res = await app.request({ ...callback, callback_query: { ...callback.callback_query, data: "unknown" } }, { "x-telegram-bot-api-secret-token": "webhook-secret" });
    expect(res.status).toBe(400); expect(app.decide).not.toHaveBeenCalled();
  });
  it.each([{ mode: "user_jwt" }, { mode: "scheduler_secret" }, { admin: false }])("requires a delegated service administrator for review submissions: %o", async options => {
    const app = setup(options); const res = await app.request({ action: "instagram_review_submit" }, { "x-marketing-actor-user-id": "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(403); expect(app.submit).not.toHaveBeenCalled();
  });
  it("does not accept a service request without the admin identity", async () => {
    const app = setup(); expect((await app.request({ action: "instagram_review_list" })).status).toBe(403);
  });
});
