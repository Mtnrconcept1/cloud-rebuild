import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";

const FUNCTION_NAME = "ops-incident-control";
const SCAN_LOOKBACK_MINUTES = 20;
const APPROVAL_TTL_HOURS = 24;
const REPAIR_CONTEXT_TTL_HOURS = 6;
const MAX_NEW_INCIDENTS_PER_SCAN = 3;
const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const OUTBOUND_TIMEOUT_MS = 15_000;

const INCIDENT_SOURCES = new Set([
  "edge_audit",
  "github_actions",
  "sentry",
  "manual",
  "external",
]);

const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);

const REPAIR_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "executive_summary",
    "probable_cause",
    "user_impact",
    "repair_steps",
    "files_to_inspect",
    "validation_steps",
    "rollback_steps",
    "risk_level",
    "severity",
    "confidence",
    "requires_manual_input",
  ],
  properties: {
    title: { type: "string" },
    executive_summary: { type: "string" },
    probable_cause: { type: "string" },
    user_impact: { type: "string" },
    repair_steps: { type: "array", items: { type: "string" }, maxItems: 10 },
    files_to_inspect: { type: "array", items: { type: "string" }, maxItems: 20 },
    validation_steps: { type: "array", items: { type: "string" }, maxItems: 12 },
    rollback_steps: { type: "array", items: { type: "string" }, maxItems: 10 },
    risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
    severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    requires_manual_input: { type: "boolean" },
  },
};

type Severity = "low" | "medium" | "high" | "critical";
type IncidentSource = "edge_audit" | "github_actions" | "sentry" | "manual" | "external";
type RiskLevel = "low" | "medium" | "high" | "critical";

type RepairPlan = {
  title: string;
  executive_summary: string;
  probable_cause: string;
  user_impact: string;
  repair_steps: string[];
  files_to_inspect: string[];
  validation_steps: string[];
  rollback_steps: string[];
  risk_level: RiskLevel;
  severity: Severity;
  confidence: number;
  requires_manual_input: boolean;
  generated_by?: "openai" | "fallback";
};

type IncidentInput = {
  source: IncidentSource;
  sourceEventId: string | null;
  severity: Severity;
  title: string;
  summary: string;
  technicalDetails: Record<string, unknown>;
  context: Record<string, unknown>;
  fingerprintHint: string | null;
};

type RegisteredIncident = {
  incidentId: string;
  createdNew: boolean;
  status: string;
};

type IncidentRow = {
  id: string;
  fingerprint: string;
  source: IncidentSource;
  source_event_id: string | null;
  severity: Severity;
  status: string;
  title: string;
  summary: string;
  probable_cause: string | null;
  impact: string | null;
  repair_plan: RepairPlan | Record<string, unknown>;
  technical_details: Record<string, unknown>;
  sanitized_context: Record<string, unknown>;
  confidence: number | null;
  risk_level: RiskLevel | null;
  occurrence_count: number;
  approval_expires_at: string | null;
  decision_chat_id: string | null;
  decision_message_id: number | null;
  repair_context_token_hash: string | null;
  repair_context_expires_at: string | null;
  github_run_id: number | null;
  github_branch: string | null;
  github_pr_number: number | null;
  github_pr_url: string | null;
  resolution_summary: string | null;
};

type AuditLogRow = {
  id?: string | number | null;
  function_name?: string | null;
  action?: string | null;
  status?: string | null;
  error_message?: string | null;
  request_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type TelegramCallbackQuery = {
  id: string;
  from?: { id?: number; username?: string; first_name?: string; last_name?: string };
  data?: string;
  message?: { message_id?: number; chat?: { id?: number } };
};

type TelegramUpdate = {
  update_id?: number;
  callback_query?: TelegramCallbackQuery;
};

function getEnv(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function normalizeSource(value: unknown): IncidentSource {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "external";
  return INCIDENT_SOURCES.has(source) ? source as IncidentSource : "external";
}

function normalizeSeverity(value: unknown, fallback: Severity = "medium"): Severity {
  const severity = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SEVERITIES.has(severity) ? severity as Severity : fallback;
}

function severityRank(value: Severity) {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function maxSeverity(left: Severity, right: Severity): Severity {
  return severityRank(left) >= severityRank(right) ? left : right;
}

function normalizeRisk(value: unknown, fallback: RiskLevel = "medium"): RiskLevel {
  const risk = typeof value === "string" ? value.trim().toLowerCase() : "";
  return RISKS.has(risk) ? risk as RiskLevel : fallback;
}

function clampConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.35;
  return Math.max(0, Math.min(1, parsed));
}

function asText(value: unknown, maxLength: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function randomToken(byteLength = 18) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeFingerprintText(value: string) {
  return value
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d{4,}\b/g, "<number>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1400);
}

async function buildFingerprint(input: IncidentInput) {
  const basis = [
    input.source,
    input.title,
    input.fingerprintHint,
    input.technicalDetails.function_name,
    input.technicalDetails.action,
    input.technicalDetails.error_type,
    input.technicalDetails.component,
    input.technicalDetails.route,
  ]
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => normalizeFingerprintText(String(part)))
    .join("|");
  return sha256Hex(basis || `${input.source}|${normalizeFingerprintText(input.title)}`);
}

const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|passwd|api[_-]?key|signature|session|jwt|private[_-]?key|card|payment[_-]?method|client[_-]?secret)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const COMMON_SECRET = /\b(?:sk|rk|pk|whsec|sb_secret|xox[baprs])[_-](?:live[_-]|test[_-])?[A-Za-z0-9_-]{12,}\b/gi;

function sanitizeString(value: string) {
  return value
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(JWT, "[JWT_REDACTED]")
    .replace(COMMON_SECRET, "[SECRET_REDACTED]")
    .replace(EMAIL, "[EMAIL_REDACTED]")
    .slice(0, 1600);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED_DEPTH]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value !== "object") return sanitizeString(String(value));

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
    output[key.slice(0, 120)] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeValue(nested, depth + 1);
  }
  return output;
}

