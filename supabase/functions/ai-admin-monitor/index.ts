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
  extractUsage,
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

function isQuotaAllowed(value: unknown) {
  if (!value || typeof value !== "object") return true;
  return (value as Record<string, unknown>).allowed !== false;
}

function isMissingQuotaRpc(error: { message?: string } | null | undefined) {
  const message = error?.message || "";
  return message.includes("check_restaurant_ai_quota") || message.includes("schema cache");
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

function estimateCostChf(inputTokens = 0, outputTokens = 0) {
  return Number(((inputTokens * 0.00000025) + (outputTokens * 0.000001)).toFixed(6));
}

function toHealthScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 75;
  return Math.max(0, Math.min(100, Math.round(score)));
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
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    feature_name: FEATURE_NAME,
    source: FUNCTION_NAME,
    model: payload.model,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    status: payload.status,
    input_tokens: payload.usage?.input_tokens ?? 0,
    output_tokens: payload.usage?.output_tokens ?? 0,
    total_tokens: payload.usage?.total_tokens ?? 0,
    estimated_cost_chf: estimateCostChf(payload.usage?.input_tokens, payload.usage?.output_tokens),
    metadata: {
      feature: FEATURE_NAME,
      ai_admin_event_id: payload.adminEventId || null,
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

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const usageQuery = actor.adminClient
      .from("ai_usage_logs")
      .select("function_name, action, feature_name, restaurant_id, user_id, status, total_tokens, estimated_cost_chf, created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500);
    if (restaurantId) usageQuery.eq("restaurant_id", restaurantId);

    const [usageResult, auditResult, incidentsResult, aiTicketsResult, securityResult] = await Promise.all([
      usageQuery,
      actor.adminClient
        .from("edge_function_audit_logs")
        .select("function_name, action, status, actor_user_id, error_message, request_metadata, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300),
      actor.adminClient
        .from("support_incidents")
        .select("id, user_id, restaurant_id, category, priority, status, subject, created_at, updated_at, metadata")
        .neq("status", "closed")
        .order("updated_at", { ascending: false })
        .limit(120),
      actor.adminClient
        .from("ai_support_tickets")
        .select("id, user_id, restaurant_id, category, priority, status, title, created_at, metadata")
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(120),
      actor.adminClient
        .from("ai_security_events")
        .select("id, user_id, restaurant_id, event_type, severity, signal, risk_score, status, created_at")
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    if (usageResult.error) throw new HttpError(500, usageResult.error.message);
    if (auditResult.error) throw new HttpError(500, auditResult.error.message);
    if (incidentsResult.error) throw new HttpError(500, incidentsResult.error.message);
    if (aiTicketsResult.error) throw new HttpError(500, aiTicketsResult.error.message);
    if (securityResult.error) throw new HttpError(500, securityResult.error.message);

    const usageRows = usageResult.data || [];
    const auditRows = auditResult.data || [];
    const incidents = incidentsResult.data || [];
    const aiTickets = aiTicketsResult.data || [];
    const securityEvents = securityResult.data || [];
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const usageRows7d = usageRows.filter((row: Record<string, unknown>) => {
      const createdAt = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
      return Number.isFinite(createdAt) && createdAt >= sevenDaysAgoMs;
    });
    const aiFailures7d = usageRows7d.filter((row: Record<string, unknown>) => row.status === "failure").length;
    const aiFailureRatio7d = usageRows7d.length > 0 ? Number((aiFailures7d / usageRows7d.length).toFixed(4)) : 0;
    const failedAudit = auditRows.filter((row: Record<string, unknown>) => row.status === "failure");
    const escalatedTickets = aiTickets.filter((row: Record<string, unknown>) => row.status === "escalated");
    const aiCost = usageRows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.estimated_cost_chf || 0), 0);

    const context = {
      action,
      restaurant_id: restaurantId,
      quota,
      metrics: {
        ai_calls_30d: usageRows.length,
        ai_failures_30d: usageRows.filter((row: Record<string, unknown>) => row.status === "failure").length,
        ai_calls_7d: usageRows7d.length,
        ai_failures_7d: aiFailures7d,
        ai_failure_ratio_7d: aiFailureRatio7d,
        ai_failure_ratio_alert: aiFailureRatio7d >= 0.25 && usageRows7d.length >= 10,
        ai_cost_alert_basis: "failure_ratio_not_absolute_spend",
        estimated_ai_cost_chf: Number(aiCost.toFixed(4)),
        edge_errors_24h: failedAudit.length,
        open_support_incidents: incidents.length,
        open_ai_tickets: aiTickets.length,
        escalated_ai_tickets: escalatedTickets.length,
        security_events: securityEvents.length,
      },
      usage_rows: usageRows.slice(0, 120),
      audit_failures: failedAudit.slice(0, 120),
      support_incidents: incidents.slice(0, 80),
      ai_support_tickets: aiTickets.slice(0, 80),
      security_events: securityEvents,
    };

    const systemPrompt = `Tu es l'agent IA admin monitoring de TOK.
Tu detectes les anomalies de securite, couts OpenAI, erreurs Supabase Functions, tickets critiques, abus, incidents repetes et degradation de performance.
Pour les couts OpenAI, privilegie le ratio echec/succes sur 7 jours plutot que la depense absolue.
Tes recommandations sont en lecture seule: aucune action destructive, aucune suspension automatique, aucune fermeture de ticket, aucune sanction utilisateur et aucune modification de donnees sans validation humaine.
Reponds en francais operationnel avec priorites.`;

    const openAIResponse = await createOpenAIResponse({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens: action === "full_report" ? 2100 : 1500,
      jsonSchema: {
        name: "tok_ai_admin_monitor_result",
        description: "Admin monitoring AI report.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<AdminMonitorResult>(openAIResponse);
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
          recommended_actions: result.recommended_actions,
        },
      })
      .select("id")
      .single();

    if (adminEventError) throw new HttpError(500, adminEventError.message);
    adminEventId = adminEvent.id;

    if (result.security_alerts.length > 0) {
      await actor.adminClient.from("ai_security_events").insert(
        result.security_alerts.slice(0, 10).map((alert) => ({
          user_id: actor.userId,
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
      error_count: failedAudit.length,
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
      metadata: { health_score: healthScore, security_alerts: result.security_alerts.length },
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
      metadata: { rid: log.rid, restaurant_id: restaurantId },
    });

    return jsonResponse({
      ...result,
      action,
      restaurantId,
      adminEventId,
      healthScore,
      metrics: context.metrics,
      quota,
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
