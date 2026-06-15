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

type AdminChatAction = "chat" | "history" | "messages";
type AdminChatMessage = { role: "user" | "assistant"; content: string };

type QuerySnapshot = {
  label: string;
  rows: Array<Record<string, unknown>>;
  row_count: number;
  error: string | null;
};

type AdminDashboardChatResult = {
  reply: string;
  cited_sources: string[];
  risk_level: "info" | "attention" | "critical";
  suggested_actions: string[];
  data_window: string;
};

const FUNCTION_NAME = "ai-admin-dashboard-chat";
const FEATURE_NAME = "admin_dashboard_ai_chat";
const MAX_RECENT_ROWS = 80;
const MAX_LOG_ROWS = 120;
const MAX_MESSAGE_CHARS = 3500;
const CONTEXT_WINDOW_DAYS = 30;
const LOG_WINDOW_DAYS = 14;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "cited_sources", "risk_level", "suggested_actions", "data_window"],
  properties: {
    reply: { type: "string" },
    cited_sources: { type: "array", items: { type: "string" } },
    risk_level: { type: "string", enum: ["info", "attention", "critical"] },
    suggested_actions: { type: "array", items: { type: "string" } },
    data_window: { type: "string" },
  },
};

function normalizeAction(raw: unknown): AdminChatAction {
  if (raw === "history" || raw === "messages") return raw;
  return "chat";
}

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeMessages(raw: unknown): AdminChatMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .slice(-24)
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" as const : "user" as const,
      content: typeof entry.content === "string" ? entry.content.trim().slice(0, MAX_MESSAGE_CHARS) : "",
    }))
    .filter((entry) => entry.content.length > 0);
}

function normalizeOwnerEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

async function getActorEmail(actor: Awaited<ReturnType<typeof authenticateRequest>>) {
  if (!actor.userId) return "";

  const { data, error } = await actor.adminClient.auth.admin.getUserById(actor.userId);
  if (error) throw new HttpError(500, error.message);

  return normalizeOwnerEmail(data.user?.email);
}

async function requireSingleAdminAiPrincipal(actor: Awaited<ReturnType<typeof authenticateRequest>>) {
  requireUserRole(actor, ["admin"], "admin_access_required");

  const configuredUserId = (Deno.env.get("TOK_ADMIN_AI_OWNER_USER_ID") || "").trim();
  const configuredEmail = normalizeOwnerEmail(Deno.env.get("TOK_ADMIN_AI_OWNER_EMAIL"));

  if (!configuredUserId && !configuredEmail) {
    throw new HttpError(403, "admin_ai_owner_not_configured");
  }

  const idMatches = configuredUserId ? actor.userId === configuredUserId : true;
  const emailMatches = configuredEmail ? await getActorEmail(actor) === configuredEmail : true;

  if (!idMatches || !emailMatches) {
    throw new HttpError(403, "admin_ai_owner_required");
  }
}

async function requireAdminDashboardAiChatEnabled(actor: Awaited<ReturnType<typeof authenticateRequest>>) {
  const { data, error } = await actor.adminClient
    .from("feature_flags")
    .select("is_active")
    .eq("name", FEATURE_NAME)
    .maybeSingle();

  if (error) throw new HttpError(503, error.message);
  if (data?.is_active === false) throw new HttpError(403, "admin_dashboard_ai_chat_disabled");
}

function compactValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 900);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(compactValue);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    if (/token|secret|password|authorization|apikey|api_key/i.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = compactValue(entry);
  }

  return output;
}

function compactRows(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => compactValue(row) as Record<string, unknown>);
}