function sanitizeObject(value: unknown) {
  const sanitized = sanitizeValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}

async function readJsonBody(req: Request) {
  const contentType = req.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "content_type_must_be_json");
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new HttpError(413, "request_body_too_large");
  }
  if (!req.body) return {} as Record<string, unknown> & TelegramUpdate;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel("request_body_too_large").catch(() => {});
      throw new HttpError(413, "request_body_too_large");
    }
    chunks.push(value);
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const raw = new TextDecoder().decode(bodyBytes).trim();
  if (!raw) return {} as Record<string, unknown> & TelegramUpdate;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_json_body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "json_object_required");
  }
  return parsed as Record<string, unknown> & TelegramUpdate;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = OUTBOUND_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(504, "outbound_request_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toIsoDate(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function inferFailureSeverity(functionName: string, failureCount: number): Severity {
  const highImpact = /(stripe|payment|checkout|reservation|auth|order|invoice|refund)/i.test(functionName);
  if (failureCount >= 10 && highImpact) return "critical";
  if (failureCount >= 3 || highImpact) return "high";
  return "medium";
}

function fallbackPlan(input: IncidentInput): RepairPlan {
  const evidence = asText(
    input.technicalDetails.error_message || input.summary,
    700,
    "La cause exacte doit être confirmée dans les logs et le code réel du dépôt.",
  );

  return {
    title: `Plan de réparation — ${input.title}`.slice(0, 180),
    executive_summary: input.summary,
    probable_cause: evidence,
    user_impact: "Impact à confirmer par reproduction et comparaison avec les derniers déploiements.",
    repair_steps: [
      "Reproduire l'incident dans un environnement isolé avec les mêmes entrées non sensibles.",
      "Identifier le premier point de défaillance à partir de la stack trace, des logs structurés et de l'historique Git.",
      "Appliquer le correctif minimal conforme aux conventions existantes, sans modification directe de production.",
      "Ajouter ou ajuster les tests couvrant la régression détectée.",
      "Exécuter lint, typecheck, tests et build avant d'ouvrir une pull request.",
    ],
    files_to_inspect: [],
    validation_steps: [
      "Exécuter pnpm run lint.",
      "Exécuter pnpm run typecheck.",
      "Exécuter pnpm run test.",
      "Exécuter pnpm run build.",
      "Vérifier que le comportement fautif n'est plus reproductible et qu'aucune donnée métier n'a été modifiée.",
    ],
    rollback_steps: [
      "Fermer la pull request sans fusion si les contrôles échouent.",
      "Après fusion uniquement, revenir au commit précédent via le workflow GitHub validé si une régression apparaît.",
      "Ne jamais annuler une migration destructive automatiquement.",
    ],
    risk_level: input.severity === "critical" ? "high" : "medium",
    severity: input.severity,
    confidence: 0.35,
    requires_manual_input: true,
    generated_by: "fallback",
  };
}

function normalizePlan(raw: RepairPlan, input: IncidentInput): RepairPlan {
  const normalizeList = (value: unknown, maxItems: number) => Array.isArray(value)
    ? value.map((item) => asText(item, 500)).filter(Boolean).slice(0, maxItems)
    : [];

  return {
    title: asText(raw.title, 180, `Plan de réparation — ${input.title}`),
    executive_summary: asText(raw.executive_summary, 1200, input.summary),
    probable_cause: asText(raw.probable_cause, 1200, "Cause à confirmer."),
    user_impact: asText(raw.user_impact, 900, "Impact à confirmer."),
    repair_steps: normalizeList(raw.repair_steps, 10),
    files_to_inspect: normalizeList(raw.files_to_inspect, 20),
    validation_steps: normalizeList(raw.validation_steps, 12),
    rollback_steps: normalizeList(raw.rollback_steps, 10),
    risk_level: normalizeRisk(raw.risk_level, "medium"),
    severity: maxSeverity(input.severity, normalizeSeverity(raw.severity, input.severity)),
    confidence: clampConfidence(raw.confidence),
    requires_manual_input: raw.requires_manual_input === true,
    generated_by: "openai",
  };
}

