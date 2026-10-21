import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { InstagramReviewError } from "../../supabase/functions/_shared/marketing-instagram-telegram";
import { MarketingContentReviewError } from "../../supabase/functions/_shared/marketing-content-telegram";

const source = readFileSync("supabase/functions/ops-incident-control/index.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function setup(options: { mode?: string; env?: Record<string, string>; decision?: "approved" | "rejected"; decisionError?: boolean } = {}) {
  class HttpError extends Error { constructor(public status: number, message: string, public details?: Record<string, unknown>) { super(message); } }
  class InstagramReviewInputError extends Error {}
  const client = {};
  const store = {};
  const decide = vi.fn().mockResolvedValue({ id: "review-1", status: options.decision || "approved" });
  if (options.decisionError) decide.mockRejectedValue(new MarketingContentReviewError(409, "review_stale_or_decided"));
  const instagramDecide = vi.fn().mockResolvedValue({ id: "instagram-1", status: "approved" });
  const process = vi.fn().mockResolvedValue({ status: "pending", review: { id: "review-1", status: "pending" } });
  const auth = vi.fn().mockResolvedValue({ authMode: options.mode || "service_role", adminClient: client });
  const audit = vi.fn();
  const deps: Record<string, unknown> = {
    "../_shared/auth.ts": { HttpError, createAdminClient: () => client, authenticateRequest: auth, writeAuditLog: audit,
      jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }) },
    "../_shared/cors.ts": { buildCorsHeaders: () => ({}), handleCorsPreflight: () => null },
    "../_shared/logging.ts": { makeLogger: () => ({ error: vi.fn() }) },
    "../_shared/marketing-service-auth.ts": { authenticateMarketingRequest: auth },
    "../_shared/marketing-instagram-review.ts": { InstagramReviewInputError },
    "../_shared/marketing-instagram-telegram.ts": { createInstagramReviewStore: () => ({}), decideInstagramReview: instagramDecide, InstagramReviewError },
    "../_shared/marketing-content-telegram.ts": { createMarketingContentReviewStore: () => store,
      decideMarketingContentReview: decide, processMarketingContentReview: process, MarketingContentReviewError },
  };
  const env: Record<string, string> = {
    TELEGRAM_ADMIN_CHAT_ID: "123", TELEGRAM_ADMIN_USER_ID: "456", TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    TELEGRAM_BOT_TOKEN: "test-token", SUPABASE_URL: "https://project.supabase.co", ...options.env,
  };
  let handler!: (req: Request) => Promise<Response>;
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: true })));
  runInNewContext(compiled, { exports: {}, require: (name: string) => deps[name] || {},
    Deno: { env: { get: (name: string) => env[name] }, serve: (callback: typeof handler) => { handler = callback; } },
    Request, Response, Headers, TextDecoder, TextEncoder, AbortController, DOMException, setTimeout, clearTimeout, fetch, console,
  });
  const request = (body: unknown, headers: Record<string, string> = {}) => handler(new Request("https://project.supabase.co/functions/v1/ops-incident-control", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }));
  return { request, decide, instagramDecide, process, auth, audit, fetch, store };
}
const callback = { update_id: 1, callback_query: { id: "query", data: `mcv:a:${"a".repeat(36)}`, from: { id: 456 }, message: { message_id: 42, chat: { id: 123 } } } };
const signed = { "x-telegram-bot-api-secret-token": "webhook-secret" };

