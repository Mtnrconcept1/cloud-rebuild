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
  OPENAI_MODEL,
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
} from "../_shared/openai.ts";

type AdminAction = "ticket_summary" | "triage" | "weekly_report" | "abuse_detection";

type AdminSupportResult = {
  title: string;
  executive_summary: string;
  priority_queue: Array<{
    incident_id: string;
    priority: "low" | "normal" | "high" | "urgent";
    reason: string;
  }>;
  anomalies: string[];
  recommended_actions: string[];
  customer_safe_summary: string;
};

const FUNCTION_NAME = "ai-admin-support";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "executive_summary",
    "priority_queue",
    "anomalies",
    "recommended_actions",
    "customer_safe_summary",
  ],
  properties: {
    title: { type: "string" },
    executive_summary: { type: "string" },
    priority_queue: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["incident_id", "priority", "reason"],
        properties: {
          incident_id: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          reason: { type: "string" },
        },
      },
    },
    anomalies: { type: "array", items: { type: "string" } },
    recommended_actions: { type: "array", items: { type: "string" } },
    customer_safe_summary: { type: "string" },
  },
};

function normalizeAction(raw: unknown): AdminAction {
  if (
    raw === "ticket_summary" ||
    raw === "triage" ||
    raw === "weekly_report" ||
    raw === "abuse_detection"
  ) {
    return raw;
  }

  return "triage";
}

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeText(raw: unknown, max = 2500) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    action: string;
    conversationId?: string | null;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const inputTokens = payload.usage?.input_tokens ?? 0;
  const outputTokens = payload.usage?.output_tokens ?? 0;

  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    model: OPENAI_MODEL,
    user_id: actor.userId,
    conversation_id: payload.conversationId || null,
    status: payload.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_chf: estimateOpenAITextCostChf(OPENAI_MODEL, inputTokens, outputTokens),
    metadata: {
      credit_kind: "ai_tools",
      credit_units: getOpenAITextCreditUnits(OPENAI_MODEL, inputTokens, outputTokens),
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
  let conversationId: string | null = null;
  let action: AdminAction = "triage";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireUserRole(actor, ["admin"]);
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body.action);
    const incidentId = maybeUuid(body.incidentId);
    const prompt = sanitizeText(body.prompt);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 100, windowSeconds: 60 });

    const incidentsQuery = actor.adminClient
      .from("support_incidents")
      .select("id, category, priority, status, subject, description, restaurant_id, order_id, reservation_id, created_at, updated_at, last_message_at, metadata")
      .order("updated_at", { ascending: false })
      .limit(incidentId ? 1 : 80);

    if (incidentId) {
      incidentsQuery.eq("id", incidentId);
    } else {
      incidentsQuery.neq("status", "closed");
    }

    const { data: incidents, error: incidentsError } = await incidentsQuery;
    if (incidentsError) throw new HttpError(500, incidentsError.message);

    const incidentIds = ((incidents || []) as Array<Record<string, unknown>>)
      .slice(0, 20)
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string");

    let messages: Array<Record<string, unknown>> = [];
    if (incidentId) {
      const { data, error } = await actor.adminClient
        .from("support_incident_messages")
        .select("incident_id, author_role, body, visibility, created_at")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: true })
        .limit(80);

      if (error) throw new HttpError(500, error.message);
      messages = data || [];
    } else if (incidentIds.length > 0) {
      const { data, error } = await actor.adminClient
        .from("support_incident_messages")
        .select("incident_id, author_role, body, visibility, created_at")
        .in("incident_id", incidentIds)
        .order("created_at", { ascending: false })
        .limit(120);

      if (error) throw new HttpError(500, error.message);
      messages = data || [];
    }

    const context = {
      action,
      prompt,
      incidents: (incidents || []).map((incident: Record<string, unknown>) => ({
        ...incident,
        description: typeof incident.description === "string"
          ? incident.description.slice(0, 900)
          : incident.description,
      })),
      messages: (messages || []).map((message: Record<string, unknown>) => ({
        ...message,
        body: typeof message.body === "string" ? message.body.slice(0, 900) : message.body,
      })),
    };

    const systemPrompt = `Tu es l'agent IA interne Operations Center de TOK.
Tu aides les admins a resumer les tickets support, prioriser les files, detecter les abus et preparer des rapports.
Ne donne pas de conseil juridique ou medical. Pour intoxication/allergie/menace juridique, recommande une escalade humaine urgente.
Ne prends aucune decision finale, ne ferme aucun ticket, ne promets aucun remboursement.
Masque ou evite les donnees personnelles dans les syntheses partageables.`;

    const { data: conversation, error: conversationError } = await actor.adminClient
      .from("ai_conversations")
      .insert({
        scope: "admin",
        user_id: actor.userId,
        support_incident_id: incidentId,
        title: `Admin IA - ${action}`,
        metadata: { action },
      })
      .select("id")
      .single();

    if (conversationError) throw new HttpError(500, conversationError.message);
    conversationId = conversation.id;

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: prompt || action,
      model: OPENAI_MODEL,
      metadata: { action, incident_id: incidentId },
    });

    const openAIResponse = await createOpenAIResponse({
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens: 1800,
      jsonSchema: {
        name: "tok_admin_support_result",
        description: "Operations center support intelligence output.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<AdminSupportResult>(openAIResponse);
    const usage = extractUsage(openAIResponse);

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: result.executive_summary,
      model: OPENAI_MODEL,
      usage,
      metadata: {
        action,
        priority_queue: result.priority_queue,
        anomalies: result.anomalies,
        recommended_actions: result.recommended_actions,
      },
    });

    await insertUsage(actor, {
      status: "success",
      action,
      conversationId,
      usage,
      metadata: {
        incident_id: incidentId,
        incident_count: incidents?.length || 0,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: incidentId ? "support_incidents" : "ai_conversations",
      targetEntityId: incidentId || conversationId,
      metadata: { rid: log.rid, conversation_id: conversationId },
    });

    return jsonResponse({
      ...result,
      action,
      conversationId,
    }, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await insertUsage(actor, {
        status: "failure",
        action,
        conversationId,
        metadata: { error: message, rid: log.rid },
      }).catch(() => {});

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action,
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