async function buildRepairPlan(input: IncidentInput) {
  if (!OPENAI_API_KEY) return fallbackPlan(input);

  try {
    const model = selectTokAiModel("admin_monitor");
    const response = await createOpenAIResponse({
      model,
      input: [
        {
          role: "system",
          content: `Tu es l'agent de diagnostic d'incidents de production de TOK.
Analyse uniquement les preuves fournies. N'invente jamais un fichier, une table, une branche, une migration, un commit ou une cause.
Quand les preuves sont insuffisantes, indique clairement ce qui doit être vérifié.
Propose un correctif minimal, testable et réversible. Toute modification de code doit passer par une branche et une pull request GitHub.
Aucune fusion, migration destructive, écriture en production ou désactivation de sécurité ne peut être proposée automatiquement.
La liste files_to_inspect doit contenir uniquement des chemins littéralement présents dans les preuves fournies ; sinon elle doit rester vide.
Réponds en français opérationnel dans le schéma JSON demandé.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            source: input.source,
            severity: input.severity,
            title: input.title,
            summary: input.summary,
            technical_details: input.technicalDetails,
            sanitized_context: input.context,
          }),
        },
      ],
      maxOutputTokens: 2400,
      jsonSchema: {
        name: "tok_incident_repair_plan",
        description: "Human-approved repair plan for a TOK production incident.",
        schema: REPAIR_PLAN_SCHEMA,
      },
    });

    return normalizePlan(parseStructuredOutput<RepairPlan>(response), input);
  } catch {
    return fallbackPlan(input);
  }
}

function configuredTelegramChatId() {
  return getEnv("TELEGRAM_ADMIN_CHAT_ID");
}

function telegramIsConfigured() {
  return Boolean(getEnv("TELEGRAM_BOT_TOKEN") && configuredTelegramChatId());
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  if (!token) throw new HttpError(503, "telegram_not_configured");

  const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as {
    ok?: boolean;
    description?: string;
    result?: unknown;
  };

  if (!response.ok || result.ok !== true) {
    throw new HttpError(502, `telegram_api_error:${asText(result.description, 220, String(response.status))}`);
  }

  return result.result;
}

async function answerTelegramCallback(callbackQueryId: string, text: string, showAlert = false) {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text.slice(0, 180),
    show_alert: showAlert,
  }).catch(() => {});
}

async function removeTelegramButtons(chatId: string, messageId: number) {
  await telegramApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {});
}

function severityIcon(severity: Severity) {
  if (severity === "critical") return "🔴";
  if (severity === "high") return "🟠";
  if (severity === "medium") return "🟡";
  return "🔵";
}

function buildIncidentTelegramMessage(incidentId: string, input: IncidentInput, plan: RepairPlan) {
  const steps = plan.repair_steps.slice(0, 6)
    .map((step, index) => `${index + 1}. ${escapeHtml(step)}`)
    .join("\n");
  const files = plan.files_to_inspect.length > 0
    ? plan.files_to_inspect.slice(0, 8).map((file) => `• <code>${escapeHtml(file)}</code>`).join("\n")
    : "• Codex identifiera les fichiers à partir du dépôt réel.";

  return [
    `${severityIcon(plan.severity)} <b>TOK — incident ${escapeHtml(plan.severity.toUpperCase())}</b>`,
    "",
    `<b>${escapeHtml(plan.title)}</b>`,
    escapeHtml(plan.executive_summary),
    "",
    `<b>Cause probable</b>\n${escapeHtml(plan.probable_cause)}`,
    "",
    `<b>Impact</b>\n${escapeHtml(plan.user_impact)}`,
    "",
    `<b>Plan proposé</b>\n${steps || "1. Analyse du dépôt et reproduction contrôlée."}`,
    "",
    `<b>Fichiers à vérifier</b>\n${files}`,
    "",
    `<b>Risque :</b> ${escapeHtml(plan.risk_level)} · <b>Confiance :</b> ${Math.round(plan.confidence * 100)} %`,
    `<b>Occurrences :</b> 1 · <b>Source :</b> ${escapeHtml(input.source)}`,
    `<b>Incident :</b> <code>${escapeHtml(incidentId)}</code>`,
    "",
    "L'approbation autorise uniquement la création d'une branche, l'exécution des contrôles et l'ouverture d'une PR. Aucune fusion ni mise en production automatique.",
  ].join("\n").slice(0, 3900);
}

async function sendIncidentApprovalMessage(
  incidentId: string,
  input: IncidentInput,
  plan: RepairPlan,
  approvalToken: string,
) {
  const chatId = configuredTelegramChatId();
  if (!chatId) throw new HttpError(503, "telegram_chat_not_configured");

  const result = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: buildIncidentTelegramMessage(incidentId, input, plan),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Lancer Codex", callback_data: `a:${incidentId}:${approvalToken}` },
        { text: "❌ Refuser", callback_data: `r:${incidentId}:${approvalToken}` },
      ]],
    },
  }) as { message_id?: number } | undefined;

  if (!result?.message_id) throw new HttpError(502, "telegram_message_id_missing");
  return { chatId, messageId: result.message_id };
}

async function sendTelegramStatus(incident: Pick<IncidentRow, "id" | "decision_chat_id">, text: string) {
  const chatId = incident.decision_chat_id || configuredTelegramChatId();
  if (!chatId || !telegramIsConfigured()) return;

  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 3900),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }).catch(() => {});
}

async function appendIncidentEvent(
  incidentId: string,
  eventType: string,
  actor: string,
  payload: Record<string, unknown> = {},
) {
  const client = createAdminClient();
  const { error } = await client.from("ops_incident_events").insert({
    incident_id: incidentId,
    event_type: eventType,
    actor: actor.slice(0, 240),
    payload: sanitizeObject(payload),
  });
  if (error) throw new HttpError(500, error.message);
}

async function getIncident(incidentId: string) {
  const client = createAdminClient();
  const { data, error } = await client
    .from("ops_incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "incident_not_found");
  return data as IncidentRow;
}

async function registerIncident(input: IncidentInput): Promise<RegisteredIncident> {
  const client = createAdminClient();
  const fingerprint = await buildFingerprint(input);
  const { data, error } = await client.rpc("ops_register_incident", {
    p_fingerprint: fingerprint,
    p_source: input.source,
    p_source_event_id: input.sourceEventId,
    p_severity: input.severity,
    p_title: input.title,
    p_summary: input.summary,
    p_technical_details: sanitizeObject(input.technicalDetails),
    p_sanitized_context: sanitizeObject(input.context),
  });

  if (error) throw new HttpError(500, error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.incident_id) throw new HttpError(500, "incident_registration_failed");

  return {
    incidentId: String(row.incident_id),
    createdNew: row.created_new === true,
    status: String(row.incident_status || "detected"),
  };
}

async function analyzeAndNotify(registered: RegisteredIncident, input: IncidentInput) {
  if (!registered.createdNew && registered.status !== "detected") {
    return { notified: false, reason: "deduplicated" };
  }

  const client = createAdminClient();
  const { error: analyzingError } = await client
    .from("ops_incidents")
    .update({ status: "analyzing", failure_reason: null })
    .eq("id", registered.incidentId)
    .in("status", ["detected", "analyzing"]);
  if (analyzingError) throw new HttpError(500, analyzingError.message);

  await appendIncidentEvent(registered.incidentId, "analysis_started", FUNCTION_NAME);
  const plan = await buildRepairPlan(input);

  if (!telegramIsConfigured()) {
    const { error } = await client
      .from("ops_incidents")
      .update({
        status: "detected",
        severity: plan.severity,
        probable_cause: plan.probable_cause,
        impact: plan.user_impact,
        repair_plan: plan,
        confidence: plan.confidence,
        risk_level: plan.risk_level,
        failure_reason: "telegram_not_configured",
      })
      .eq("id", registered.incidentId);
    if (error) throw new HttpError(500, error.message);
    await appendIncidentEvent(registered.incidentId, "notification_deferred", FUNCTION_NAME, {
      reason: "telegram_not_configured",
    });
    return { notified: false, reason: "telegram_not_configured" };
  }

  const approvalToken = randomToken(15);
  const approvalTokenHash = await sha256Hex(approvalToken);
  const approvalExpiresAt = new Date(Date.now() + APPROVAL_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { error: awaitingError } = await client
    .from("ops_incidents")
    .update({
      status: "awaiting_approval",
      severity: plan.severity,
      probable_cause: plan.probable_cause,
      impact: plan.user_impact,
      repair_plan: plan,
      confidence: plan.confidence,
      risk_level: plan.risk_level,
      approval_token_hash: approvalTokenHash,
      approval_expires_at: approvalExpiresAt,
      failure_reason: null,
    })
    .eq("id", registered.incidentId);
  if (awaitingError) throw new HttpError(500, awaitingError.message);

  try {
    const telegram = await sendIncidentApprovalMessage(registered.incidentId, input, plan, approvalToken);
    const { error: messageError } = await client
      .from("ops_incidents")
      .update({
        decision_chat_id: telegram.chatId,
        decision_message_id: telegram.messageId,
      })
      .eq("id", registered.incidentId);
    if (messageError) throw new HttpError(500, messageError.message);

    await appendIncidentEvent(registered.incidentId, "approval_requested", FUNCTION_NAME, {
      expires_at: approvalExpiresAt,
      telegram_message_id: telegram.messageId,
    });
    return { notified: true, reason: "approval_requested" };
  } catch (error) {
    await client.from("ops_incidents").update({
      status: "detected",
      approval_token_hash: null,
      approval_expires_at: null,
      failure_reason: error instanceof Error ? error.message.slice(0, 800) : "telegram_delivery_failed",
    }).eq("id", registered.incidentId);
    throw error;
  }
}

async function createIncident(input: IncidentInput) {
  const sanitized: IncidentInput = {
    ...input,
    title: asText(input.title, 240, "Incident technique TOK"),
    summary: asText(input.summary, 4000, "Erreur technique détectée."),
    technicalDetails: sanitizeObject(input.technicalDetails),
    context: sanitizeObject(input.context),
    fingerprintHint: asText(input.fingerprintHint, 800) || null,
  };
  const registered = await registerIncident(sanitized);
  const notification = await analyzeAndNotify(registered, sanitized);
  return { ...registered, ...notification };
}

function verifyCurrentAuditFailures(rows: AuditLogRow[]) {
  const groups = new Map<string, AuditLogRow[]>();
  for (const row of rows) {
    const functionName = asText(row.function_name, 160);
    const action = asText(row.action, 160, "invoke");
    if (!functionName || functionName === FUNCTION_NAME) continue;
    const timestamp = toIsoDate(row.created_at);
    if (!timestamp) continue;
    const key = `${functionName}::${action}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const active: Array<{ functionName: string; action: string; failures: AuditLogRow[] }> = [];
  for (const [key, group] of groups.entries()) {
    const failures = group
      .filter((row) => row.status === "failure" && asText(row.error_message, 1600))
      .sort((left, right) => Date.parse(String(right.created_at)) - Date.parse(String(left.created_at)));
    if (failures.length === 0) continue;

    const lastFailureAt = Date.parse(String(failures[0].created_at));
    const hasLaterSuccess = group.some((row) => {
      const successAt = Date.parse(String(row.created_at));
      return row.status === "success" && Number.isFinite(successAt) && successAt > lastFailureAt;
    });
    if (hasLaterSuccess) continue;

    const [functionName, action] = key.split("::");
    active.push({ functionName, action, failures });
  }
  return active;
}

async function scanAuditFailures() {
  const client = createAdminClient();
  const since = new Date(Date.now() - SCAN_LOOKBACK_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("edge_function_audit_logs")
    .select("id, function_name, action, status, error_message, request_metadata, created_at")
    .gte("created_at", since)
    .in("status", ["failure", "success"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new HttpError(500, error.message);

  const failures = verifyCurrentAuditFailures((data || []) as AuditLogRow[]).slice(0, MAX_NEW_INCIDENTS_PER_SCAN);
  const incidents = [];
  for (const failure of failures) {
    const latest = failure.failures[0];
    const errorMessage = asText(latest.error_message, 1600, "Erreur Edge Function non détaillée.");
    const input: IncidentInput = {
      source: "edge_audit",
      sourceEventId: latest.id ? String(latest.id) : null,
      severity: inferFailureSeverity(failure.functionName, failure.failures.length),
      title: `Edge Function ${failure.functionName} — ${failure.action}`,
      summary: `${failure.failures.length} échec(s) technique(s) sans succès plus récent sur ${SCAN_LOOKBACK_MINUTES} minutes. ${errorMessage}`,
      technicalDetails: {
        function_name: failure.functionName,
        action: failure.action,
        error_message: errorMessage,
        failure_count: failure.failures.length,
        last_failure_at: latest.created_at,
        verification: "no_success_after_last_failure",
      },
      context: {
        recent_failures: failure.failures.slice(0, 5).map((row) => ({
          created_at: row.created_at,
          error_message: row.error_message,
          request_metadata: row.request_metadata,
        })),
      },
      fingerprintHint: `${failure.functionName}::${failure.action}::${errorMessage}`,
    };
    incidents.push(await createIncident(input));
  }

  return {
    checkedSince: since,
    activeFailures: failures.length,
    incidents,
  };
}

function incidentFromIngestPayload(body: Record<string, unknown>): IncidentInput {
  const context = sanitizeObject(body.context || body.payload || {});
  const errorMessage = asText(body.errorMessage || body.error_message, 1600);
  const errorType = asText(body.errorType || body.error_type, 240);
  const summary = asText(
    body.summary,
    4000,
    errorMessage || "Une source de monitoring a signalé une erreur technique.",
  );

  return {
    source: normalizeSource(body.source),
    sourceEventId: asText(body.eventId || body.event_id, 240) || null,
    severity: normalizeSeverity(body.severity, "medium"),
    title: asText(body.title, 240, "Incident technique TOK"),
    summary,
    technicalDetails: sanitizeObject({
      error_message: errorMessage || null,
      error_type: errorType || null,
      stack: body.stack || null,
      component: body.component || null,
      route: body.route || null,
      release: body.release || null,
    }),
    context,
    fingerprintHint: asText(
      body.fingerprint || body.groupingKey || body.grouping_key,
      800,
      errorType || errorMessage || summary,
    ),
  };
}

function assertSharedSecret(req: Request, headerName: string, envName: string) {
  const provided = req.headers.get(headerName)?.trim() || "";
  const configured = getEnv(envName);
  if (!configured || !safeEqual(provided, configured)) throw new HttpError(401, "unauthorized");
}

// The read-only status route and the scan action are also reachable from the
// project-internal native scanner, which authenticates with the service-role
// key when no dedicated control secret has been provisioned yet. External
// callers keep using x-ops-control-secret.
async function assertScanAuthorized(req: Request) {
  const provided = req.headers.get("x-ops-control-secret")?.trim() || "";
  const configured = getEnv("OPS_CONTROL_SECRET");
  if (configured && safeEqual(provided, configured)) return;

  try {
    const actor = await authenticateRequest(req, { allowServiceRole: true });
    if (actor.isServiceRole) return;
  } catch {
    // The unified 401 below keeps external probing responses uniform.
  }

  throw new HttpError(401, "unauthorized");
}

function assertIngestSecret(req: Request) {
  const ingestProvided = req.headers.get("x-ops-ingest-secret")?.trim() || "";
  const controlProvided = req.headers.get("x-ops-control-secret")?.trim() || "";
  const ingestConfigured = getEnv("OPS_INGEST_SECRET");
  const controlConfigured = getEnv("OPS_CONTROL_SECRET");
  const validIngest = Boolean(ingestConfigured && safeEqual(ingestProvided, ingestConfigured));
  const validControl = Boolean(controlConfigured && safeEqual(controlProvided, controlConfigured));
  if (!validIngest && !validControl) throw new HttpError(401, "unauthorized");
}

function validateTelegramAdmin(callback: TelegramCallbackQuery) {
  const configuredChatId = configuredTelegramChatId();
  const messageChatId = callback.message?.chat?.id === undefined ? "" : String(callback.message.chat.id);
  if (!configuredChatId || !safeEqual(messageChatId, configuredChatId)) {
    throw new HttpError(403, "telegram_chat_forbidden");
  }

  const fallbackPrivateUserId = configuredChatId.startsWith("-") ? "" : configuredChatId;
  const configuredUserId = getEnv("TELEGRAM_ADMIN_USER_ID") || fallbackPrivateUserId;
  const callbackUserId = callback.from?.id === undefined ? "" : String(callback.from.id);
  if (!configuredUserId || !safeEqual(callbackUserId, configuredUserId)) {
    throw new HttpError(403, "telegram_user_forbidden");
  }

  return {
    chatId: configuredChatId,
    userId: callbackUserId,
    actor: `telegram:${callbackUserId}:${asText(callback.from?.username, 80, "admin")}`,
  };
}

async function dispatchCodexRepair(incidentId: string, contextToken: string) {
  const githubToken = getEnv("GITHUB_INCIDENT_TOKEN");
  const repository = getEnv("GITHUB_INCIDENT_REPOSITORY") || "Mtnrconcept1/cloud-rebuild";
  if (!githubToken) throw new HttpError(503, "github_incident_token_not_configured");
  if (!getEnv("OPS_GITHUB_CALLBACK_SECRET")) {
    throw new HttpError(503, "ops_github_callback_secret_not_configured");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new HttpError(500, "invalid_github_incident_repository");
  }

  const response = await fetchWithTimeout(`https://api.github.com/repos/${repository}/dispatches`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "TOK-ops-incident-control",
    },
    body: JSON.stringify({
      event_type: "tok_incident_approved",
      client_payload: {
        incident_id: incidentId,
        context_token: contextToken,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new HttpError(502, `github_dispatch_failed:${response.status}:${sanitizeString(errorBody).slice(0, 300)}`);
  }
}

async function decideIncidentFromTelegram(callback: TelegramCallbackQuery) {
  const callbackData = asText(callback.data, 90);
  const match = /^([ar]):([0-9a-f-]{36}):([A-Za-z0-9_-]{16,32})$/i.exec(callbackData);
  if (!match) throw new HttpError(400, "invalid_callback_data");

  const admin = validateTelegramAdmin(callback);
  const decision = match[1].toLowerCase() === "a" ? "approve" : "reject";
  const incidentId = match[2];
  const approvalToken = match[3];

  if (decision === "approve") {
    if (!getEnv("GITHUB_INCIDENT_TOKEN") || !getEnv("OPS_GITHUB_CALLBACK_SECRET")) {
      await answerTelegramCallback(callback.id, "Codex n'est pas encore configuré.", true);
      throw new HttpError(503, "codex_dispatch_not_configured");
    }
  }

  const approvalTokenHash = await sha256Hex(approvalToken);
  const client = createAdminClient();
  const { data, error } = await client.rpc("ops_decide_incident", {
    p_incident_id: incidentId,
    p_token_hash: approvalTokenHash,
    p_decision: decision,
    p_actor: admin.actor,
  });
  if (error) throw new HttpError(error.code === "42501" ? 403 : 409, error.message);

  await answerTelegramCallback(
    callback.id,
    decision === "approve" ? "Réparation Codex autorisée." : "Réparation refusée.",
  );
  if (callback.message?.message_id) {
    await removeTelegramButtons(admin.chatId, callback.message.message_id);
  }

  const incident = await getIncident(incidentId);
  if (decision === "reject") {
    await sendTelegramStatus(
      incident,
      `❌ <b>Réparation refusée</b>\nIncident <code>${escapeHtml(incidentId)}</code>. Aucune branche ni modification n'a été créée.`,
    );
    return { decision, incidentId, result: data };
  }

  const contextToken = randomToken(24);
  const contextTokenHash = await sha256Hex(contextToken);
  const contextExpiresAt = new Date(Date.now() + REPAIR_CONTEXT_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { error: contextError } = await client.from("ops_incidents").update({
    repair_context_token_hash: contextTokenHash,
    repair_context_expires_at: contextExpiresAt,
    failure_reason: null,
  }).eq("id", incidentId).eq("status", "approved");
  if (contextError) throw new HttpError(500, contextError.message);

  try {
    await dispatchCodexRepair(incidentId, contextToken);
    await appendIncidentEvent(incidentId, "codex_dispatch_requested", admin.actor, {
      context_expires_at: contextExpiresAt,
    });
    await sendTelegramStatus(
      incident,
      `✅ <b>Réparation autorisée</b>\nCodex va travailler sur une branche isolée, exécuter les contrôles et ouvrir une PR pour l'incident <code>${escapeHtml(incidentId)}</code>.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 800) : "github_dispatch_failed";
    await client.from("ops_incidents").update({
      status: "failed",
      failure_reason: message,
    }).eq("id", incidentId);
    await appendIncidentEvent(incidentId, "codex_dispatch_failed", FUNCTION_NAME, { error: message });
    await sendTelegramStatus(
      incident,
      `⚠️ <b>Le lancement Codex a échoué</b>\n${escapeHtml(message)}\nIncident <code>${escapeHtml(incidentId)}</code>. Aucune modification de production n'a eu lieu.`,
    );
    throw error;
  }

  return { decision, incidentId, result: data };
}

async function handleTelegramUpdate(req: Request, body: TelegramUpdate) {
  assertSharedSecret(req, "x-telegram-bot-api-secret-token", "TELEGRAM_WEBHOOK_SECRET");
  if (!body.callback_query) return { ok: true, ignored: true };

  try {
    return await decideIncidentFromTelegram(body.callback_query);
  } catch (error) {
    if (body.callback_query.id) {
      const message = error instanceof HttpError && error.status === 409
        ? "Cette décision a déjà été traitée ou a expiré."
        : "Impossible de traiter cette décision.";
      await answerTelegramCallback(body.callback_query.id, message, true);
    }
    throw error;
  }
}

async function provideRepairContext(body: Record<string, unknown>) {
  const incidentId = asText(body.incidentId || body.incident_id, 60);
  const contextToken = asText(body.token || body.contextToken || body.context_token, 120);
  const githubRunId = Number(body.githubRunId || body.github_run_id || 0);
  if (!incidentId || !contextToken) throw new HttpError(400, "incident_context_parameters_missing");
  if (!Number.isSafeInteger(githubRunId) || githubRunId <= 0) {
    throw new HttpError(400, "github_run_id_invalid");
  }

  const incident = await getIncident(incidentId);
  if (!["approved", "repairing"].includes(incident.status)) {
    throw new HttpError(409, "incident_not_approved");
  }
  if (incident.github_run_id && incident.github_run_id !== githubRunId) {
    throw new HttpError(409, "incident_bound_to_another_github_run");
  }
  if (!incident.repair_context_token_hash || !incident.repair_context_expires_at) {
    throw new HttpError(403, "incident_context_token_missing");
  }
  if (Date.parse(incident.repair_context_expires_at) <= Date.now()) {
    throw new HttpError(403, "incident_context_token_expired");
  }
  const providedHash = await sha256Hex(contextToken);
  if (!safeEqual(providedHash, incident.repair_context_token_hash)) {
    throw new HttpError(403, "incident_context_token_invalid");
  }

  const client = createAdminClient();
  const { data: updated, error } = await client.from("ops_incidents").update({
    status: "repairing",
    github_run_id: githubRunId,
    failure_reason: null,
  }).eq("id", incidentId)
    .in("status", ["approved", "repairing"])
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!updated) throw new HttpError(409, "incident_state_changed");

  await appendIncidentEvent(incidentId, "repair_context_delivered", "github-actions", {
    github_run_id: githubRunId,
  });

  return {
    incident: {
      id: incident.id,
      source: incident.source,
      source_event_id: incident.source_event_id,
      severity: incident.severity,
      title: incident.title,
      summary: incident.summary,
      probable_cause: incident.probable_cause,
      impact: incident.impact,
      risk_level: incident.risk_level,
      confidence: incident.confidence,
      occurrence_count: incident.occurrence_count,
      repair_plan: incident.repair_plan,
      technical_details: incident.technical_details,
      sanitized_context: incident.sanitized_context,
    },
    constraints: {
      repository: getEnv("GITHUB_INCIDENT_REPOSITORY") || "Mtnrconcept1/cloud-rebuild",
      base_branch: "main",
      create_pull_request: true,
      automatic_merge: false,
      automatic_production_deploy: false,
      protected_paths: [
        ".github/**",
        "AGENTS.md",
        "docs/skills/**",
        "supabase/config.toml",
        "supabase/functions/ops-incident-control/**",
      ],
      required_commands: [
        "pnpm run lint",
        "pnpm run typecheck",
        "pnpm run test",
        "pnpm run build",
      ],
      prohibited_actions: [
        "Direct write to production data",
        "Direct push to main",
        "Automatic pull request merge",
        "Secret creation, rotation, or disclosure",
        "Modification of the incident automation control plane",
        "Destructive migration or mutation of an existing migration",
      ],
    },
  };
}

async function updateIncidentFromWorkflow(body: Record<string, unknown>) {
  const incidentId = asText(body.incidentId || body.incident_id, 60);
  const eventStatus = asText(body.status, 40).toLowerCase();
  const runId = Number(body.githubRunId || body.github_run_id || 0);
  if (!incidentId) throw new HttpError(400, "incident_id_missing");
  if (!Number.isSafeInteger(runId) || runId <= 0) throw new HttpError(400, "github_run_id_invalid");

  const statusMap: Record<string, string> = {
    started: "repairing",
    repairing: "repairing",
    pr_open: "pr_open",
    failed: "failed",
    no_changes: "failed",
    resolved: "resolved",
  };
  const allowedFrom: Record<string, string[]> = {
    started: ["approved", "repairing"],
    repairing: ["approved", "repairing"],
    pr_open: ["repairing", "pr_open"],
    failed: ["approved", "repairing", "pr_open", "failed"],
    no_changes: ["approved", "repairing", "failed"],
    resolved: ["pr_open", "resolved"],
  };
  const nextStatus = statusMap[eventStatus];
  if (!nextStatus) throw new HttpError(400, "unsupported_workflow_status");

  const incident = await getIncident(incidentId);
  if (!allowedFrom[eventStatus]?.includes(incident.status)) {
    throw new HttpError(409, "invalid_incident_workflow_transition");
  }
  if (incident.github_run_id && incident.github_run_id !== runId) {
    throw new HttpError(409, "incident_bound_to_another_github_run");
  }

  const branch = asText(body.branch, 240) || null;
  if (branch && !/^codex\/incident-[0-9a-f]{8}-[0-9]+-[0-9]+$/i.test(branch)) {
    throw new HttpError(400, "invalid_repair_branch");
  }

  const prNumber = Number(body.prNumber || body.pr_number || 0) || null;
  const prUrlCandidate = asText(body.prUrl || body.pr_url, 600) || null;
  let prUrl: string | null = null;
  if (prUrlCandidate) {
    const repository = (getEnv("GITHUB_INCIDENT_REPOSITORY") || "Mtnrconcept1/cloud-rebuild").toLowerCase();
    const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(prUrlCandidate);
    const urlPrNumber = match ? Number(match[2]) : 0;
    if (!match || match[1].toLowerCase() !== repository || !Number.isSafeInteger(urlPrNumber)) {
      throw new HttpError(400, "invalid_github_pr_url");
    }
    if (prNumber && urlPrNumber !== prNumber) throw new HttpError(400, "github_pr_number_mismatch");
    prUrl = prUrlCandidate;
  }
  if (eventStatus === "pr_open" && (!branch || !prNumber || !prUrl)) {
    throw new HttpError(400, "pull_request_metadata_missing");
  }

  const message = asText(body.message, 1600) || null;
  const client = createAdminClient();
  const { data: updated, error } = await client.from("ops_incidents").update({
    status: nextStatus,
    github_run_id: runId,
    github_branch: branch || incident.github_branch,
    github_pr_number: prNumber || incident.github_pr_number,
    github_pr_url: prUrl || incident.github_pr_url,
    failure_reason: nextStatus === "failed" ? message || eventStatus : null,
    resolution_summary: nextStatus === "resolved" ? message : incident.resolution_summary,
  }).eq("id", incidentId)
    .in("status", allowedFrom[eventStatus])
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!updated) throw new HttpError(409, "incident_state_changed");

  await appendIncidentEvent(incidentId, `workflow_${eventStatus}`, "github-actions", {
    github_run_id: runId,
    branch,
    pr_number: prNumber,
    pr_url: prUrl,
    message,
  });

  if (eventStatus === "started" || eventStatus === "repairing") {
    await sendTelegramStatus(
      incident,
      `🛠 <b>Codex analyse l'incident</b>
Branche isolée en préparation pour <code>${escapeHtml(incidentId)}</code>.`,
    );
  } else if (eventStatus === "pr_open" && prUrl) {
    await sendTelegramStatus(
      incident,
      `✅ <b>Correctif prêt dans une PR</b>
<a href="${escapeHtml(prUrl)}">Ouvrir la pull request #${escapeHtml(prNumber || "")}</a>
Branche : <code>${escapeHtml(branch || "")}</code>
La fusion reste manuelle et protégée par la CI.`,
    );
  } else if (nextStatus === "failed") {
    await sendTelegramStatus(
      incident,
      `⚠️ <b>Codex n'a pas ouvert de PR</b>
${escapeHtml(message || "Les contrôles ou la génération du correctif ont échoué.")}
Aucune fusion ni mise en production n'a eu lieu.`,
    );
  } else if (nextStatus === "resolved") {
    await sendTelegramStatus(
      incident,
      `✅ <b>Incident résolu</b>
${escapeHtml(message || incident.title)}
Incident <code>${escapeHtml(incidentId)}</code>.`,
    );
  }

  return { incidentId, status: nextStatus, prUrl };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let action = "unknown";

  try {
    if (req.method === "GET") {
      await assertScanAuthorized(req);
      return jsonResponse({
        ok: true,
        service: FUNCTION_NAME,
        telegramConfigured: telegramIsConfigured(),
        githubConfigured: Boolean(getEnv("GITHUB_INCIDENT_TOKEN") && getEnv("OPS_GITHUB_CALLBACK_SECRET")),
        openAiConfigured: Boolean(OPENAI_API_KEY),
      }, 200, cors);
    }

    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const body = await readJsonBody(req);

    if (body.callback_query) {
      action = "telegram_callback";
      const result = await handleTelegramUpdate(req, body);
      await writeAuditLog({
        adminClient: createAdminClient(),
        functionName: FUNCTION_NAME,
        action,
        status: "success",
        request: req,
        metadata: { update_id: body.update_id || null },
      });
      return jsonResponse({ ok: true, ...result }, 200, cors);
    }

    action = asText(body.action, 80).toLowerCase();
    let result: Record<string, unknown>;

    if (action === "scan") {
      await assertScanAuthorized(req);
      result = await scanAuditFailures();
    } else if (action === "ingest") {
      assertIngestSecret(req);
      result = await createIncident(incidentFromIngestPayload(body));
    } else if (action === "repair-context") {
      assertSharedSecret(req, "x-ops-github-secret", "OPS_GITHUB_CALLBACK_SECRET");
      result = await provideRepairContext(body);
    } else if (action === "workflow-update") {
      assertSharedSecret(req, "x-ops-github-secret", "OPS_GITHUB_CALLBACK_SECRET");
      result = await updateIncidentFromWorkflow(body);
    } else {
      throw new HttpError(400, "unsupported_action");
    }

    await writeAuditLog({
      adminClient: createAdminClient(),
      functionName: FUNCTION_NAME,
      action,
      status: "success",
      request: req,
      metadata: {
        incident_id: asText(body.incidentId || body.incident_id, 60) || null,
      },
    });
    return jsonResponse({ ok: true, ...result }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "internal_error";
    log.error("request_failed", { action, status, message: sanitizeString(message).slice(0, 500) });

    await writeAuditLog({
      adminClient: createAdminClient(),
      functionName: FUNCTION_NAME,
      action,
      status: "failure",
      request: req,
      errorMessage: sanitizeString(message).slice(0, 800),
    });

    const publicMessage = status >= 500 ? "internal_error" : sanitizeString(message).slice(0, 240);
    return jsonResponse({ error: publicMessage }, status, cors);
  }
});
