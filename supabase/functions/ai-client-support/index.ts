import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { notifyAdmins } from "../_shared/notifications.ts";
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

type SupportMessage = { role: "user" | "assistant"; content: string };
type SupportStatus = "open" | "waiting_restaurant" | "waiting_tok" | "resolved" | "escalated";

type SupportResult = {
  reply: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: SupportStatus;
  should_escalate: boolean;
  ticket_title: string;
  ticket_summary: string;
  suggested_next_steps: string[];
};

type ConversationMetadata = Record<string, unknown> & {
  handoff_to_admin?: boolean;
  ai_disabled?: boolean;
};

const FUNCTION_NAME = "ai-client-support";
const FEATURE_NAME = "ai_support_chat";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "category",
    "priority",
    "status",
    "should_escalate",
    "ticket_title",
    "ticket_summary",
    "suggested_next_steps",
  ],
  properties: {
    reply: { type: "string" },
    category: { type: "string" },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    status: { type: "string", enum: ["open", "waiting_restaurant", "waiting_tok", "resolved", "escalated"] },
    should_escalate: { type: "boolean" },
    ticket_title: { type: "string" },
    ticket_summary: { type: "string" },
    suggested_next_steps: { type: "array", items: { type: "string" } },
  },
};

const DEVANAGARI_SCRIPT_PATTERN = /[\u0900-\u097F]+/g;

function normalizeFrenchSupportReply(value: string) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "";

  const normalized = trimmed
    .replace(/prochain\s+[\u0900-\u097F]+(?=\s*:)/gi, "prochain message")
    .replace(DEVANAGARI_SCRIPT_PATTERN, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s+:/g, " :")
    .trim();

  return normalized || trimmed;
}

function normalizeSupportResult(result: SupportResult): SupportResult {
  return {
    ...result,
    reply: normalizeFrenchSupportReply(result.reply),
    ticket_title: normalizeFrenchSupportReply(result.ticket_title),
    ticket_summary: normalizeFrenchSupportReply(result.ticket_summary),
    suggested_next_steps: (Array.isArray(result.suggested_next_steps) ? result.suggested_next_steps : [])
      .map((step) => normalizeFrenchSupportReply(step))
      .filter((step) => step.length > 0),
  };
}

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeMessages(raw: unknown): SupportMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .slice(-18)
    .map((entry): SupportMessage => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: typeof entry.content === "string" ? entry.content.trim().slice(0, 2500) : "",
    }))
    .filter((entry) => entry.content.length > 0);
}

function isQuotaAllowed(value: unknown) {
  if (!value || typeof value !== "object") return true;
  return (value as Record<string, unknown>).allowed !== false;
}

function isMissingQuotaRpc(error: { message?: string } | null | undefined) {
  const message = error?.message || "";
  return message.includes("check_restaurant_ai_quota") || message.includes("schema cache");
}

function getConversationMetadata(value: unknown): ConversationMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ConversationMetadata : {};
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

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    action: string;
    restaurantId?: string | null;
    conversationId?: string | null;
    supportTicketId?: string | null;
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
    conversation_id: payload.conversationId || null,
    status: payload.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_chf: estimateCostChf(payload.model, inputTokens, outputTokens),
    metadata: {
      feature: FEATURE_NAME,
      support_ticket_id: payload.supportTicketId || null,
      credit_kind: "ai_tools",
      credit_units: getOpenAITextCreditUnits(payload.model, inputTokens, outputTokens),
      ...(payload.metadata || {}),
    },
  });
}

async function appendSupportTranscriptToIncident(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    incidentId: string;
    conversationId: string;
    messages: SupportMessage[];
    assistantReply: string;
    supportTicketId: string;
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
        ai_support_ticket_id: input.supportTicketId,
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
        ai_support_ticket_id: input.supportTicketId,
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

async function notifyAdminsOfSupportIncident(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    incidentId: string;
    conversationId: string;
    supportTicketId: string;
    title: string;
    summary: string;
    priority: string;
    orderId: string | null;
    reservationId: string | null;
    restaurantId: string | null;
  },
) {
  await notifyAdmins({
    adminClient: actor.adminClient,
    title: "Nouveau sinistre chat",
    body: `${input.priority.toUpperCase()} - ${input.title || input.summary || "Plainte client remontée par le chat"}`.slice(0, 240),
    type: "support_incident",
    category: "system",
    data: {
      url: `/admin/sinistres?incident=${input.incidentId}`,
      support_incident_id: input.incidentId,
      conversation_id: input.conversationId,
      ai_support_ticket_id: input.supportTicketId,
      order_id: input.orderId,
      reservation_id: input.reservationId,
      restaurant_id: input.restaurantId,
      source: FUNCTION_NAME,
    },
    requestedChannels: { in_app: true, push: true, email: false },
  });
}

