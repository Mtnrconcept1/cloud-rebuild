import {
  HttpError, authenticateRequest, createAdminClient, getEnv, jsonResponse,
  requireUserRole, writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  detectSentinelFindings, type SentinelAudit, type SentinelFinding,
} from "../_shared/tok-sentinel-rules.ts";

const FUNCTION_NAME = "ops-sentinel-control";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_CALLBACK = /^snt:([ar]):([A-Za-z0-9_-]{32})$/;
const APPROVAL_HOURS = 24;
const CONSOLE_ORIGINS = new Set([
  "https://sentinel.thetok.ch",
  "https://tok-sentinel-console.vercel.app", // Verified dedicated Vercel project origin.
]);
const ADMIN_ORIGIN = "https://admin.thetok.ch";
const MAX_BODY = 16_384;

type IncidentRecord = {
  id: string; fingerprint: string; category: string; severity: string; scope: string;
  status: string; report: Record<string, unknown>; evidence_ids: string[];
  occurrence_count: number; approval_expires_at: string | null;
  first_seen_at: string; last_seen_at: string;
};
type Result = Record<string, unknown>;

function asText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function secureRandomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(input: string): Promise<string> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(raw), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isTelegramReady() {
  const chat = getEnv("TELEGRAM_ADMIN_CHAT_ID");
  return Boolean(
    getEnv("TELEGRAM_BOT_TOKEN") && chat && getEnv("TELEGRAM_WEBHOOK_SECRET") &&
    (!chat.startsWith("-") || getEnv("TELEGRAM_ADMIN_USER_ID")),
  );
}
async function readRequest(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(len) && len > MAX_BODY) throw new HttpError(413, "payload_too_large");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "json_body_required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "payload_too_large");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) { bytes.set(chunk, pos); pos += chunk.byteLength; }
  try {
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}
async function requireService(req: Request) {
  const actor = await authenticateRequest(req, { allowServiceRole: true });
  if (actor.authMode !== "service_role") throw new HttpError(403, "sentinel_service_only");
  return actor;
}
async function requireSecurityAdmin(req: Request) {
  const origin = req.headers.get("origin");
  if ((!origin || !CONSOLE_ORIGINS.has(origin)) && origin !== ADMIN_ORIGIN) {
    throw new HttpError(403, "sentinel_admin_origin_required");
  }
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new HttpError(401, "sentinel_admin_session_required");
  const actor = await authenticateRequest(req, { allowServiceRole: false });
  requireUserRole(actor, ["admin"]);
  if (!actor.userId || !actor.userClient || actor.authMode !== "user_jwt") {
    throw new HttpError(403, "sentinel_human_admin_required");
  }
  const mfa = await actor.userClient.auth.mfa.getAuthenticatorAssuranceLevel(auth.slice(7).trim());
  if (mfa.error || mfa.data?.currentLevel !== "aal2") {
    throw new HttpError(403, "sentinel_aal2_required");
  }
  return actor;
}
async function telegramApi(payload: Record<string, unknown>) {
  if (!isTelegramReady()) throw new HttpError(503, "sentinel_telegram_not_configured");
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
  });
  const reply = await res.json().catch(() => ({})) as {
    ok?: boolean; result?: { message_id?: number };
  };
  if (!res.ok || !reply.ok || !Number.isSafeInteger(reply.result?.message_id)) {
    throw new HttpError(502, "sentinel_telegram_delivery_failed");
  }
  return Number(reply.result?.message_id);
}
function telegramMessage(finding: SentinelFinding, id: string): string {
  const functions = finding.functions
    .filter((item) => /^[a-z0-9_.-]{1,64}$/i.test(item)).join(", ").slice(0, 360);
  const lines = [
    "TOK SENTINEL — DECISION DE CONFINEMENT",
    `Severite: ${finding.severity.toUpperCase()}`,
    `Type: ${finding.category}`,
    `Portee: ${finding.scope}`,
    `Incident: ${id}`,
    `Preuves: ${finding.count} evenements, ${finding.evidenceIds.length} references UUID`,
    `Date UTC: ${finding.observedAt}`,
    `Fonctions: ${functions || "non identifiees"}`,
    "Aucune intrusion n'est consideree comme confirmee par ce seul signal.",
    getEnv("TOK_SENTINEL_ENFORCEMENT_ENABLED") === "true"
      ? "Quarantaine soumise a votre validation."
      : "MODE OBSERVATION - aucun confinement executable avant validation technique.",
    "Consultez le rapport detaille et les identifiants de preuves dans TOK Sentinel.",
    "Console securisee (MFA): https://tok-sentinel-console.vercel.app",
    "Sous-domaine prevu: sentinel.thetok.ch (DNS non publie).",
  ];
  return lines.join("\n").slice(0, 3500);
}
async function sendDecisionRequest(incidentId: string, finding: SentinelFinding, token: string) {
  const chatId = getEnv("TELEGRAM_ADMIN_CHAT_ID");
  return telegramApi({
    chat_id: chatId, text: telegramMessage(finding, incidentId),
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        ...(getEnv("TOK_SENTINEL_ENFORCEMENT_ENABLED") === "true"
          ? [[{ text: "Confiner le perimetre", callback_data: `snt:a:${token}` }]]
          : []),
        [{ text: "Refuser (surveillance)", callback_data: `snt:r:${token}` }],
      ],
    },
  });
}
async function registerFinding(finding: SentinelFinding, now: number) {
  const client = createAdminClient();
  // Raw IPs/user identifiers are NEVER written to Sentinel reports or Telegram.
  const correlationHash = await sha256(finding.correlationKey);
  const fingerprint = await sha256([
    finding.category, finding.scope, correlationHash, Math.floor(now / 3_600_000),
  ].join("|"));
  const token = secureRandomToken();
  const cleanFunctions = finding.functions.filter((s) => /^[a-z0-9_.-]{1,64}$/i.test(s));
  const report = {
    summary: finding.summary,
    category: finding.category, scope: finding.scope,
    severity: finding.severity, observed_at: finding.observedAt,
    correlation_hash: correlationHash, evidence_count: finding.count,
    functions: cleanFunctions, proposed_action: "manual_containment",
    analysis: finding.recommended,
    evidence_source: "edge_function_audit_logs",
    sampled: finding.evidenceIds.length < finding.count,
  };
  const { data, error } = await client.from("tok_sentinel_incidents").insert({
    fingerprint, category: finding.category, scope: finding.scope,
    severity: finding.severity, target_id: null,
    status: "awaiting_approval", evidence_ids: finding.evidenceIds,
    report, approval_token_hash: await sha256(token),
    approval_expires_at: new Date(now + APPROVAL_HOURS * 3_600_000).toISOString(),
    decision_chat_id: getEnv("TELEGRAM_ADMIN_CHAT_ID") || null,
  }).select("id").single();
  if (error?.code === "23505") {
    // An existing hourly episode is not spammed repeatedly.
    return { new: false, reason: "deduplicated" };
  }
  if (error || !data?.id) throw new HttpError(503, "sentinel_incident_persist_failed");
  const incidentId = String(data.id);
  const { error: journalError } = await client.from("tok_sentinel_events").insert({
    incident_id: incidentId, event_type: "incident_detected", actor: FUNCTION_NAME,
    evidence: { event_count: finding.count, category: finding.category, scope: finding.scope },
  });
  if (journalError) throw new HttpError(503, "sentinel_journal_unavailable");
  try {
    const messageId = await sendDecisionRequest(incidentId, finding, token);
    const { error: bindingError } = await client.from("tok_sentinel_incidents").update({
      decision_message_id: messageId,
    }).eq("id", incidentId).is("decision_message_id", null);
    if (bindingError) throw new HttpError(503, "sentinel_telegram_message_binding_failed");
    await client.from("tok_sentinel_events").insert({
      incident_id: incidentId, event_type: "telegram_delivery_confirmed", actor: FUNCTION_NAME,
      evidence: { message_id: messageId },
    });
    return { new: true, notified: true, incidentId };
  } catch {
    // Keep evidence for console review. Do not infer successful Telegram delivery.
    await client.from("tok_sentinel_events").insert({
      incident_id: incidentId, event_type: "telegram_delivery_failed", actor: FUNCTION_NAME,
      evidence: { recovery: "inspect_console_and_telegram_configuration" },
    });
    return { new: true, notified: false, incidentId };
  }
}
async function scan(): Promise<Result> {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const client = createAdminClient();
  const { data, error } = await client.from("edge_function_audit_logs")
    .select("id,created_at,function_name,action,status,error_message,actor_user_id,request_metadata")
    .eq("status", "failure").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw new HttpError(503, "sentinel_audit_source_unavailable");
  const findings = detectSentinelFindings((data || []) as SentinelAudit[], Date.now());
  const outcomes = [];
  for (const finding of findings.slice(0, 5)) {
    outcomes.push(await registerFinding(finding, Date.now()));
  }
  return { ok: true, scanned: (data || []).length, truncated: (data || []).length >= 500,
    findings: findings.length, newlyRegistered: outcomes.filter((o) => o.new).length,
    notified: outcomes.filter((o) => o.notified).length,
    // Auto global quarantine disabled until two independent signed witnesses
    // and out-of-band enforcement have been integrated and verified.
    globalAutomaticContainment: "disabled_not_independently_verified" };
}
async function telegramDecision(body: Record<string, unknown>): Promise<Result> {
  const match = TOKEN_CALLBACK.exec(asText(body.data, 80));
  if (!match) throw new HttpError(400, "sentinel_invalid_callback");
  // Fail closed in staging/read-only monitoring: an approval must never
  // silently activate partial production controls before rollout validation.
  if (match[1] === "a" && getEnv("TOK_SENTINEL_ENFORCEMENT_ENABLED") !== "true") {
    throw new HttpError(409, "sentinel_containment_not_armed");
  }
  const chat = asText(body.chatId, 64);
  const actor = asText(body.actor, 150);
  const messageId = Number(body.messageId);
  if (chat !== getEnv("TELEGRAM_ADMIN_CHAT_ID") ||
    !/^telegram:[0-9]+(?::[\w.-]{1,80})?$/.test(actor) ||
    !Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new HttpError(403, "sentinel_invalid_telegram_identity");
  }
  const tokenHash = await sha256(match[2]);
  const client = createAdminClient();
  const { data: incident, error: lookupError } = await client
    .from("tok_sentinel_incidents").select("id")
    .eq("approval_token_hash", tokenHash).eq("status", "awaiting_approval")
    .maybeSingle();
  if (lookupError) throw new HttpError(503, "sentinel_approval_lookup_failed");
  if (!incident?.id) throw new HttpError(409, "sentinel_decision_expired_or_replayed");
  const { data, error } = await client.rpc("tok_sentinel_decide", {
    p_incident_id: incident.id, p_token_hash: tokenHash,
    p_chat_id: chat, p_message_id: messageId, p_actor: actor,
    p_decision: match[1] === "a" ? "approve" : "reject",
  });
  if (error) throw new HttpError(409, "sentinel_decision_expired_or_replayed");
  return data as Result;
}
async function listConsole(): Promise<Result> {
  const client = createAdminClient();
  const [{ data: incidents, error: incidentsError }, { data: containments, error: controlsError }] =
    await Promise.all([
      client.from("tok_sentinel_incidents")
        .select("id,category,severity,scope,status,report,evidence_ids,occurrence_count,approval_expires_at,first_seen_at,last_seen_at")
        .order("last_seen_at", { ascending: false }).limit(60),
      client.from("tok_sentinel_containments")
        .select("id,incident_id,scope,reason,activated_at,released_at,released_by")
        .is("released_at", null).order("activated_at", { ascending: false }).limit(40),
    ]);
  if (incidentsError || controlsError) throw new HttpError(503, "sentinel_console_data_unavailable");
  return { incidents: (incidents || []) as IncidentRecord[], activeContainments: containments || [],
    autoGlobal: false, provider: "supabase", telegramConfigured: isTelegramReady(),
    enforcementArmed: getEnv("TOK_SENTINEL_ENFORCEMENT_ENABLED") === "true" };
}
async function release(body: Record<string, unknown>, actorId: string): Promise<Result> {
  const incidentId = asText(body.incidentId, 40);
  if (!UUID.test(incidentId) || body.confirmation !== `LIBERER ${incidentId}`) {
    throw new HttpError(400, "sentinel_explicit_confirmation_required");
  }
  const { data, error } = await createAdminClient().rpc("tok_sentinel_release", {
    p_incident_id: incidentId, p_actor: `admin:${actorId}`,
  });
  if (error) throw new HttpError(409, "sentinel_release_unavailable");
  return data as Result;
}
Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  const responseHeaders = { ...cors, "Cache-Control": "no-store" };
  let action = "unknown";
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const body = await readRequest(req);
    action = asText(body.action, 40);
    let result: Result;
    if (action === "scan") {
      await requireService(req);
      if (Object.keys(body).length !== 1) throw new HttpError(400, "scan_parameters_forbidden");
      result = await scan();
    } else if (action === "telegram_decision") {
      await requireService(req);
      result = await telegramDecision(body);
    } else if (action === "list") {
      await requireSecurityAdmin(req);
      result = await listConsole();
    } else if (action === "release") {
      const actor = await requireSecurityAdmin(req);
      result = await release(body, actor.userId!);
    } else {
      throw new HttpError(400, "sentinel_unsupported_action");
    }
    await writeAuditLog({ adminClient: createAdminClient(), request: req,
      functionName: FUNCTION_NAME, action, status: "success",
      metadata: { incident_id: asText(body.incidentId, 40) || null },
    }).catch(() => {});
    return jsonResponse({ ok: true, ...result }, 200, responseHeaders);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    // Never leak data, secrets, raw logs or correlation identifiers to the caller.
    const message = status >= 500 ? "sentinel_internal_error" : err instanceof Error ? err.message : "sentinel_error";
    await writeAuditLog({ adminClient: createAdminClient(), request: req,
      functionName: FUNCTION_NAME, action, status: "failure", errorMessage: message,
    }).catch(() => {});
    return jsonResponse({ error: message }, status, responseHeaders);
  }
});