describe("Marketing content Telegram webhook and worker", () => {
  it("rejects unsigned decisions before storage access", async () => {
    const app = setup(); expect((await app.request(callback)).status).toBe(401); expect(app.decide).not.toHaveBeenCalled();
  });
  it("checks both the configured chat and the approving administrator", async () => {
    for (const query of [
      { ...callback.callback_query, from: { id: 999 } },
      { ...callback.callback_query, message: { message_id: 42, chat: { id: 999 } } },
    ]) {
      const app = setup(); expect((await app.request({ ...callback, callback_query: query }, signed)).status).toBe(403);
      expect(app.decide).not.toHaveBeenCalled();
    }
  });
  it.each(["approved", "rejected"] as const)("records a verified %s decision without scheduling or publishing", async decision => {
    const app = setup({ decision });
    const res = await app.request(callback, signed);
    expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ reviewId: "review-1", status: decision });
    expect(app.decide).toHaveBeenCalledExactlyOnceWith(app.store, callback.callback_query.data, "123", 42, "telegram:456:admin");
    expect(app.process).not.toHaveBeenCalled(); expect(app.instagramDecide).not.toHaveBeenCalled();
    expect(app.fetch.mock.calls.map(([url]) => String(url).split("/").at(-1))).toEqual(["answerCallbackQuery", "editMessageReplyMarkup"]);
  });
  it("tells the administrator when an expired, replayed or edited snapshot cannot be approved", async () => {
    const app = setup({ decisionError: true });
    expect((await app.request(callback, signed)).status).toBe(409);
    const answer = JSON.parse(String(app.fetch.mock.calls[0][1].body));
    expect(answer.show_alert).toBe(true); expect(answer.text).toContain("contenu a changé");
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps Instagram comment approvals on their existing handler", async () => {
    const app = setup();
    expect((await app.request({ ...callback, callback_query: { ...callback.callback_query, data: `igv:a:${"a".repeat(36)}` } }, signed)).status).toBe(200);
    expect(app.instagramDecide).toHaveBeenCalledOnce(); expect(app.decide).not.toHaveBeenCalled();
  });
  it.each(["service_role", "scheduler_secret"])("runs one fixed queue worker with an authenticated %s", async mode => {
    const app = setup({ mode });
    expect((await app.request({ action: "content_review_process" })).status).toBe(200);
    expect(app.auth.mock.calls[0][1]).toEqual({ allowSchedulerSecret: true });
    expect(app.process).toHaveBeenCalledExactlyOnceWith(app.store, "123", expect.any(Function), { supabaseUrl: "https://project.supabase.co" });
  });
  it("rejects browser tokens for queue processing", async () => {
    const app = setup({ mode: "user_jwt" });
    expect((await app.request({ action: "content_review_process" })).status).toBe(403); expect(app.process).not.toHaveBeenCalled();
  });
  it("never lets callers choose worker content, target or Telegram destination", async () => {
    const app = setup();
    expect((await app.request({ action: "content_review_process", targetId: "anywhere", chat_id: "999" })).status).toBe(400);
    expect(app.auth).not.toHaveBeenCalled(); expect(app.process).not.toHaveBeenCalled();
  });
  it.each([
    { TELEGRAM_WEBHOOK_SECRET: "" }, { TELEGRAM_BOT_TOKEN: "" },
    { TELEGRAM_ADMIN_CHAT_ID: "-123", TELEGRAM_ADMIN_USER_ID: "" },
  ])("does not claim work without a usable approval destination: %j", async env => {
    const app = setup({ env });
    expect((await app.request({ action: "content_review_process" })).status).toBe(503); expect(app.process).not.toHaveBeenCalled();
  });
  it("distinguishes a definite Telegram refusal from an unknown server failure", async () => {
    for (const [code, certain] of [[429, true], [500, false]] as const) {
      const app = setup();
      app.fetch.mockImplementation(async () => new Response(JSON.stringify({ ok: false, error_code: code, description: "Rejected" }), { status: code }));
      let details: unknown;
      app.process.mockImplementation(async (_store, _chat, send) => {
        try { await send("sendPhoto", { photo: "https://project.supabase.co/photo.jpg", chat_id: "123" }); }
        catch (error) { details = (error as { details?: unknown }).details; }
        return { status: "failed", review: { id: "review-1", status: "failed" } };
      });
      expect((await app.request({ action: "content_review_process" })).status).toBe(200);
      expect(details).toEqual({ telegramRejected: certain });
      expect(app.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "content_review_process", status: "failure" }));
    }
  });
});
