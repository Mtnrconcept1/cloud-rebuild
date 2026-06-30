import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";

type MonitorAction = "health" | "security" | "costs" | "incidents" | "full_report";

type AdminMonitorResult = {
  title: string;
  health_score: number;
  executive_summary: string;
  cost_summary: string;
  security_alerts: Array<{ label: string; severity: "low" | "medium" | "high" | "critical"; evidence: string }>;
  function_errors: string[];
  critical_tickets: string[];
  abusive_users: string[];
  repeated_incidents_restaurants: string[];
  average_response_time: string;
  human_escalation_rate: string;
  recommended_actions: string[];
};

const FUNCTION_NAME = "ai-admin-monitor";
const FEATURE_NAME = "ai_admin_monitoring";
const ERROR_LOG_LOOKBACK_HOURS = 6;
const SUPPORT_CONTEXT_LOOKBACK_DAYS = 14;
const SECURITY_CONTEXT_LOOKBACK_DAYS = 7;
const ADMIN_MONITOR_OUTPUT_TOKENS: Record<MonitorAction, number> = {
  health: 2600,
  security: 2600,
  costs: 2600,
  incidents: 2600,
  full_report: 4200,
};

type AuditLogRow = {
  function_name?: string | null;
  action?: string | null;
  status?: string | null;
  actor_user_id?: string | null;
  error_message?: string | null;
  request_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type VerifiedFunctionError = {
  functionName: string;
  action: string;
  failureCount: number;
  lastFailureAt: string;
  lastError: string;
  currentnessTest: "no_success_after_last_failure";
};

type RecoveredFunctionError = VerifiedFunctionError & {
  recoveredAt: string;
};

type ApplicationSmokeTest = {
  target: string;
  ok: boolean;
  status: number | null;
  checkedAt: string;
  evidence: string;
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "health_score",
    "executive_summary",
    "cost_summary",
    "security_alerts",
    "function_errors",
    "critical_tickets",
    "abusive_users",
    "repeated_incidents_restaurants",
    "average_response_time",
    "human_escalation_rate",
    "recommended_actions",
  ],
  properties: {
    title: { type: "string" },
    health_score: { type: "number", minimum: 0, maximum: 100 },
    executive_summary: { type: "string" },
    cost_summary: { type: "string" },
    security_alerts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "severity", "evidence"],
        properties: {
          label: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          evidence: { type: "string" },
        },
      },
    },
    function_errors: { type: "array", items: { type: "string" } },
    critical_tickets: { type: "array", items: { type: "string" } },
    abusive_users: { type: "array", items: { type: "string" } },
    repeated_incidents_restaurants: { type: "array", items: { type: "string" } },
    average_response_time: { type: "string" },
    human_escalation_rate: { type: "string" },
    recommended_actions: { type: "array", items: { type: "string" } },
  },
};

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function normalizeAction(raw: unknown): MonitorAction {
  if (raw === "security" || raw === "costs" || raw === "incidents" || raw === "full_report") return raw;
  return "health";
}

function getAdminMonitorMaxOutputTokens(action: MonitorAction) {
  return ADMIN_MONITOR_OUTPUT_TOKENS[action] || ADMIN_MONITOR_OUTPUT_TOKENS.health;
}

function isQuotaAllowed(value: unknown) {
  if (!value || typeof value !== "object") return true;
  return (value as Record<string, unknown>).allowed !== false;
}

function isMissingQuotaRpc(error: { message?: string } | null | undefined) {
  const message = error?.message || "";
  return message.includes("check_restaurant_ai_quota") || message.includes("schema cache");
}

function isMissingOpsRpc(error: { message?: string } | null | undefined) {
  const message = error?.message || "";
  return message.includes("admin_reconcile_marketplace_alerts")
    || message.includes("admin_get_marketplace_alerts")
    || message.includes("schema cache")
    || message.includes("Could not find the function");
}