async function runSnapshot(label: string, query: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<QuerySnapshot> {
  try {
    const { data, error } = await query;
    if (error) {
      return { label, rows: [], row_count: 0, error: error.message || "query_error" };
    }

    const rows = compactRows(data);
    return { label, rows, row_count: rows.length, error: null };
  } catch (error) {
    return {
      label,
      rows: [],
      row_count: 0,
      error: error instanceof Error ? error.message : "query_exception",
    };
  }
}

function countBy(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = typeof row[key] === "string" && row[key] ? row[key] as string : "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sumNumeric(rows: Array<Record<string, unknown>>, key: string) {
  return Number(rows.reduce((sum, row) => {
    const value = Number(row[key] || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0).toFixed(2));
}

async function buildAdminDashboardContext(actor: Awaited<ReturnType<typeof authenticateRequest>>) {
  const checkedAt = new Date();
  const contextSince = new Date(checkedAt.getTime() - CONTEXT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const logSince = new Date(checkedAt.getTime() - LOG_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [
    orders,
    reservations,
    restaurants,
    payments,
    invoices,
    supportIncidents,
    aiTickets,
    featureFlags,
    edgeLogs,
    auditLogs,
    aiUsage,
  ] = await Promise.all([
    runSnapshot(
      "orders",
      actor.adminClient
        .from("orders")
        .select("id, order_number, status, payment_status, total_amount, restaurant_id, user_id, created_at, updated_at, metadata")
        .gte("created_at", contextSince)
        .order("created_at", { ascending: false })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "reservations",
      actor.adminClient
        .from("reservations")
        .select("id, status, feature, party_size, total_amount, restaurant_id, user_id, date, time, reservation_time, created_at, updated_at, metadata")
        .gte("created_at", contextSince)
        .order("created_at", { ascending: false })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "restaurants",
      actor.adminClient
        .from("restaurants")
        .select("id, name, city, status, is_active, owner_id, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "payment_transactions",
      actor.adminClient
        .from("payment_transactions")
        .select("id, status, amount, currency, provider, restaurant_id, user_id, order_id, reservation_id, stripe_payment_intent_id, created_at")
        .gte("created_at", contextSince)
        .order("created_at", { ascending: false })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "restaurant_invoices",
      actor.adminClient
        .from("restaurant_invoices")
        .select("id, invoice_number, status, total_amount, restaurant_id, paid_at, due_date, created_at, metadata")
        .gte("created_at", contextSince)
        .order("created_at", { ascending: false })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "support_incidents",
      actor.adminClient
        .from("support_incidents")
        .select("id, category, priority, status, subject, restaurant_id, order_id, reservation_id, created_at, updated_at, metadata")
        .neq("status", "closed")
        .order("updated_at", { ascending: false })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "ai_support_tickets",
      actor.adminClient
        .from("ai_support_tickets")
        .select("id, category, priority, status, title, restaurant_id, order_id, reservation_id, created_at, updated_at, metadata")
        .neq("status", "resolved")
        .order("updated_at", { ascending: false })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "feature_flags",
      actor.adminClient
        .from("feature_flags")
        .select("name, label, is_active, updated_at")
        .order("name", { ascending: true })
        .limit(MAX_RECENT_ROWS),
    ),
    runSnapshot(
      "edge_function_audit_logs",
      actor.adminClient
        .from("edge_function_audit_logs")
        .select("function_name, action, status, actor_user_id, error_message, request_metadata, created_at")
        .gte("created_at", logSince)
        .order("created_at", { ascending: false })
        .limit(MAX_LOG_ROWS),
    ),
    runSnapshot(
      "audit_log",
      actor.adminClient
        .from("audit_log")
        .select("user_id, action, entity_type, entity_id, old_data, new_data, created_at")
        .gte("created_at", logSince)
        .order("created_at", { ascending: false })
        .limit(MAX_LOG_ROWS),
    ),
    runSnapshot(
      "ai_usage_logs",
      actor.adminClient
        .from("ai_usage_logs")
        .select("function_name, action, feature_name, status, total_tokens, estimated_cost_chf, created_at, metadata")
        .gte("created_at", contextSince)
        .order("created_at", { ascending: false })
        .limit(MAX_LOG_ROWS),
    ),
  ]);

  const datasets = {
    orders,
    reservations,
    restaurants,
    payments,
    invoices,
    support_incidents: supportIncidents,
    ai_support_tickets: aiTickets,
    feature_flags: featureFlags,
    edge_function_audit_logs: edgeLogs,
    audit_log: auditLogs,
    ai_usage_logs: aiUsage,
  };

  return {
    checked_at: checkedAt.toISOString(),
    data_windows: {
      dashboard_days: CONTEXT_WINDOW_DAYS,
      log_days: LOG_WINDOW_DAYS,
      recent_row_limit: MAX_RECENT_ROWS,
      log_row_limit: MAX_LOG_ROWS,
    },
    summaries: {
      orders_by_status: countBy(orders.rows, "status"),
      orders_by_payment_status: countBy(orders.rows, "payment_status"),
      orders_total_amount_chf: sumNumeric(orders.rows, "total_amount"),
      reservations_by_status: countBy(reservations.rows, "status"),
      reservations_by_feature: countBy(reservations.rows, "feature"),
      payments_by_status: countBy(payments.rows, "status"),
      payments_total_amount_chf: sumNumeric(payments.rows, "amount"),
      invoices_by_status: countBy(invoices.rows, "status"),
      open_support_by_priority: countBy(supportIncidents.rows, "priority"),
      edge_logs_by_status: countBy(edgeLogs.rows, "status"),
      ai_usage_by_status: countBy(aiUsage.rows, "status"),
      ai_estimated_cost_chf: sumNumeric(aiUsage.rows, "estimated_cost_chf"),
    },
    datasets,
  };
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    action: string;
    conversationId?: string | null;
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
    conversation_id: payload.conversationId || null,
    status: payload.status,
    input_tokens: payload.usage?.input_tokens ?? 0,
    output_tokens: payload.usage?.output_tokens ?? 0,
    total_tokens: payload.usage?.total_tokens ?? 0,
    metadata: {
      feature: FEATURE_NAME,
      ...(payload.metadata || {}),
    },
  });
}

function isOwnAdminConversation(actor: Awaited<ReturnType<typeof authenticateRequest>>, conversation: Record<string, unknown> | null) {
  if (!conversation) return false;
  const metadata = conversation.metadata && typeof conversation.metadata === "object"
    ? conversation.metadata as Record<string, unknown>
    : {};

  return conversation.user_id === actor.userId
    && conversation.scope === "admin"
    && metadata.endpoint === FUNCTION_NAME;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let conversationId: string | null = null;
  let action: AdminChatAction = "chat";
  const model = selectTokAiModel("admin_report");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    await requireSingleAdminAiPrincipal(actor);
    await requireAdminDashboardAiChatEnabled(actor);

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body.action);
    conversationId = maybeUuid(body.conversationId);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`admin-owner:${actor.userId}`, { maxRequests: 35, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 80, windowSeconds: 60 });

    if (action === "history") {
      const { data, error } = await actor.adminClient
        .from("ai_conversations")
        .select("id, scope, title, status, support_incident_id, restaurant_id, order_id, reservation_id, metadata, created_at, updated_at")
        .eq("scope", "admin")
        .eq("user_id", actor.userId)
        .contains("metadata", { endpoint: FUNCTION_NAME })
        .order("updated_at", { ascending: false })
        .limit(Math.min(Number(body.limit || 20) || 20, 50));

      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ conversations: data || [] }, 200, cors);
    }

    if (action === "messages") {
      if (!conversationId) throw new HttpError(400, "conversation_id_required");

      const { data: conversation, error: conversationError } = await actor.adminClient
        .from("ai_conversations")
        .select("id, user_id, scope, metadata")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError) throw new HttpError(500, conversationError.message);
      if (!isOwnAdminConversation(actor, conversation)) throw new HttpError(403, "forbidden_conversation");

      const { data, error } = await actor.adminClient
        .from("ai_messages")
        .select("id, conversation_id, role, content, metadata, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(120);

      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ messages: data || [] }, 200, cors);
    }

    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0) throw new HttpError(400, "messages_required");

    const context = typeof body.context === "object" && body.context ? body.context as Record<string, unknown> : {};
    const lastUserMessage = messages.filter((message) => message.role === "user").at(-1);
    if (!lastUserMessage) throw new HttpError(400, "user_message_required");

    let existingConversation: Record<string, unknown> | null = null;
    if (conversationId) {
      const { data, error } = await actor.adminClient
        .from("ai_conversations")
        .select("id, user_id, scope, status, title, metadata")
        .eq("id", conversationId)
        .maybeSingle();

      if (error) throw new HttpError(500, error.message);
      if (!isOwnAdminConversation(actor, data)) throw new HttpError(403, "forbidden_conversation");
      existingConversation = data;
    }

    if (existingConversation) {
      await actor.adminClient
        .from("ai_conversations")
        .update({
          updated_at: new Date().toISOString(),
          metadata: {
            ...(existingConversation.metadata as Record<string, unknown> || {}),
            endpoint: FUNCTION_NAME,
            context,
          },
        })
        .eq("id", conversationId);
    } else {
      const { data: conversation, error } = await actor.adminClient
        .from("ai_conversations")
        .insert({
          scope: "admin",
          user_id: actor.userId,
          title: lastUserMessage.content.slice(0, 140) || "Assistant IA Admin TOK",
          metadata: { endpoint: FUNCTION_NAME, context },
        })
        .select("id")
        .single();

      if (error) throw new HttpError(500, error.message);
      conversationId = conversation.id;
    }

    if (!conversationId) throw new HttpError(500, "conversation_not_created");

    const messagesToPersist = existingConversation ? [lastUserMessage] : messages;
    await actor.adminClient.from("ai_messages").insert(messagesToPersist.map((message) => ({
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      model,
      metadata: { endpoint: FUNCTION_NAME },
    })));

    const dashboardContext = await buildAdminDashboardContext(actor);
    const systemPrompt = `Tu peux analyser les donnees du dashboard admin TOK, les commandes, reservations, restaurants, paiements, factures, feature flags, sinistres, tickets IA et logs.
Tu es strictement en lecture seule: aucune action destructive, aucun changement de donnees, aucun remboursement, aucune suspension, aucune modification de roles.
Tu dois repondre en francais operationnel, citer les sources de contexte utilisees et signaler clairement quand les donnees disponibles ne suffisent pas.
Ne revele jamais de secret, token, cle API, mot de passe ou information d'autorisation.`;

    const openAIResponse = await createOpenAIResponse({
      model,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            current_path: context.currentPath || null,
            question: lastUserMessage.content,
            conversation_recent_messages: messages.slice(-12),
            admin_dashboard_context: dashboardContext,
          }),
        },
      ],
      maxOutputTokens: 2200,
      jsonSchema: {
        name: "tok_admin_dashboard_chat_result",
        description: "Read-only answer for the single privileged TOK admin chat.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<AdminDashboardChatResult>(openAIResponse);
    const usage = extractUsage(openAIResponse);

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: result.reply,
      model,
      usage,
      metadata: {
        endpoint: FUNCTION_NAME,
        cited_sources: result.cited_sources,
        risk_level: result.risk_level,
        suggested_actions: result.suggested_actions,
        data_window: result.data_window,
      },
    });

    await insertUsage(actor, {
      status: "success",
      action: FEATURE_NAME,
      conversationId,
      model,
      usage,
      metadata: {
        cited_sources: result.cited_sources,
        risk_level: result.risk_level,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: FEATURE_NAME,
      actor,
      request: req,
      targetEntityType: "ai_conversations",
      targetEntityId: conversationId,
      metadata: { rid: log.rid, risk_level: result.risk_level },
    });

    return jsonResponse({
      ...result,
      conversationId,
      model,
    }, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await insertUsage(actor, {
        status: "failure",
        action: FEATURE_NAME,
        conversationId,
        model,
        metadata: { error: message, rid: log.rid },
      }).catch(() => {});

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: FEATURE_NAME,
        actor,
        request: req,
        targetEntityType: "ai_conversations",
        targetEntityId: conversationId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
