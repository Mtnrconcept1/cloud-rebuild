import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  OPENAI_API_KEY,
  OPENAI_MODEL,
  createOpenAIResponse,
  extractUsage,
  parseStructuredOutput,
} from "../_shared/openai.ts";

type ClientMessage = { role: "user" | "assistant"; content: string };
type AgentId = "support_ai" | "orders_ai" | "payments_ai";

type ClientAiResult = {
  reply: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  should_escalate: boolean;
  ticket_title: string;
  ticket_summary: string;
  suggested_credit_chf: number;
};

const FUNCTION_NAME = "ai-client-chat";
const SUPPORT_CATEGORIES = [
  "general",
  "order_missing",
  "order_late",
  "wrong_item",
  "missing_item",
  "quality_issue",
  "refund_request",
  "payment_issue",
  "reservation_issue",
  "zero_attente_issue",
  "delivery_issue",
  "restaurant_issue",
  "technical_issue",
];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "category",
    "priority",
    "should_escalate",
    "ticket_title",
    "ticket_summary",
    "suggested_credit_chf",
  ],
  properties: {
    reply: { type: "string" },
    category: { type: "string", enum: SUPPORT_CATEGORIES },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    should_escalate: { type: "boolean" },
    ticket_title: { type: "string" },
    ticket_summary: { type: "string" },
    suggested_credit_chf: { type: "number", minimum: 0, maximum: 5 },
  },
};

function normalizeAgentId(raw: unknown): AgentId {
  if (raw === "orders_ai" || raw === "payments_ai") return raw;
  return "support_ai";
}

function sanitizeMessages(raw: unknown): ClientMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object"
    )
    .slice(-16)
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: typeof entry.content === "string" ? entry.content.slice(0, 2500) : "",
    }))
    .filter((entry) => entry.content.trim().length > 0);
}

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    action: string;
    conversationId?: string | null;
    restaurantId?: string | null;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    model: OPENAI_MODEL,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    conversation_id: payload.conversationId || null,
    status: payload.status,
    input_tokens: payload.usage?.input_tokens ?? 0,
    output_tokens: payload.usage?.output_tokens ?? 0,
    total_tokens: payload.usage?.total_tokens ?? 0,
    metadata: payload.metadata || {},
  });
}

async function appendChatTranscriptToIncident(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    incidentId: string;
    conversationId: string;
    messages: ClientMessage[];
    assistantReply: string;
  },
) {
  const transcriptRows = [
    ...input.messages.map((message) => ({
      incident_id: input.incidentId,
      author_id: message.role === "user" ? actor.userId : null,
      author_role: message.role === "user" ? "client" : "system",
      body: message.content.slice(0, 4000),
      visibility: "internal",
      metadata: {
        source: FUNCTION_NAME,
        conversation_id: input.conversationId,
        transcript_role: message.role,
      },
    })),
    {
      incident_id: input.incidentId,
      author_id: null,
      author_role: "system",
      body: input.assistantReply.slice(0, 4000),
      visibility: "internal",
      metadata: {
        source: FUNCTION_NAME,
        conversation_id: input.conversationId,
        transcript_role: "assistant",
      },
    },
  ].filter((row) => row.body.trim().length > 0);

  if (transcriptRows.length === 0) return;

  const { error } = await actor.adminClient
    .from("support_incident_messages")
    .insert(transcriptRows);

  if (error) throw error;
}

