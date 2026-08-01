import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  createIdempotencyKey,
  isRecord,
  maybeUuid,
  sanitizeMultilineText,
  sanitizeText,
  safeErrorMessage,
} from "../_shared/intelligence.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

type ResolutionAction =
  | "add_internal_note"
  | "resend_booking_confirmation"
  | "resend_order_receipt"
  | "request_restaurant_response"
  | "set_waiting_customer"
  | "set_waiting_restaurant"
  | "close_incident"
  | "request_refund"
  | "grant_credit"
  | "manual_review";

type SupportResolutionResult = {
  title: string;
  executive_summary: string;
  timeline: Array<{
    at: string;
    event: string;
    evidence: string;
  }>;
  confirmed_facts: string[];
  uncertainties: string[];
  probable_cause: string;
  risk_level: "low" | "medium" | "high" | "critical";
  confidence: number;
  recommended_actions: Array<{
    action_type: ResolutionAction;
    label: string;
    reason: string;
    arguments: {
      note: string;
      message: string;
      status: string;
    };
  }>;
  customer_safe_summary: string;
  warnings: string[];
};

const FUNCTION_NAME = "ai-support-resolution";
const FEATURE_NAME = "admin-support-resolution";
const FINANCIAL_ACTIONS = new Set<ResolutionAction>([
  "request_refund",
  "grant_credit",
]);
const LOW_RISK_ACTIONS = new Set<ResolutionAction>([
  "add_internal_note",
  "resend_booking_confirmation",
  "resend_order_receipt",
]);
const ACTION_TYPES: ResolutionAction[] = [
  "add_internal_note",
  "resend_booking_confirmation",
  "resend_order_receipt",
  "request_restaurant_response",
  "set_waiting_customer",
  "set_waiting_restaurant",
  "close_incident",
  "request_refund",
  "grant_credit",
  "manual_review",
];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "executive_summary",
    "timeline",
    "confirmed_facts",
    "uncertainties",
    "probable_cause",
    "risk_level",
    "confidence",
    "recommended_actions",
    "customer_safe_summary",
    "warnings",
  ],
  properties: {
    title: { type: "string" },
    executive_summary: { type: "string" },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["at", "event", "evidence"],
        properties: {
          at: { type: "string" },
          event: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    confirmed_facts: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
    probable_cause: { type: "string" },
    risk_level: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action_type", "label", "reason", "arguments"],
        properties: {
          action_type: { type: "string", enum: ACTION_TYPES },
          label: { type: "string" },
          reason: { type: "string" },
          arguments: {
            type: "object",
            additionalProperties: false,
            required: ["note", "message", "status"],
            properties: {
              note: { type: "string" },
              message: { type: "string" },
              status: { type: "string" },
            },
          },
        },
      },
    },
    customer_safe_summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
};

function normalizeAction(raw: unknown) {
  const value = sanitizeText(raw, 64).toLowerCase();
  if (
    value === "list" ||
    value === "analyze" ||
    value === "execute" ||
    value === "reject"
  ) {
    return value;
  }
  return "list";
}

function normalizeRiskLevel(
  value: unknown,
): "low" | "medium" | "high" | "critical" {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }
  return "medium";
}

function isResolutionAction(value: unknown): value is ResolutionAction {
  return ACTION_TYPES.includes(value as ResolutionAction);
}

function normalizeArguments(value: unknown) {
  const source = isRecord(value) ? value : {};
  return {
    note: sanitizeMultilineText(source.note, 3000),
    message: sanitizeMultilineText(source.message, 1000),
    status: sanitizeText(source.status, 60),
  };
}

async function recordUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    status: "success" | "failure";
    action: string;
    incidentId?: string | null;
    runId?: string | null;
    model: string;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const inputTokens = input.usage?.input_tokens ?? 0;
  const outputTokens = input.usage?.output_tokens ?? 0;
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: input.action,
    feature_name: FEATURE_NAME,
    source: FUNCTION_NAME,
    model: input.model,
    user_id: actor.userId,
    status: input.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_chf: estimateOpenAITextCostChf(
      input.model,
      inputTokens,
      outputTokens,
    ),
    metadata: {
      credit_kind: "ai_tools",
      credit_units: getOpenAITextCreditUnits(
        input.model,
        inputTokens,
        outputTokens,
      ),
      incident_id: input.incidentId || null,
      resolution_run_id: input.runId || null,
      ...(input.metadata || {}),
    },
  });
}