async function notifyAdminsOfSupportTicket(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    supportTicketId: string;
    conversationId: string;
    title: string;
    summary: string;
    priority: string;
    status: string;
    orderId: string | null;
    reservationId: string | null;
    restaurantId: string | null;
  },
) {
  await notifyAdmins({
    adminClient: actor.adminClient,
    title: "Nouveau ticket support IA",
    body: `${input.priority.toUpperCase()} - ${input.title || input.summary || "Demande support IA ouverte"}`.slice(0, 240),
    type: "ai_support_ticket",
    category: "system",
    data: {
      url: `/admin/sinistres?ticket=${input.supportTicketId}`,
      ai_support_ticket_id: input.supportTicketId,
      conversation_id: input.conversationId,
      order_id: input.orderId,
      reservation_id: input.reservationId,
      restaurant_id: input.restaurantId,
      status: input.status,
      source: FUNCTION_NAME,
    },
    requestedChannels: { in_app: true, push: true, email: false },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  let conversationId: string | null = null;
  let supportTicketId: string | null = null;
  const model = selectTokAiModel("support");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId || !actor.userClient) throw new HttpError(401, "Unauthorized");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0) throw new HttpError(400, "messages_required");

    const requestedConversationId = maybeUuid(body.conversationId);
    let orderId = maybeUuid(body.orderId);
    let reservationId = maybeUuid(body.reservationId);
    let requestedRestaurantId = maybeUuid(body.restaurantId);
    const context = typeof body.context === "object" && body.context ? body.context : {};

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 30, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 240, windowSeconds: 60 });

    let existingConversation: Record<string, any> | null = null;
    if (requestedConversationId) {
      const { data, error } = await actor.adminClient
        .from("ai_conversations")
        .select("id, user_id, restaurant_id, order_id, reservation_id, scope, status, title, support_incident_id, metadata")
        .eq("id", requestedConversationId)
        .maybeSingle();

      if (error) throw new HttpError(500, error.message);
      if (!data) throw new HttpError(404, "conversation_not_found");
      if (!actor.isAdmin && data.user_id !== actor.userId) {
        if (!data.restaurant_id) throw new HttpError(403, "forbidden");
        await requireRestaurantAccess(actor, data.restaurant_id);
      }

      existingConversation = data;
      conversationId = requestedConversationId;
      orderId = orderId || maybeUuid(data.order_id);
      reservationId = reservationId || maybeUuid(data.reservation_id);
      restaurantId = data.restaurant_id || null;
      requestedRestaurantId = requestedRestaurantId || restaurantId;
    }

    const orderContext: Record<string, unknown> = {};
    if (orderId) {
      const { data: order, error } = await actor.adminClient
        .from("orders")
        .select("id, user_id, restaurant_id, status, total_amount, delivery_fee, created_at, metadata")
        .eq("id", orderId)
        .maybeSingle();

      if (error) throw new HttpError(500, error.message);
      if (!order) throw new HttpError(404, "order_not_found");
      if (!actor.isAdmin && order.user_id !== actor.userId) await requireRestaurantAccess(actor, order.restaurant_id);
      restaurantId = order.restaurant_id;
      Object.assign(orderContext, order);
    }

    const reservationContext: Record<string, unknown> = {};
    if (reservationId) {
      const { data: reservation, error } = await actor.adminClient
        .from("reservations")
        .select("id, user_id, restaurant_id, status, feature, party_size, total_amount, created_at, metadata")
        .eq("id", reservationId)
        .maybeSingle();

      if (error) throw new HttpError(500, error.message);
      if (!reservation) throw new HttpError(404, "reservation_not_found");
      if (!actor.isAdmin && reservation.user_id !== actor.userId) {
        await requireRestaurantAccess(actor, reservation.restaurant_id);
      }
      restaurantId = reservation.restaurant_id;
      Object.assign(reservationContext, reservation);
    }

    if (!restaurantId && requestedRestaurantId) {
      const restaurant = await requireRestaurantAccess(actor, requestedRestaurantId);
      restaurantId = restaurant.id;
    }

    if (restaurantId) {
      await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 120, windowSeconds: 3600 });
      const quota = await checkRestaurantQuota(actor, restaurantId);
      if (!isQuotaAllowed(quota)) throw new HttpError(402, "ai_quota_exceeded");
    }

    const lastUserMessage = messages.filter((message) => message.role === "user").at(-1);
    const messagesToPersist = existingConversation && lastUserMessage ? [lastUserMessage] : messages;
    const existingMetadata = getConversationMetadata(existingConversation?.metadata);
    const handoffToAdmin = Boolean(existingMetadata.handoff_to_admin || existingMetadata.ai_disabled);

    if (existingConversation) {
      conversationId = requestedConversationId;
      await actor.adminClient
        .from("ai_conversations")
        .update({
          updated_at: new Date().toISOString(),
          metadata: {
            ...(existingConversation.metadata || {}),
            endpoint: FUNCTION_NAME,
            context,
          },
        })
        .eq("id", conversationId);
    } else {
      const { data: conversation, error: conversationError } = await actor.adminClient
        .from("ai_conversations")
        .insert({
          scope: "client",
          user_id: actor.userId,
          restaurant_id: restaurantId,
          order_id: orderId,
          reservation_id: reservationId,
          title: lastUserMessage?.content.slice(0, 140) || "Support IA TOK",
          metadata: { endpoint: FUNCTION_NAME, context },
        })
        .select("id")
        .single();

      if (conversationError) throw new HttpError(500, conversationError.message);
      conversationId = conversation.id;
    }

    if (!conversationId) throw new HttpError(500, "conversation_not_created");

    const { error: userMessagesError } = await actor.adminClient
      .from("ai_messages")
      .insert(messagesToPersist.map((message) => ({
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        model,
        metadata: {
          source: FUNCTION_NAME,
          handoff_to_admin: handoffToAdmin,
          ai_disabled: handoffToAdmin,
          delivery: handoffToAdmin ? "admin_thread" : "ai_processing",
        },
      })));

    if (userMessagesError) throw new HttpError(500, userMessagesError.message);

    if (handoffToAdmin) {
      const { data: existingSupportTicket, error: existingSupportTicketError } = await actor.adminClient
        .from("ai_support_tickets")
        .select("id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSupportTicketError) throw new HttpError(500, existingSupportTicketError.message);
      supportTicketId = existingSupportTicket?.id || null;

      if (supportTicketId) {
        await actor.adminClient
          .from("ai_support_tickets")
          .update({ status: "waiting_tok", updated_at: new Date().toISOString() })
          .eq("id", supportTicketId);
      }

      await actor.adminClient
        .from("ai_conversations")
        .update({
          updated_at: new Date().toISOString(),
          metadata: {
            ...existingMetadata,
            endpoint: FUNCTION_NAME,
            context,
            handoff_to_admin: true,
            ai_disabled: true,
          },
        })
        .eq("id", conversationId);

      return jsonResponse({
        reply: "",
        category: "human_support",
        priority: "normal",
        status: "waiting_tok",
        shouldEscalate: false,
        suggestedNextSteps: [],
        conversationId,
        supportTicketId,
        supportIncidentId: existingConversation?.support_incident_id || null,
        handoffToAdmin: true,
        aiDisabled: true,
      }, 200, cors);
    }

    const systemPrompt = `Tu es l'agent support IA de TOK en Suisse.
Aucun remboursement automatique: tu ne promets jamais un remboursement, un avoir important, une action juridique ou une modification de commande sans regle explicite.
Tu dois proposer une escalade humaine pour allergie, intoxication, menace juridique, paiement sensible, demande explicite d'humain, abus ou incident critique.
Tu peux classer le statut en open, waiting_restaurant, waiting_tok, resolved ou escalated.
Reponds uniquement en francais clair et court.
N'utilise aucun mot, alphabet ou caractere dans une autre ecriture que le francais courant.`;

    const openAIResponse = await createOpenAIResponse({
      model,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content: JSON.stringify({
            order: orderContext,
            reservation: reservationContext,
            client_context: context,
            safeguards: [
              "Aucun remboursement automatique",
              "pas de conseil medical ou juridique",
              "escalade humaine sur risque critique",
            ],
          }),
        },
        ...messages,
      ],
      maxOutputTokens: 1100,
      jsonSchema: {
        name: "tok_ai_client_support_result",
        description: "Safe support answer, ticket status and escalation decision.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = normalizeSupportResult(parseStructuredOutput<SupportResult>(openAIResponse));
    const usage = extractUsage(openAIResponse);
    const finalStatus: SupportStatus = result.should_escalate ? "escalated" : result.status;

    const supportTicketPayload = {
      conversation_id: conversationId,
      restaurant_id: restaurantId,
      user_id: actor.userId,
      order_id: orderId,
      reservation_id: reservationId,
      title: result.ticket_title || "Demande support IA",
      summary: result.ticket_summary || result.reply,
      category: result.category || "general",
      priority: result.priority,
      status: finalStatus,
      metadata: {
        suggested_next_steps: result.suggested_next_steps,
        should_escalate: result.should_escalate,
      },
    };

    const { data: existingSupportTicket, error: existingSupportTicketError } = await actor.adminClient
      .from("ai_support_tickets")
      .select("id, status")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSupportTicketError) throw new HttpError(500, existingSupportTicketError.message);

    const supportTicketWasCreated = !existingSupportTicket?.id;
    const supportTicketNeedsAdminAttention = finalStatus !== "resolved";
    const supportTicketStatusChanged = Boolean(
      existingSupportTicket?.id
        && existingSupportTicket.status !== finalStatus
        && supportTicketNeedsAdminAttention,
    );

    const supportTicketQuery = existingSupportTicket?.id
      ? actor.adminClient
          .from("ai_support_tickets")
          .update(supportTicketPayload)
          .eq("id", existingSupportTicket.id)
      : actor.adminClient
          .from("ai_support_tickets")
          .insert(supportTicketPayload);

    const { data: supportTicket, error: supportTicketError } = await supportTicketQuery
      .select("id")
      .single();

    if (supportTicketError) throw new HttpError(500, supportTicketError.message);
    const currentSupportTicketId = supportTicket.id;
    supportTicketId = currentSupportTicketId;

    let supportIncidentId: string | null = null;
    if (result.should_escalate && restaurantId) {
      const { data: incidentId, error: incidentError } = await actor.userClient.rpc("create_support_incident", {
        p_category: result.category || "general",
        p_subject: result.ticket_title || "Incident support IA",
        p_description: result.ticket_summary || messages.at(-1)?.content || null,
        p_order_id: orderId,
        p_reservation_id: reservationId,
        p_restaurant_id: restaurantId,
        p_priority: result.priority,
        p_metadata: {
          source: FUNCTION_NAME,
          ai_support_ticket_id: currentSupportTicketId,
          conversation_id: conversationId,
        },
      });

      if (!incidentError && typeof incidentId === "string") {
        supportIncidentId = incidentId;
        await actor.adminClient
          .from("ai_support_tickets")
          .update({ support_incident_id: supportIncidentId })
          .eq("id", currentSupportTicketId);
        await actor.adminClient
          .from("ai_conversations")
          .update({ status: "escalated", support_incident_id: supportIncidentId })
          .eq("id", conversationId);
        await appendSupportTranscriptToIncident(actor, {
          incidentId: supportIncidentId,
          conversationId,
          messages,
          assistantReply: result.reply,
          supportTicketId: currentSupportTicketId,
        }).catch((transcriptError) => {
          log.warn("support_incident_transcript_append_failed", {
            message: transcriptError instanceof Error ? transcriptError.message : "unknown",
          });
        });
        await notifyAdminsOfSupportIncident(actor, {
          incidentId: supportIncidentId,
          conversationId,
          supportTicketId: currentSupportTicketId,
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
      } else if (incidentError) {
        log.warn("support_incident_create_failed", { message: incidentError.message });
      }
    }

    if ((supportTicketWasCreated || supportTicketStatusChanged) && supportTicketNeedsAdminAttention && !supportIncidentId) {
      await notifyAdminsOfSupportTicket(actor, {
        supportTicketId: currentSupportTicketId,
        conversationId,
        title: result.ticket_title,
        summary: result.ticket_summary,
        priority: result.priority,
        status: finalStatus,
        orderId,
        reservationId,
        restaurantId,
      }).catch((notificationError) => {
        log.warn("support_ticket_admin_notification_failed", {
          message: notificationError instanceof Error ? notificationError.message : "unknown",
        });
      });
    }

    const { error: assistantMessageError } = await actor.adminClient
      .from("ai_messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: result.reply,
        model,
        usage,
        metadata: {
          category: result.category,
          priority: result.priority,
          status: finalStatus,
          support_ticket_id: supportTicketId,
          support_incident_id: supportIncidentId,
        },
      });

    if (assistantMessageError) throw new HttpError(500, assistantMessageError.message);

    await insertUsage(actor, {
      status: "success",
      action: FEATURE_NAME,
      restaurantId,
      conversationId,
      supportTicketId,
      model,
      usage,
      metadata: { status: finalStatus, support_incident_id: supportIncidentId },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: FEATURE_NAME,
      actor,
      request: req,
      targetEntityType: "ai_support_tickets",
      targetEntityId: supportTicketId,
      metadata: { rid: log.rid, conversation_id: conversationId },
    });

    return jsonResponse({
      reply: result.reply,
      category: result.category,
      priority: result.priority,
      status: finalStatus,
      shouldEscalate: result.should_escalate,
      suggestedNextSteps: result.suggested_next_steps,
      conversationId,
      supportTicketId,
      supportIncidentId,
    }, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await insertUsage(actor, {
        status: "failure",
        action: FEATURE_NAME,
        restaurantId,
        conversationId,
        supportTicketId,
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
        targetEntityType: "ai_support_tickets",
        targetEntityId: supportTicketId || conversationId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