function toTimeMs(value: unknown) {
  if (typeof value !== "string") return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function auditKey(row: AuditLogRow) {
  return `${row.function_name || "unknown"}::${row.action || "unknown"}`;
}

function isExpectedClientAuditRejection(row: AuditLogRow) {
  return row.function_name === "track-analytics" && row.action === "reject_public_analytics_event";
}

function isOperationalFunctionFailure(row: AuditLogRow) {
  return row.status === "failure" && !isExpectedClientAuditRejection(row);
}

function verifyCurrentFunctionFailures(rows: AuditLogRow[]) {
  const grouped = new Map<string, AuditLogRow[]>();

  for (const row of rows) {
    if (!row.function_name) continue;
    const createdAt = toTimeMs(row.created_at);
    if (!Number.isFinite(createdAt)) continue;
    const key = auditKey(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  const active: VerifiedFunctionError[] = [];
  const recovered: RecoveredFunctionError[] = [];

  for (const group of grouped.values()) {
    const failures = group
      .filter(isOperationalFunctionFailure)
      .sort((a, b) => toTimeMs(b.created_at) - toTimeMs(a.created_at));
    if (failures.length === 0) continue;

    const lastFailure = failures[0];
    const lastFailureMs = toTimeMs(lastFailure.created_at);
    const laterSuccess = group
      .filter((row) => row.status === "success")
      .map((row) => ({ row, createdAt: toTimeMs(row.created_at) }))
      .filter(({ createdAt }) => Number.isFinite(createdAt) && createdAt > lastFailureMs)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    const verified: VerifiedFunctionError = {
      functionName: lastFailure.function_name || "unknown",
      action: lastFailure.action || "unknown",
      failureCount: failures.length,
      lastFailureAt: lastFailure.created_at || "",
      lastError: String(lastFailure.error_message || "Erreur non renseignee").slice(0, 220),
      currentnessTest: "no_success_after_last_failure",
    };

    if (laterSuccess?.row.created_at) {
      recovered.push({ ...verified, recoveredAt: laterSuccess.row.created_at });
    } else {
      active.push(verified);
    }
  }

  return { active, recovered };
}

function formatVerifiedFunctionError(error: VerifiedFunctionError) {
  return [
    `${error.functionName}/${error.action}`,
    `${error.failureCount} echec(s) confirmes sur ${ERROR_LOG_LOOKBACK_HOURS}h`,
    `dernier signal ${error.lastFailureAt}`,
    error.lastError,
  ].join(" - ");
}

function buildVerificationSummary(activeErrors: VerifiedFunctionError[], recoveredErrors: RecoveredFunctionError[]) {
  if (activeErrors.length === 0) {
    return `Verification active OK: aucun echec Edge Function actuel sur les ${ERROR_LOG_LOOKBACK_HOURS} dernieres heures. ${recoveredErrors.length} ancien(s) echec(s) ont ete ecartes car un succes plus recent prouve la recuperation.`;
  }

  return `Verification active: ${activeErrors.length} fonction(s) restent en echec sur les ${ERROR_LOG_LOOKBACK_HOURS} dernieres heures apres test de recuperation; ${recoveredErrors.length} echec(s) anciens ont ete ecartes.`;
}

function getApplicationSmokeTestUrl() {
  return Deno.env.get("APP_BASE_URL")
    || Deno.env.get("SITE_URL")
    || Deno.env.get("PUBLIC_SITE_URL")
    || "https://cloud-rebuild-recovered.vercel.app/";
}

async function runApplicationSmokeTest(): Promise<ApplicationSmokeTest> {
  const target = getApplicationSmokeTestUrl();
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(target, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "TOK ai-admin-monitor" },
    });

    return {
      target,
      ok: response.ok,
      status: response.status,
      checkedAt,
      evidence: response.ok ? "frontend_reachable" : "frontend_unhealthy_status",
    };
  } catch (error) {
    return {
      target,
      ok: false,
      status: null,
      checkedAt,
      evidence: String(error instanceof Error ? error.message : error).slice(0, 180),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRestaurantQuota(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  restaurantId: string,
) {
  const { data, error } = await actor.adminClient.rpc("check_restaurant_ai_quota", {
    p_restaurant_id: restaurantId,
    p_feature: FEATURE_NAME,
    p_units: 1,
  });

  if (!error) return data;
  if (!isMissingQuotaRpc(error)) throw new HttpError(503, error.message);

  return {
    allowed: true,
    feature: FEATURE_NAME,
    degraded: true,
    reason: "quota_rpc_unavailable",
  };
}

function estimateCostChf(model: string, inputTokens = 0, outputTokens = 0) {
  return estimateOpenAITextCostChf(model, inputTokens, outputTokens);
}

function toHealthScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 75;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" | "critical" {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function rowLabel(row: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function buildTicketLine(row: Record<string, unknown>) {
  const title = rowLabel(row, ["title", "subject", "category"], "Ticket critique");
  const priority = rowLabel(row, ["priority", "status"], "priorite non renseignee");
  const updatedAt = rowLabel(row, ["updated_at", "created_at"], "date non renseignee");
  return `${title} - ${priority} - ${updatedAt}`.slice(0, 220);
}

function buildRepeatedRestaurantLines(rows: Array<Record<string, unknown>>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const restaurantId = typeof row.restaurant_id === "string" ? row.restaurant_id : "";
    if (!restaurantId) continue;
    counts.set(restaurantId, (counts.get(restaurantId) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([restaurantId, count]) => `${restaurantId} - ${count} incidents ouverts sur ${SUPPORT_CONTEXT_LOOKBACK_DAYS} jours`);
}

function buildFallbackAdminMonitorResult(input: {
  action: MonitorAction;
  aiCost: number;
  aiFailureRatio7d: number;
  usageRows7d: Array<Record<string, unknown>>;
  verifiedFunctionErrorLines: string[];
  verificationSummary: string;
  applicationSmokeTest: ApplicationSmokeTest | null;
  incidents: Array<Record<string, unknown>>;
  aiTickets: Array<Record<string, unknown>>;
  securityEvents: Array<Record<string, unknown>>;
  marketplaceAlerts: Array<Record<string, unknown>>;
}): AdminMonitorResult {
  const criticalTickets = [
    ...input.aiTickets.filter((row) => row.status === "escalated" || row.priority === "urgent" || row.priority === "high"),
    ...input.incidents.filter((row) => row.priority === "urgent" || row.priority === "high"),
  ].slice(0, 12);
  const securityAlerts = input.securityEvents.slice(0, 10).map((row) => ({
    label: rowLabel(row, ["signal", "event_type"], "Signal securite"),
    severity: normalizeSeverity(row.severity),
    evidence: `Risque ${String(row.risk_score || "-")} - ${rowLabel(row, ["created_at"], "date non renseignee")}`,
  }));

  if (input.applicationSmokeTest && !input.applicationSmokeTest.ok) {
    securityAlerts.unshift({
      label: "Smoke test applicatif KO",
      severity: "high",
      evidence: `${input.applicationSmokeTest.target} - ${input.applicationSmokeTest.status || "timeout"} - ${input.applicationSmokeTest.evidence}`,
    });
  }

  if (input.aiFailureRatio7d >= 0.25 && input.usageRows7d.length >= 10) {
    securityAlerts.push({
      label: "Ratio d'echec IA eleve",
      severity: "medium",
      evidence: `${Math.round(input.aiFailureRatio7d * 100)}% d'echecs sur ${input.usageRows7d.length} appels IA recents.`,
    });
  }

  const healthScore = clampScore(
    92
      - input.verifiedFunctionErrorLines.length * 12
      - securityAlerts.filter((alert) => alert.severity === "critical").length * 18
      - securityAlerts.filter((alert) => alert.severity === "high").length * 10
      - Math.min(12, criticalTickets.length * 3)
      - (input.applicationSmokeTest && !input.applicationSmokeTest.ok ? 12 : 0),
  );
  const recommendedActions = [
    input.verifiedFunctionErrorLines.length > 0
      ? "Priorite P1: traiter les Edge Functions encore en echec apres verification active."
      : "Conserver la surveillance: aucune Edge Function en echec actif dans la fenetre fraiche.",
    criticalTickets.length > 0
      ? "Revoir les tickets critiques et assigner un responsable avant toute action de donnees."
      : "Aucun ticket critique a escalader immediatement.",
    securityAlerts.length > 0
      ? "Verifier les alertes securite recentes sans tenir compte des logs deja recuperes."
      : "Maintenir le monitoring securite standard.",
  ];

  if (input.marketplaceAlerts.length > 0) {
    recommendedActions.push("Verifier les alertes marketplace ouvertes dans le centre operations.");
  }

  return {
    title: `Analyse operations TOK - ${input.action}`,
    health_score: healthScore,
    executive_summary: `${input.verificationSummary} Rapport de secours genere car la reponse IA structuree etait illisible.`,
    cost_summary: `${input.aiCost.toFixed(4)} CHF estimes sur 30 jours. Ratio d'echec IA 7 jours: ${Math.round(input.aiFailureRatio7d * 100)}%.`,
    security_alerts: securityAlerts,
    function_errors: input.verifiedFunctionErrorLines,
    critical_tickets: criticalTickets.map(buildTicketLine),
    abusive_users: input.securityEvents
      .filter((row) => row.user_id && String(row.event_type || "").toLowerCase().includes("abuse"))
      .slice(0, 8)
      .map((row) => String(row.user_id)),
    repeated_incidents_restaurants: buildRepeatedRestaurantLines([...input.incidents, ...input.aiTickets]),
    average_response_time: "Non mesure par le fallback",
    human_escalation_rate: input.aiTickets.length > 0
      ? `${Math.round((criticalTickets.length / input.aiTickets.length) * 100)}%`
      : "0%",
    recommended_actions: recommendedActions,
  };
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    action: string;
    restaurantId?: string | null;
    adminEventId?: string | null;
    model: string;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const inputTokens = payload.usage?.input_tokens ?? 0;
  const outputTokens = payload.usage?.output_tokens ?? 0;

  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    feature_name: FEATURE_NAME,
    source: FUNCTION_NAME,
    model: payload.model,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    status: payload.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_chf: estimateCostChf(payload.model, inputTokens, outputTokens),
    metadata: {
      feature: FEATURE_NAME,
      ai_admin_event_id: payload.adminEventId || null,
      credit_kind: "ai_tools",
      credit_units: getOpenAITextCreditUnits(payload.model, inputTokens, outputTokens),
      ...(payload.metadata || {}),
    },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  let adminEventId: string | null = null;
  let action: MonitorAction = "health";
  let model = selectTokAiModel("admin_monitor");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireUserRole(actor, ["admin"]);
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body.action);
    restaurantId = maybeUuid(body.restaurantId);
    model = action === "full_report" ? selectTokAiModel("admin_report") : selectTokAiModel("admin_monitor");

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 80, windowSeconds: 60 });

    let quota: unknown = null;
    if (restaurantId) {
      quota = await checkRestaurantQuota(actor, restaurantId);
      if (!isQuotaAllowed(quota)) throw new HttpError(402, "ai_quota_exceeded");
    }

    const checkedAt = new Date();
    const errorLogSince = new Date(checkedAt.getTime() - ERROR_LOG_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const supportContextSince = new Date(checkedAt.getTime() - SUPPORT_CONTEXT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const securityContextSince = new Date(checkedAt.getTime() - SECURITY_CONTEXT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(checkedAt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const usageQuery = actor.adminClient
      .from("ai_usage_logs")
      .select("function_name, action, feature_name, restaurant_id, user_id, status, total_tokens, estimated_cost_chf, created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500);
    if (restaurantId) usageQuery.eq("restaurant_id", restaurantId);

    const [usageResult, auditResult, incidentsResult, aiTicketsResult, securityResult, reconcileResult, marketplaceAlertsResult] = await Promise.all([
      usageQuery,
      actor.adminClient
        .from("edge_function_audit_logs")
        .select("function_name, action, status, actor_user_id, error_message, request_metadata, created_at")
        .gte("created_at", errorLogSince)
        .in("status", ["failure", "success"])
        .order("created_at", { ascending: false })
        .limit(500),
      actor.adminClient
        .from("support_incidents")
        .select("id, user_id, restaurant_id, category, priority, status, subject, created_at, updated_at, metadata")
        .neq("status", "closed")
        .gte("updated_at", supportContextSince)
        .order("updated_at", { ascending: false })
        .limit(120),
      actor.adminClient
        .from("ai_support_tickets")
        .select("id, user_id, restaurant_id, category, priority, status, title, created_at, updated_at, metadata")
        .neq("status", "resolved")
        .gte("updated_at", supportContextSince)
        .order("created_at", { ascending: false })
        .limit(120),
      actor.adminClient
        .from("ai_security_events")
        .select("id, user_id, restaurant_id, event_type, severity, signal, risk_score, status, created_at")
        .neq("status", "resolved")
        .gte("created_at", securityContextSince)
        .order("created_at", { ascending: false })
        .limit(80),
      actor.adminClient.rpc("admin_reconcile_marketplace_alerts"),
      actor.adminClient.rpc("admin_get_marketplace_alerts", { p_include_resolved: false }),
    ]);

    if (usageResult.error) throw new HttpError(500, usageResult.error.message);
    if (auditResult.error) throw new HttpError(500, auditResult.error.message);
    if (incidentsResult.error) throw new HttpError(500, incidentsResult.error.message);
    if (aiTicketsResult.error) throw new HttpError(500, aiTicketsResult.error.message);
    if (securityResult.error) throw new HttpError(500, securityResult.error.message);
    if (reconcileResult.error && !isMissingOpsRpc(reconcileResult.error)) throw new HttpError(500, reconcileResult.error.message);
    if (marketplaceAlertsResult.error && !isMissingOpsRpc(marketplaceAlertsResult.error)) {
      throw new HttpError(500, marketplaceAlertsResult.error.message);
    }

    const usageRows = usageResult.data || [];
    const auditRows = [
      ...((auditResult.data || []) as AuditLogRow[]),
      {
        function_name: FUNCTION_NAME,
        action,
        status: "success",
        created_at: checkedAt.toISOString(),
        request_metadata: { synthetic_current_success: true },
      },
    ];
    const incidents = incidentsResult.data || [];
    const aiTickets = aiTicketsResult.data || [];
    const securityEvents = securityResult.data || [];
    const marketplaceAlerts = marketplaceAlertsResult.error ? [] : marketplaceAlertsResult.data || [];
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const usageRows7d = usageRows.filter((row: Record<string, unknown>) => {
      const createdAt = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
      return Number.isFinite(createdAt) && createdAt >= sevenDaysAgoMs;
    });
    const aiFailures7d = usageRows7d.filter((row: Record<string, unknown>) => row.status === "failure").length;
    const aiFailureRatio7d = usageRows7d.length > 0 ? Number((aiFailures7d / usageRows7d.length).toFixed(4)) : 0;
    const rawFailuresInWindow = auditRows.filter(isOperationalFunctionFailure);
    const functionErrorVerification = verifyCurrentFunctionFailures(auditRows);
    const verifiedFunctionErrorLines = functionErrorVerification.active.map(formatVerifiedFunctionError);
    const verificationSummary = buildVerificationSummary(
      functionErrorVerification.active,
      functionErrorVerification.recovered,
    );
    const applicationSmokeTest = rawFailuresInWindow.length > 0 ? await runApplicationSmokeTest() : null;
    const escalatedTickets = aiTickets.filter((row: Record<string, unknown>) => row.status === "escalated");
    const aiCost = usageRows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.estimated_cost_chf || 0), 0);

    const context = {
      action,
      restaurant_id: restaurantId,
      quota,
      checked_at: checkedAt.toISOString(),
      log_verification: {
        method: "fresh_error_window_and_success_after_failure_check",
        error_log_window_hours: ERROR_LOG_LOOKBACK_HOURS,
        support_context_window_days: SUPPORT_CONTEXT_LOOKBACK_DAYS,
        security_context_window_days: SECURITY_CONTEXT_LOOKBACK_DAYS,
        raw_edge_failures_in_window: rawFailuresInWindow.length,
        active_function_errors: functionErrorVerification.active,
        recovered_function_errors: functionErrorVerification.recovered,
        application_smoke_test_required: rawFailuresInWindow.length > 0,
        application_smoke_test: applicationSmokeTest,
        auto_reconciled_marketplace_alerts: reconcileResult.error
          ? null
          : Number((reconcileResult.data as Record<string, unknown> | null)?.auto_resolved_alerts || 0),
        marketplace_alerts_checked: !marketplaceAlertsResult.error,
      },
      metrics: {
        ai_calls_30d: usageRows.length,
        ai_cost_window_days: 30,
        ai_failure_window_days: 7,
        ai_calls_7d: usageRows7d.length,
        ai_failures_7d: aiFailures7d,
        ai_failure_ratio_7d: aiFailureRatio7d,
        ai_failure_ratio_alert: aiFailureRatio7d >= 0.25 && usageRows7d.length >= 10,
        ai_cost_alert_basis: "failure_ratio_not_absolute_spend",
        estimated_ai_cost_chf: Number(aiCost.toFixed(4)),
        edge_error_window_hours: ERROR_LOG_LOOKBACK_HOURS,
        edge_errors_current: functionErrorVerification.active.length,
        edge_errors_recovered: functionErrorVerification.recovered.length,
        edge_failures_raw_window: rawFailuresInWindow.length,
        application_smoke_test_ok: applicationSmokeTest?.ok ?? null,
        current_marketplace_alerts: marketplaceAlerts.length,
        open_support_incidents: incidents.length,
        open_ai_tickets: aiTickets.length,
        escalated_ai_tickets: escalatedTickets.length,
        security_events: securityEvents.length,
      },
      usage_rows: usageRows7d.slice(0, 120),
      audit_failures: functionErrorVerification.active.slice(0, 120),
      recovered_audit_failures: functionErrorVerification.recovered.slice(0, 80),
      current_marketplace_alerts: marketplaceAlerts.slice(0, 80),
      support_incidents: incidents.slice(0, 80),
      ai_support_tickets: aiTickets.slice(0, 80),
      security_events: securityEvents,
    };

    const systemPrompt = `Tu es l'agent IA admin monitoring de TOK.
Tu detectes les anomalies de securite, couts OpenAI, erreurs Supabase Functions, tickets critiques, abus, incidents repetes et degradation de performance.
Pour les couts OpenAI, privilegie le ratio echec/succes sur 7 jours plutot que la depense absolue.
Pour les erreurs, tu dois uniquement tenir compte de log_verification.active_function_errors. Les logs anciens ou listes dans log_verification.recovered_function_errors sont consideres resolus et ne doivent jamais etre presentes comme incidents actifs.
Un log d'erreur est actuel seulement si le test de recuperation ne trouve aucun succes plus recent pour la meme fonction/action dans la fenetre fraiche.
Quand log_verification.application_smoke_test_required est vrai, tiens compte du smoke test applicatif et de son statut avant de conclure a une degradation globale.
Tes recommandations sont en lecture seule: aucune action destructive, aucune suspension automatique, aucune fermeture de ticket, aucune sanction utilisateur et aucune modification de donnees sans validation humaine.
Reponds en francais operationnel avec priorites.`;

    const openAIResponse = await createOpenAIResponse({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens: getAdminMonitorMaxOutputTokens(action),
      jsonSchema: {
        name: "tok_ai_admin_monitor_result",
        description: "Admin monitoring AI report.",
        schema: OUTPUT_SCHEMA,
      },
    });

    let aiResponseFallback = false;
    let rawResult: AdminMonitorResult;

    try {
      rawResult = parseStructuredOutput<AdminMonitorResult>(openAIResponse);
    } catch (error) {
      const recoverableParseError = error instanceof HttpError
        && (error.message === "ai_invalid_response" || error.message === "ai_empty_response");
      if (!recoverableParseError) throw error;

      aiResponseFallback = true;
      log.warn("ai_response_parse_fallback", { reason: error.message, action });
      rawResult = buildFallbackAdminMonitorResult({
        action,
        aiCost,
        aiFailureRatio7d,
        usageRows7d,
        verifiedFunctionErrorLines,
        verificationSummary,
        applicationSmokeTest,
        incidents,
        aiTickets,
        securityEvents,
        marketplaceAlerts,
      });
    }

    const result: AdminMonitorResult = {
      ...rawResult,
      function_errors: verifiedFunctionErrorLines,
    };
    const usage = extractUsage(openAIResponse);
    const healthScore = toHealthScore(result.health_score);

    const { data: adminEvent, error: adminEventError } = await actor.adminClient
      .from("ai_admin_events")
      .insert({
        user_id: actor.userId,
        event_type: action,
        severity: healthScore < 60 ? "high" : healthScore < 80 ? "medium" : "info",
        title: result.title,
        summary: result.executive_summary,
        model,
        metadata: {
          health_score: healthScore,
          cost_summary: result.cost_summary,
          verification_summary: verificationSummary,
          log_verification: context.log_verification,
          function_errors: verifiedFunctionErrorLines,
          recovered_function_errors: functionErrorVerification.recovered,
          recommended_actions: result.recommended_actions,
          ai_response_fallback: aiResponseFallback,
        },
      })
      .select("id")
      .single();

    if (adminEventError) throw new HttpError(500, adminEventError.message);
    adminEventId = adminEvent.id;

    if (!aiResponseFallback && result.security_alerts.length > 0) {
      const actorUserId = actor.userId;
      await actor.adminClient.from("ai_security_events").insert(
        result.security_alerts.slice(0, 10).map((alert) => ({
          user_id: actorUserId,
          restaurant_id: restaurantId,
          event_type: action,
          severity: alert.severity,
          signal: alert.label,
          risk_score: alert.severity === "critical" ? 95 : alert.severity === "high" ? 75 : alert.severity === "medium" ? 50 : 25,
          metadata: { evidence: alert.evidence, source_admin_event_id: adminEventId },
        })),
      );
    }

    await actor.adminClient.from("ai_performance_snapshots").insert({
      snapshot_date: new Date().toISOString().slice(0, 10),
      scope: restaurantId ? "restaurant" : "platform",
      restaurant_id: restaurantId,
      function_name: null,
      health_score: healthScore,
      average_response_ms: 0,
      error_count: functionErrorVerification.active.length,
      escalation_rate: aiTickets.length > 0 ? Number(((escalatedTickets.length / aiTickets.length) * 100).toFixed(2)) : 0,
      estimated_cost_chf: Number(aiCost.toFixed(4)),
      metrics: context.metrics,
    });

    await insertUsage(actor, {
      status: "success",
      action,
      restaurantId,
      adminEventId,
      model,
      usage,
      metadata: {
        health_score: healthScore,
        security_alerts: result.security_alerts.length,
        verified_function_errors: functionErrorVerification.active.length,
        recovered_function_errors: functionErrorVerification.recovered.length,
        ai_response_fallback: aiResponseFallback,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: "ai_admin_events",
      targetEntityId: adminEventId,
      metadata: {
        rid: log.rid,
        restaurant_id: restaurantId,
        verified_function_errors: functionErrorVerification.active.length,
        recovered_function_errors: functionErrorVerification.recovered.length,
        ai_response_fallback: aiResponseFallback,
      },
    });

    return jsonResponse({
      ...result,
      action,
      restaurantId,
      adminEventId,
      checkedAt: checkedAt.toISOString(),
      healthScore,
      metrics: context.metrics,
      quota,
      verificationSummary,
      logVerification: context.log_verification,
      recoveredFunctionErrors: functionErrorVerification.recovered,
    }, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await insertUsage(actor, {
        status: "failure",
        action,
        restaurantId,
        adminEventId,
        model,
        metadata: { error: message, rid: log.rid },
      }).catch(() => {});

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action,
        actor,
        request: req,
        targetEntityType: "ai_admin_events",
        targetEntityId: adminEventId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