async function getIncidentContext(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  incidentId: string,
) {
  const { data: incident, error: incidentError } = await actor.adminClient
    .from("support_incidents")
    .select(
      "id, user_id, restaurant_id, order_id, reservation_id, opened_by, assigned_to, category, priority, status, subject, description, resolution, metadata, last_message_at, resolved_at, closed_at, created_at, updated_at",
    )
    .eq("id", incidentId)
    .maybeSingle();

  if (incidentError) throw new HttpError(500, incidentError.message);
  if (!incident) throw new HttpError(404, "support_incident_not_found");

  const { data: messages, error: messageError } = await actor.adminClient
    .from("support_incident_messages")
    .select("id, author_role, body, visibility, metadata, created_at")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true })
    .limit(160);

  if (messageError) throw new HttpError(500, messageError.message);

  let order: Record<string, unknown> | null = null;
  if (incident.order_id) {
    const { data, error } = await actor.adminClient
      .from("orders")
      .select(
        "id, user_id, restaurant_id, order_number, status, payment_status, fulfillment_status, total_amount, discount_amount, delivery_fee, refund_status, refunded_amount_chf, restaurant_response_status, restaurant_viewed_at, restaurant_accepted_at, acceptance_deadline_at, created_at, updated_at, cancelled_at, cancellation_reason_code",
      )
      .eq("id", incident.order_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    order = data || null;
  }

  let reservation: Record<string, unknown> | null = null;
  if (incident.reservation_id) {
    const { data, error } = await actor.adminClient
      .from("reservations")
      .select(
        "id, user_id, restaurant_id, order_reference, status, feature, date, time, party_size, total_amount, deposit_amount_chf, deposit_status, refund_status, refunded_amount_chf, restaurant_confirmation_required, restaurant_confirmed_at, reservation_confirmation_deadline_at, created_at, updated_at, cancelled_at, cancellation_reason_code, honored_at",
      )
      .eq("id", incident.reservation_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    reservation = data || null;
  }

  let payments: Array<Record<string, unknown>> = [];
  if (incident.order_id) {
    const { data, error } = await actor.adminClient
      .from("payment_transactions")
      .select(
        "id, order_id, amount, currency, type, status, provider, stripe_mode, created_at",
      )
      .eq("order_id", incident.order_id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new HttpError(500, error.message);
    payments = data || [];
  }

  const userId =
    incident.user_id ||
    (typeof order?.user_id === "string" ? order.user_id : null) ||
    (typeof reservation?.user_id === "string" ? reservation.user_id : null);

  let notifications: Array<Record<string, unknown>> = [];
  if (userId) {
    const { data, error } = await actor.adminClient
      .from("notifications")
      .select("id, title, type, category, read_at, created_at, data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new HttpError(500, error.message);
    notifications = data || [];
  }

  let restaurant: Record<string, unknown> | null = null;
  if (incident.restaurant_id) {
    const { data, error } = await actor.adminClient
      .from("restaurants")
      .select("id, owner_id, name, city, cuisine_type, is_demo")
      .eq("id", incident.restaurant_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    restaurant = data || null;
  }

  return {
    incident,
    messages: (messages || []).map((message: Record<string, unknown>) => ({
      ...message,
      body: sanitizeMultilineText(message.body, 2000),
    })),
    order,
    reservation,
    payments,
    notifications,
    restaurant,
    userId,
  };
}

async function listResolutionWorkspace(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  incidentId: string | null,
) {
  let incidentsQuery = actor.adminClient
    .from("support_incidents")
    .select(
      "id, user_id, restaurant_id, order_id, reservation_id, category, priority, status, subject, description, last_message_at, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (incidentId) {
    incidentsQuery = incidentsQuery.eq("id", incidentId);
  } else {
    incidentsQuery = incidentsQuery.not("status", "in", '("closed","resolved")');
  }

  const { data: incidents, error: incidentsError } = await incidentsQuery;
  if (incidentsError) throw new HttpError(500, incidentsError.message);

  let runsQuery = actor.adminClient
    .from("support_resolution_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  if (incidentId) runsQuery = runsQuery.eq("incident_id", incidentId);

  const { data: runs, error: runsError } = await runsQuery;
  if (runsError) throw new HttpError(500, runsError.message);

  const runIds = (runs || [])
    .map((run: { id?: string | null }) => run.id)
    .filter((id: string | null | undefined): id is string => Boolean(id));

  let actions: Array<Record<string, unknown>> = [];
  if (runIds.length > 0) {
    const { data, error } = await actor.adminClient
      .from("support_resolution_actions")
      .select("*")
      .in("run_id", runIds)
      .order("created_at", { ascending: true });
    if (error) throw new HttpError(500, error.message);
    actions = data || [];
  }

  return {
    incidents: incidents || [],
    runs: runs || [],
    actions,
  };
}

function normalizeResolutionResult(
  result: SupportResolutionResult,
): SupportResolutionResult {
  const actions = Array.isArray(result.recommended_actions)
    ? result.recommended_actions
      .filter((action) => isResolutionAction(action.action_type))
      .slice(0, 8)
      .map((action) => ({
        action_type: action.action_type,
        label: sanitizeText(action.label, 160),
        reason: sanitizeMultilineText(action.reason, 1000),
        arguments: normalizeArguments(action.arguments),
      }))
    : [];

  if (actions.length === 0) {
    actions.push({
      action_type: "manual_review",
      label: "Revue humaine",
      reason:
        "Aucune action automatisable n'est suffisamment étayée par les données disponibles.",
      arguments: {
        note: "Vérifier manuellement le dossier avant toute décision.",
        message: "",
        status: "",
      },
    });
  }

  return {
    title: sanitizeText(result.title, 200),
    executive_summary: sanitizeMultilineText(result.executive_summary, 3000),
    timeline: (Array.isArray(result.timeline) ? result.timeline : [])
      .slice(0, 30)
      .map((entry) => ({
        at: sanitizeText(entry.at, 80),
        event: sanitizeText(entry.event, 240),
        evidence: sanitizeMultilineText(entry.evidence, 800),
      })),
    confirmed_facts: (Array.isArray(result.confirmed_facts)
      ? result.confirmed_facts
      : [])
      .slice(0, 30)
      .map((entry) => sanitizeMultilineText(entry, 800))
      .filter(Boolean),
    uncertainties: (Array.isArray(result.uncertainties)
      ? result.uncertainties
      : [])
      .slice(0, 20)
      .map((entry) => sanitizeMultilineText(entry, 800))
      .filter(Boolean),
    probable_cause: sanitizeMultilineText(result.probable_cause, 2000),
    risk_level: normalizeRiskLevel(result.risk_level),
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
    recommended_actions: actions,
    customer_safe_summary: sanitizeMultilineText(
      result.customer_safe_summary,
      2000,
    ),
    warnings: (Array.isArray(result.warnings) ? result.warnings : [])
      .slice(0, 20)
      .map((entry) => sanitizeMultilineText(entry, 800))
      .filter(Boolean),
  };
}

async function analyzeIncident(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  incidentId: string,
  prompt: string,
  request: Request,
) {
  if (!OPENAI_API_KEY) {
    throw new HttpError(503, "ai_service_unavailable");
  }

  const context = await getIncidentContext(actor, incidentId);
  const model = selectTokAiModel("support_complex");
  const systemPrompt = `Tu es TOK Support & Resolution, agent interne de résolution pour une plateforme suisse de restauration.
Analyse uniquement les faits fournis. N'invente jamais un paiement, un remboursement, une livraison, une réservation ou un échange.
Sépare strictement les faits confirmés des incertitudes.
Toute allergie, intoxication, menace, urgence médicale, risque juridique, fraude, paiement contesté ou remboursement doit être escaladé à une personne.
Tu peux proposer des actions réversibles et auditables. Tu ne peux jamais autoriser ni exécuter un remboursement ou un avoir.
Les actions request_refund et grant_credit sont toujours manuelles.
close_incident doit être proposé seulement si les preuves montrent une résolution réelle.
Rédige le résumé client sans données internes, identifiants techniques ni accusation non vérifiée.
Réponds en français opérationnel.`;

  const openAIResponse = await createOpenAIResponse({
    model,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          prompt,
          incident: context.incident,
          messages: context.messages,
          order: context.order,
          reservation: context.reservation,
          payments: context.payments,
          notifications: context.notifications,
          restaurant: context.restaurant,
        }),
      },
    ],
    maxOutputTokens: 2600,
    reasoning: { effort: "medium" },
    jsonSchema: {
      name: "tok_support_resolution_result",
      description:
        "Fact-based support diagnosis and a controlled action proposal.",
      schema: OUTPUT_SCHEMA,
    },
  });

  const result = normalizeResolutionResult(
    parseStructuredOutput<SupportResolutionResult>(openAIResponse),
  );
  const usage = extractUsage(openAIResponse);
  const hasApprovalAction = result.recommended_actions.some(
    (action) => !LOW_RISK_ACTIONS.has(action.action_type),
  );

  const { data: run, error: runError } = await actor.adminClient
    .from("support_resolution_runs")
    .insert({
      incident_id: incidentId,
      requested_by: actor.userId,
      status: hasApprovalAction ? "awaiting_approval" : "draft",
      title: result.title,
      executive_summary: result.executive_summary,
      analysis: {
        timeline: result.timeline,
        confirmed_facts: result.confirmed_facts,
        uncertainties: result.uncertainties,
        probable_cause: result.probable_cause,
        warnings: result.warnings,
      },
      customer_safe_summary: result.customer_safe_summary,
      risk_level: result.risk_level,
      confidence: result.confidence,
      model,
      usage,
    })
    .select("*")
    .single();

  if (runError) throw new HttpError(500, runError.message);

  const actionRows = result.recommended_actions.map((action, index) => {
    const isFinancial = FINANCIAL_ACTIONS.has(action.action_type);
    const requiresApproval =
      isFinancial || !LOW_RISK_ACTIONS.has(action.action_type);
    return {
      run_id: run.id,
      incident_id: incidentId,
      idempotency_key: createIdempotencyKey(
        `support-resolution:${incidentId}:${run.id}:${index}:${action.action_type}`,
      ),
      action_type: action.action_type,
      label: action.label,
      reason: action.reason,
      arguments: action.arguments,
      requires_approval: requiresApproval,
      status: isFinancial ? "manual_required" : "proposed",
      requested_by: actor.userId,
      result: isFinancial
        ? {
          reason: "financial_action_requires_human_finance_workflow",
          executable_by_agent: false,
        }
        : {},
    };
  });

  const { data: actions, error: actionsError } = await actor.adminClient
    .from("support_resolution_actions")
    .insert(actionRows)
    .select("*");

  if (actionsError) throw new HttpError(500, actionsError.message);

  await recordUsage(actor, {
    status: "success",
    action: "analyze",
    incidentId,
    runId: run.id,
    model,
    usage,
    metadata: {
      action_count: actions?.length || 0,
      risk_level: result.risk_level,
      confidence: result.confidence,
    },
  });

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: FUNCTION_NAME,
    status: "success",
    action: "analyze",
    actor,
    request,
    targetEntityType: "support_resolution_runs",
    targetEntityId: run.id,
    metadata: {
      incident_id: incidentId,
      risk_level: result.risk_level,
      action_count: actions?.length || 0,
    },
  });

  return { run, actions: actions || [], result };
}

