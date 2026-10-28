import { HttpError, createAdminClient, jsonResponse } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { createPlinkoToken, hashPlinkoToken, normalizePlinkoEmail, pickPlinkoOutcome, readPlinkoRequestId } from "./rules.ts";

const FUNCTION_NAME = "plinko-play";
const ACTIONS = new Set(["start", "status", "play", "claim"]);

async function readPayload(req: Request): Promise<Record<string, unknown>> {
  if (!req.body) throw new HttpError(400, "invalid_request");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) { await reader.cancel(); throw new HttpError(413, "request_too_large"); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(buffer));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new HttpError(400, "invalid_request"); }
}

async function hashIp(req: Request): Promise<string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`plinko:${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const responseHeaders = { ...buildCorsHeaders(req), "Cache-Control": "private, no-store" };
  const preflight = handleCorsPreflight(req, responseHeaders);
  if (preflight) return preflight;
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const payload = await readPayload(req);
    const action = typeof payload.action === "string" ? payload.action : "";
    if (!ACTIONS.has(action)) throw new HttpError(400, "invalid_action");
    const adminClient = createAdminClient();
    const limiter = createRateLimiter(adminClient, FUNCTION_NAME);
    const ip = await hashIp(req);
    // Fail closed if the persistent limiter is unavailable. Store neither raw
    // IPs, bearer tokens nor emails in logs/rate-limit subject identifiers.
    await limiter.consume(`ip:${ip}:${action}`, {
      maxRequests: action === "start" ? 5 : action === "claim" ? 10 : action === "play" ? 30 : 120,
      windowSeconds: 3600,
    });
    await limiter.consume(`global:${action}`, { maxRequests: action === "start" ? 500 : 10_000, windowSeconds: 3600 });
    let token: string | null = null;
    let tokenHash: string;
    if (action === "start") {
      token = createPlinkoToken();
      tokenHash = await hashPlinkoToken(token);
    } else {
      try { tokenHash = await hashPlinkoToken(typeof payload.token === "string" ? payload.token : ""); }
      catch { throw new HttpError(401, "invalid_plinko_session"); }
      await limiter.consume(`session:${tokenHash}:${action}`, { maxRequests: action === "status" ? 120 : 30, windowSeconds: 600 });
    }
    let rpc = "get_plinko_status";
    const params: Record<string, unknown> = { p_token_hash: tokenHash };
    if (action === "start") rpc = "create_plinko_session";
    if (action === "play") {
      rpc = "record_plinko_play";
      try { params.p_request_id = readPlinkoRequestId(req); }
      catch { throw new HttpError(400, "A valid UUID Idempotency-Key is required"); }
      // Client landing position and outcome fields are never consulted.
      params.p_outcome = pickPlinkoOutcome();
      params.p_rng_nonce = crypto.randomUUID();
    }
    if (action === "claim") {
      rpc = "claim_plinko_reward";
      try { params.p_email = normalizePlinkoEmail(payload.email); }
      catch { throw new HttpError(400, "invalid_plinko_email"); }
      if (payload.marketingConsent !== undefined && typeof payload.marketingConsent !== "boolean") throw new HttpError(400, "invalid_marketing_consent");
      params.p_marketing_consent = payload.marketingConsent === true;
    }
    const { data, error } = await adminClient.rpc(rpc, params);
    if (error) {
      const message = String(error.message || "");
      for (const [code, status] of [["invalid_plinko_session", 401], ["plinko_disabled", 403], ["plinko_email_already_used", 409], ["plinko_already_claimed", 409], ["plinko_no_prize", 409]] as const) {
        if (message.includes(code)) throw new HttpError(status, code);
      }
      throw new HttpError(500, "plinko_unavailable");
    }
    if (!data?.ok) throw new HttpError(500, "plinko_unavailable");
    // Claim is durable and support-fulfilled; no receipt or activation is
    // falsely reported when no email delivery or fulfillment has happened.
    return jsonResponse(token ? { ...data, token } : data, 200, responseHeaders);
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof HttpError ? error.message : "plinko_unavailable" }, error instanceof HttpError ? error.status : 500, responseHeaders);
  }
});