async function notifyAdminsOfChatIncident(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    incidentId: string;
    conversationId: string;
    title: string;
    summary: string;
    priority: string;
    orderId: string | null;
    reservationId: string | null;
    restaurantId: string | null;
  },
) {
  const { data: admins, error } = await actor.adminClient
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (error) throw error;

  const adminIds = Array.from(new Set((admins || []).map((row: { user_id?: string | null }) => row.user_id).filter(Boolean))) as string[];
  await Promise.all(adminIds.map((adminUserId) =>
    actor.adminClient.rpc("enqueue_notification", {
      p_user_id: adminUserId,
      p_title: "Nouveau sinistre chat",
      p_body: `${input.priority.toUpperCase()} - ${input.title || input.summary || "Plainte client remontée par le chat"}`.slice(0, 240),
      p_type: "support_incident",
      p_category: "system",
      p_data: {
        url: `/admin/sinistres?incident=${input.incidentId}`,
        support_incident_id: input.incidentId,
        conversation_id: input.conversationId,
        order_id: input.orderId,
        reservation_id: input.reservationId,
        restaurant_id: input.restaurantId,
        source: FUNCTION_NAME,
        requested_channels: { in_app: true, push: true, email: false },
      },
    })
  ));
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let conversationId: string | null = null;
  let restaurantId: string | null = null;
  let action = "support_ai";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId || !actor.userClient) throw new HttpError(401, "Unauthorized");

    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    const agentId = normalizeAgentId(body.agentId);
    action = agentId;
    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0) throw new HttpError(400, "invalid_request");

    const orderId = maybeUuid(body.orderId);
    const reservationId = maybeUuid(body.reservationId);
    const requestedRestaurantId = maybeUuid(body.restaurantId);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 25, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 200, windowSeconds: 60 });

    const orderContext: Record<string, unknown> = {};
    if (orderId) {
      const { data: order, error } = await actor.adminClient
        .from("orders")
        .select("id, user_id, restaurant_id, status, total_amount, delivery_fee, discount_amount, created_at")
        .eq("id", orderId)
        .maybeSingle();

      if (error) throw new HttpError(500, error.message);
      if (!order) throw new HttpError(404, "order_not_found");

      if (!actor.isAdmin && order.user_id !== actor.userId) {
        await requireRestaurantAccess(actor, order.restaurant_id);
      }

      restaurantId = order.restaurant_id;
      Object.assign(orderContext, {
        id: order.id,
        status: order.status,
        total_amount: order.total_amount,
        delivery_fee: order.delivery_fee,
        discount_amount: order.discount_amount,
        created_at: order.created_at,
      });
    }

    const reservationContext: Record<string, unknown> = {};
    if (reservationId) {
      const { data: reservation, error } = await actor.adminClient
        .from("reservations")
        .select("id, user_id, restaurant_id, status, feature, party_size, total_amount, created_at")
        .eq("id", reservationId)
        .maybeSingle();

      if (error) throw new HttpError(500, error.message);
      if (!reservation) throw new HttpError(404, "reservation_not_found");

      if (!actor.isAdmin && reservation.user_id !== actor.userId) {
        await requireRestaurantAccess(actor, reservation.restaurant_id);
      }

      restaurantId = reservation.restaurant_id;
      Object.assign(reservationContext, {
        id: reservation.id,
        status: reservation.status,
        feature: reservation.feature,
        party_size: reservation.party_size,
        total_amount: reservation.total_amount,
        created_at: reservation.created_at,
      });
    }

    if (!restaurantId && requestedRestaurantId) {
      const restaurant = await requireRestaurantAccess(actor, requestedRestaurantId);
      restaurantId = restaurant.id;
    }

    if (restaurantId) {
      await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 60, windowSeconds: 3600 });
    }

    const { data: safetyRules } = await actor.adminClient
      .from("ai_safety_rules")
      .select("rule_key, label, severity, auto_escalate, max_auto_credit_chf, instructions")
      .eq("scope", "platform")
      .eq("is_active", true)
      .limit(20);

    const lastUserMessage = messages.filter((message) => message.role === "user").at(-1);
    const { data: conversation, error: conversationError } = await actor.adminClient
      .from("ai_conversations")
      .insert({
        scope: "client",
        user_id: actor.userId,
        restaurant_id: restaurantId,
        order_id: orderId,
        reservation_id: reservationId,
        title: lastUserMessage?.content.slice(0, 140) || "Support IA TOK",
        metadata: { agent_id: agentId },
      })
      .select("id")
      .single();

    if (conversationError) throw new HttpError(500, conversationError.message);
    conversationId = conversation.id;

    await actor.adminClient.from("ai_messages").insert(
      messages.map((message) => ({
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        model: OPENAI_MODEL,
      })),
    );

    const systemPrompt = `Tu es l'agent support IA de TOK, plateforme suisse de restauration.
Reponds en francais clair et utile.
Tu peux aider pour les commandes, paiements, abonnements Tok One, reservations et questions generales.
Tu ne dois jamais promettre un remboursement, une compensation importante ou une action irreverssible.
Toute demande de parler a un humain, allergie/intoxication, menace juridique, paiement sensible ou litige doit etre escaladee.
Si tu proposes un avoir, il est indicatif et plafonne a 5 CHF.`;

    const openAIResponse = await createOpenAIResponse({
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content: JSON.stringify({
            agent_id: agentId,
            order: orderContext,
            reservation: reservationContext,
            safety_rules: safetyRules || [],
          }),
        },
        ...messages,
      ],
      maxOutputTokens: 900,
      jsonSchema: {
        name: "tok_client_support_answer",
        description: "Support answer and safe escalation decision.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<ClientAiResult>(openAIResponse);
    const usage = extractUsage(openAIResponse);

    let ticketId: string | null = null;
    const canCreateTicket = result.should_escalate && Boolean(restaurantId);
    if (canCreateTicket) {
      const { data: createdIncidentId, error: incidentError } = await actor.userClient.rpc(
        "create_support_incident",
        {
          p_category: result.category,
          p_subject: result.ticket_title || "Incident support IA",
          p_description: result.ticket_summary || messages.at(-1)?.content || null,
          p_order_id: orderId,
          p_reservation_id: reservationId,
          p_restaurant_id: restaurantId,
          p_priority: result.priority,
          p_metadata: {
            source: "ai-client-chat",
            agent_id: agentId,
            conversation_id: conversationId,
            suggested_credit_chf: result.suggested_credit_chf,
          },
        },
      );

      if (!incidentError) {
        ticketId = createdIncidentId as string;
        await actor.adminClient
          .from("ai_conversations")
          .update({ status: "ticket_created", support_incident_id: ticketId })
          .eq("id", conversationId);
        await appendChatTranscriptToIncident(actor, {
          incidentId: ticketId,
          conversationId,
          messages,
          assistantReply: result.reply,
        }).catch((transcriptError) => {
          log.warn("support_incident_transcript_append_failed", {
            message: transcriptError instanceof Error ? transcriptError.message : "unknown",
          });
        });
        await notifyAdminsOfChatIncident(actor, {
          incidentId: ticketId,
          conversationId,
          title: result.ticket_title,
          summary: result.ticket_summary,
          priority: result.priority,
          orderId,
          reservationId,
          restaurantId,
        }).catch((notificationError) => {
          log.warn("support_incident_admin_notification_failed", {
            message: notificationError instanceof Error ? notificationError.message : "unknown",
          });
        });
      } else {
        log.warn("support_incident_create_failed", { message: incidentError.message });
      }
    }

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: result.reply,
      model: OPENAI_MODEL,
      usage,
      metadata: {
        category: result.category,
        priority: result.priority,
        should_escalate: result.should_escalate,
        ticket_id: ticketId,
      },
    });

    await insertUsage(actor, {
      status: "success",
      action,
      conversationId,
      restaurantId,
      usage,
      metadata: {
        agent_id: agentId,
        ticket_created: Boolean(ticketId),
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: "ai_conversations",
      targetEntityId: conversationId,
      metadata: { rid: log.rid, ticket_id: ticketId },
    });

    return jsonResponse({
      reply: result.reply,
      category: result.category,
      priority: result.priority,
      shouldEscalate: result.should_escalate,
      ticketId,
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
        restaurantId,
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