async function notifyUser(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    userId: string;
    title: string;
    body: string;
    url: string;
    incidentId: string;
    actionId: string;
    type: string;
  },
) {
  const notificationId = await enqueueNotification({
    adminClient: actor.adminClient,
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type,
    category: "system",
    data: {
      url: input.url,
      support_incident_id: input.incidentId,
      support_resolution_action_id: input.actionId,
      source: FUNCTION_NAME,
    },
    requestedChannels: { in_app: true, push: true, email: false },
  });

  const dispatch = await triggerNotificationDispatch({
    push: true,
    email: false,
    source: FUNCTION_NAME,
    userId: input.userId,
  });

  return { notification_id: notificationId, dispatch };
}

async function executeResolutionAction(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  actionId: string,
  confirmed: boolean,
  request: Request,
) {
  const { data: action, error: actionError } = await actor.adminClient
    .from("support_resolution_actions")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();

  if (actionError) throw new HttpError(500, actionError.message);
  if (!action) throw new HttpError(404, "resolution_action_not_found");

  if (action.status === "completed") {
    return { action, idempotent: true };
  }
  if (action.status === "manual_required") {
    throw new HttpError(409, "financial_action_requires_manual_workflow");
  }
  if (action.status === "rejected") {
    throw new HttpError(409, "resolution_action_rejected");
  }
  if (action.status === "executing") {
    throw new HttpError(409, "resolution_action_already_executing");
  }
  if (action.requires_approval && !confirmed) {
    throw new HttpError(409, "explicit_confirmation_required");
  }

  const actionType = action.action_type as ResolutionAction;
  if (!isResolutionAction(actionType)) {
    throw new HttpError(400, "unsupported_resolution_action");
  }
  if (FINANCIAL_ACTIONS.has(actionType)) {
    await actor.adminClient
      .from("support_resolution_actions")
      .update({
        status: "manual_required",
        result: {
          reason: "financial_action_requires_human_finance_workflow",
          executable_by_agent: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", actionId);
    throw new HttpError(409, "financial_action_requires_manual_workflow");
  }

  const now = new Date().toISOString();
  const { data: lockedAction, error: lockError } = await actor.adminClient
    .from("support_resolution_actions")
    .update({
      status: "executing",
      approved_by: confirmed ? actor.userId : action.approved_by,
      approved_at: confirmed ? now : action.approved_at,
      executed_by: actor.userId,
      updated_at: now,
    })
    .eq("id", actionId)
    .eq("status", "proposed")
    .select("*")
    .maybeSingle();

  if (lockError) throw new HttpError(500, lockError.message);
  if (!lockedAction) {
    const { data: current } = await actor.adminClient
      .from("support_resolution_actions")
      .select("*")
      .eq("id", actionId)
      .maybeSingle();
    if (current?.status === "completed") {
      return { action: current, idempotent: true };
    }
    throw new HttpError(409, "resolution_action_concurrent_update");
  }

  const context = await getIncidentContext(
    actor,
    String(lockedAction.incident_id),
  );
  const argumentsValue = normalizeArguments(lockedAction.arguments);
  const result: Record<string, unknown> = {
    action_type: actionType,
    incident_id: lockedAction.incident_id,
  };

  try {
    if (actionType === "add_internal_note") {
      const body =
        argumentsValue.note ||
        sanitizeMultilineText(lockedAction.reason, 3000) ||
        "Note de résolution ajoutée par TOK.";
      const { data, error } = await actor.adminClient
        .from("support_incident_messages")
        .insert({
          incident_id: lockedAction.incident_id,
          author_id: actor.userId,
          author_role: "admin",
          body,
          visibility: "internal",
          metadata: {
            source: FUNCTION_NAME,
            support_resolution_action_id: actionId,
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      result.message_id = data.id;
    } else if (actionType === "resend_booking_confirmation") {
      const userId =
        (typeof context.reservation?.user_id === "string"
          ? context.reservation.user_id
          : null) || context.userId;
      if (!userId || !context.reservation) {
        throw new HttpError(409, "reservation_recipient_unavailable");
      }
      Object.assign(
        result,
        await notifyUser(actor, {
          userId,
          title: "Confirmation de réservation TOK",
          body:
            argumentsValue.message ||
            `Votre réservation ${String(context.reservation.order_reference || "").trim() || ""} est disponible dans votre espace TOK.`.trim(),
          url: "/reservations",
          incidentId: String(lockedAction.incident_id),
          actionId,
          type: "reservation_confirmation",
        }),
      );
    } else if (actionType === "resend_order_receipt") {
      const userId =
        (typeof context.order?.user_id === "string"
          ? context.order.user_id
          : null) || context.userId;
      if (!userId || !context.order) {
        throw new HttpError(409, "order_recipient_unavailable");
      }
      Object.assign(
        result,
        await notifyUser(actor, {
          userId,
          title: "Récapitulatif de commande TOK",
          body:
            argumentsValue.message ||
            `Votre commande ${String(context.order.order_number || "").trim() || ""} est consultable dans votre espace TOK.`.trim(),
          url: `/commande/${String(context.order.id)}`,
          incidentId: String(lockedAction.incident_id),
          actionId,
          type: "order_receipt",
        }),
      );
    } else if (actionType === "request_restaurant_response") {
      const ownerId =
        typeof context.restaurant?.owner_id === "string"
          ? context.restaurant.owner_id
          : null;
      if (!ownerId) throw new HttpError(409, "restaurant_owner_unavailable");
      Object.assign(
        result,
        await notifyUser(actor, {
          userId: ownerId,
          title: "Réponse demandée par le support TOK",
          body:
            argumentsValue.message ||
            `Une réponse est nécessaire pour le dossier « ${sanitizeText(context.incident.subject, 120)} ».`,
          url: "/dashboard/support",
          incidentId: String(lockedAction.incident_id),
          actionId,
          type: "support_response_requested",
        }),
      );
      const { error } = await actor.adminClient
        .from("support_incidents")
        .update({ status: "waiting_restaurant", updated_at: now })
        .eq("id", lockedAction.incident_id);
      if (error) throw error;
      result.incident_status = "waiting_restaurant";
    } else if (actionType === "set_waiting_customer") {
      const { error } = await actor.adminClient
        .from("support_incidents")
        .update({ status: "waiting_customer", updated_at: now })
        .eq("id", lockedAction.incident_id);
      if (error) throw error;
      result.incident_status = "waiting_customer";
    } else if (actionType === "set_waiting_restaurant") {
      const { error } = await actor.adminClient
        .from("support_incidents")
        .update({ status: "waiting_restaurant", updated_at: now })
        .eq("id", lockedAction.incident_id);
      if (error) throw error;
      result.incident_status = "waiting_restaurant";
    } else if (actionType === "close_incident") {
      const resolution =
        argumentsValue.note ||
        sanitizeMultilineText(lockedAction.reason, 2000) ||
        "Résolution validée par un administrateur TOK.";
      const { error } = await actor.adminClient
        .from("support_incidents")
        .update({
          status: "resolved",
          resolution,
          resolved_at: now,
          updated_at: now,
        })
        .eq("id", lockedAction.incident_id);
      if (error) throw error;
      result.incident_status = "resolved";
    } else if (actionType === "manual_review") {
      const body =
        argumentsValue.note ||
        sanitizeMultilineText(lockedAction.reason, 3000) ||
        "Revue humaine requise.";
      const { data, error } = await actor.adminClient
        .from("support_incident_messages")
        .insert({
          incident_id: lockedAction.incident_id,
          author_id: actor.userId,
          author_role: "admin",
          body,
          visibility: "internal",
          metadata: {
            source: FUNCTION_NAME,
            support_resolution_action_id: actionId,
            manual_review: true,
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: statusError } = await actor.adminClient
        .from("support_incidents")
        .update({ status: "waiting_admin", updated_at: now })
        .eq("id", lockedAction.incident_id);
      if (statusError) throw statusError;
      result.message_id = data.id;
      result.incident_status = "waiting_admin";
    }

    const { data: completedAction, error: completeError } =
      await actor.adminClient
        .from("support_resolution_actions")
        .update({
          status: "completed",
          result,
          executed_at: now,
          last_error: null,
          updated_at: now,
        })
        .eq("id", actionId)
        .select("*")
        .single();
    if (completeError) throw new HttpError(500, completeError.message);

    const { data: remainingActions, error: remainingError } =
      await actor.adminClient
        .from("support_resolution_actions")
        .select("id, status")
        .eq("run_id", completedAction.run_id)
        .in("status", ["proposed", "approved", "executing", "manual_required"]);
    if (remainingError) throw new HttpError(500, remainingError.message);

    if ((remainingActions || []).length === 0) {
      await actor.adminClient
        .from("support_resolution_runs")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("id", completedAction.run_id);
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: `execute:${actionType}`,
      actor,
      request,
      targetEntityType: "support_resolution_actions",
      targetEntityId: actionId,
      metadata: {
        incident_id: completedAction.incident_id,
        run_id: completedAction.run_id,
        confirmed,
      },
    });

    return { action: completedAction, idempotent: false };
  } catch (error) {
    const message = safeErrorMessage(error);
    await actor.adminClient
      .from("support_resolution_actions")
      .update({
        status: "failed",
        last_error: message,
        result: { error: message },
        updated_at: new Date().toISOString(),
      })
      .eq("id", actionId);

    await actor.adminClient
      .from("support_resolution_runs")
      .update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lockedAction.run_id);

    throw error;
  }
}

async function rejectResolutionAction(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  actionId: string,
  reason: string,
  request: Request,
) {
  const { data, error } = await actor.adminClient
    .from("support_resolution_actions")
    .update({
      status: "rejected",
      approved_by: actor.userId,
      approved_at: new Date().toISOString(),
      result: { rejection_reason: reason || "rejected_by_admin" },
      updated_at: new Date().toISOString(),
    })
    .eq("id", actionId)
    .in("status", ["proposed", "manual_required"])
    .select("*")
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(409, "resolution_action_not_rejectable");

  const { data: remaining, error: remainingError } = await actor.adminClient
    .from("support_resolution_actions")
    .select("id")
    .eq("run_id", data.run_id)
    .in("status", ["proposed", "approved", "executing", "manual_required"]);
  if (remainingError) throw new HttpError(500, remainingError.message);

  if ((remaining || []).length === 0) {
    await actor.adminClient
      .from("support_resolution_runs")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.run_id);
  }

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: FUNCTION_NAME,
    status: "success",
    action: "reject",
    actor,
    request,
    targetEntityType: "support_resolution_actions",
    targetEntityId: actionId,
    metadata: {
      incident_id: data.incident_id,
      run_id: data.run_id,
    },
  });

  return data;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action = "list";
  let incidentId: string | null = null;
  let runId: string | null = null;
  const model = selectTokAiModel("support_complex");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireUserRole(actor, ["admin"]);

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body.action);
    incidentId = maybeUuid(body.incidentId);
    const actionId = maybeUuid(body.actionId);
    const prompt = sanitizeMultilineText(body.prompt, 3000);
    const confirmed = body.confirmed === true;
    const reason = sanitizeMultilineText(body.reason, 1000);

    const limiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await limiter.consume(`admin:${actor.userId}`, {
      maxRequests: 40,
      windowSeconds: 3600,
    });
    await limiter.consume("global", {
      maxRequests: 160,
      windowSeconds: 60,
    });

    if (action === "list") {
      return jsonResponse(
        await listResolutionWorkspace(actor, incidentId),
        200,
        cors,
      );
    }

    if (action === "analyze") {
      if (!incidentId) throw new HttpError(400, "incident_id_required");
      const result = await analyzeIncident(
        actor,
        incidentId,
        prompt,
        req,
      );
      runId = result.run.id;
      return jsonResponse(result, 200, cors);
    }

    if (action === "execute") {
      if (!actionId) throw new HttpError(400, "action_id_required");
      return jsonResponse(
        await executeResolutionAction(actor, actionId, confirmed, req),
        200,
        cors,
      );
    }

    if (action === "reject") {
      if (!actionId) throw new HttpError(400, "action_id_required");
      return jsonResponse(
        { action: await rejectResolutionAction(actor, actionId, reason, req) },
        200,
        cors,
      );
    }

    throw new HttpError(400, "unsupported_action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = safeErrorMessage(error);
    log.error("request_failed", {
      action,
      incident_id: incidentId,
      status,
      message,
    });

    if (actor) {
      await recordUsage(actor, {
        status: "failure",
        action,
        incidentId,
        runId,
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
        targetEntityType: incidentId ? "support_incidents" : null,
        targetEntityId: incidentId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
