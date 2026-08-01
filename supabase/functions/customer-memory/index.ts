import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";
import {
  clampNumber,
  getLatestConsent,
  isRecord,
  jsonObject,
  maybeUuid,
  normalizeStringArray,
  requirePersonalizationConsent,
  safeErrorMessage,
  sanitizeMultilineText,
  sanitizeText,
} from "../_shared/intelligence.ts";

type MemoryAction =
  | "list"
  | "upsert"
  | "infer"
  | "confirm"
  | "reject"
  | "delete"
  | "clear"
  | "export";

type MemorySuggestion = {
  key: string;
  label: string;
  category: "preference" | "context" | "budget" | "location" | "service";
  value_text: string;
  values: string[];
  confidence: number;
  expires_in_days: number;
  explanation: string;
};

type MemoryInferenceResult = {
  summary: string;
  suggestions: MemorySuggestion[];
  warnings: string[];
};

const FUNCTION_NAME = "customer-memory";
const MODEL = selectTokAiModel("support");
const VALID_ACTIONS = new Set<MemoryAction>([
  "list",
  "upsert",
  "infer",
  "confirm",
  "reject",
  "delete",
  "clear",
  "export",
]);
const VALID_CATEGORIES = new Set([
  "preference",
  "context",
  "accessibility",
  "dietary",
  "budget",
  "location",
  "service",
]);
const INFERRED_CATEGORIES = new Set(["preference", "context", "budget", "location", "service"]);

const INFERENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "suggestions", "warnings"],
  properties: {
    summary: { type: "string" },
    suggestions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "label",
          "category",
          "value_text",
          "values",
          "confidence",
          "expires_in_days",
          "explanation",
        ],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          category: {
            type: "string",
            enum: ["preference", "context", "budget", "location", "service"],
          },
          value_text: { type: "string" },
          values: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          expires_in_days: { type: "integer", minimum: 1, maximum: 365 },
          explanation: { type: "string" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
};

function normalizeAction(value: unknown): MemoryAction {
  const action = sanitizeText(value, 40).toLowerCase() as MemoryAction;
  if (!VALID_ACTIONS.has(action)) throw new HttpError(400, "invalid_action");
  return action;
}

function normalizeKey(value: unknown, prefix = "explicit") {
  const normalized = sanitizeText(value, 100)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return `${prefix}:${crypto.randomUUID()}`;
  return normalized.includes(":") ? normalized : `${prefix}:${normalized}`;
}

async function appendEvent(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    itemId?: string | null;
    eventType:
      | "created"
      | "updated"
      | "confirmed"
      | "rejected"
      | "deleted"
      | "cleared"
      | "inference_generated"
      | "exported"
      | "consent_blocked";
    payload?: Record<string, unknown>;
  },
) {
  if (!actor.userId) return;
  const { error } = await actor.adminClient.from("customer_memory_events").insert({
    item_id: input.itemId || null,
    user_id: actor.userId,
    actor_user_id: actor.userId,
    event_type: input.eventType,
    payload: input.payload || {},
  });
  if (error) throw new HttpError(500, error.message);
}

async function recordUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    status: "success" | "failure";
    action: string;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const usage = input.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: input.action,
    feature_name: "customer_memory",
    source: FUNCTION_NAME,
    model: MODEL,
    user_id: actor.userId,
    status: input.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage.total_tokens || inputTokens + outputTokens,
    estimated_cost_chf: estimateOpenAITextCostChf(MODEL, inputTokens, outputTokens),
    metadata: {
      credit_kind: "platform_ai",
      credit_units: getOpenAITextCreditUnits(MODEL, inputTokens, outputTokens),
      ...(input.metadata || {}),
    },
  });
}

function sanitizeExplicitValue(raw: unknown) {
  const source = jsonObject(raw);
  return {
    text: sanitizeText(source.text, 500),
    values: normalizeStringArray(source.values, 20, 100),
    boolean: typeof source.boolean === "boolean" ? source.boolean : null,
    number: Number.isFinite(Number(source.number)) ? Number(source.number) : null,
  };
}

function normalizeSuggestion(raw: MemorySuggestion) {
  if (!isRecord(raw)) return null;
  const category = sanitizeText(raw.category, 30).toLowerCase();
  if (!INFERRED_CATEGORIES.has(category)) return null;
  const key = normalizeKey(raw.key, "inferred").replace(/^explicit:/, "inferred:");
  const label = sanitizeText(raw.label, 160);
  const valueText = sanitizeText(raw.value_text, 500);
  const values = normalizeStringArray(raw.values, 20, 100);
  if (!label || (!valueText && values.length === 0)) return null;

  return {
    memory_key: key,
    label,
    category,
    value: {
      text: valueText,
      values,
      explanation: sanitizeText(raw.explanation, 500),
    },
    source: "inferred",
    status: "pending",
    confidence: Number(clampNumber(raw.confidence, 0, 1, 0.5).toFixed(4)),
    sensitivity: "standard",
    evidence: {
      explanation: sanitizeText(raw.explanation, 500),
      generated_at: new Date().toISOString(),
    },
    expires_at: new Date(
      Date.now() + Math.round(clampNumber(raw.expires_in_days, 1, 365, 90)) * 24 * 60 * 60 * 1000,
    ).toISOString(),
    confirmed_at: null,
    rejected_at: null,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action: MemoryAction | "unknown" = "unknown";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireUserRole(actor, ["client"]);
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body.action);

    const rateLimiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 40, windowSeconds: 3600 });
    await rateLimiter.consume("global", { maxRequests: 180, windowSeconds: 60 });

    if (action === "list") {
      const [consent, itemsResult] = await Promise.all([
        getLatestConsent(actor.adminClient, actor.userId),
        actor.adminClient
          .from("customer_memory_items")
          .select("*")
          .eq("user_id", actor.userId)
          .neq("status", "deleted")
          .order("updated_at", { ascending: false })
          .limit(100),
      ]);
      if (itemsResult.error) throw new HttpError(500, itemsResult.error.message);
      return jsonResponse({
        consentGranted: Boolean(consent?.personalization),
        consent,
        items: itemsResult.data || [],
      }, 200, cors);
    }

    if (action === "export") {
      const [itemsResult, eventsResult, consent] = await Promise.all([
        actor.adminClient
          .from("customer_memory_items")
          .select("*")
          .eq("user_id", actor.userId)
          .order("created_at", { ascending: true })
          .limit(500),
        actor.adminClient
          .from("customer_memory_events")
          .select("id, item_id, event_type, payload, created_at")
          .eq("user_id", actor.userId)
          .order("created_at", { ascending: true })
          .limit(1000),
        getLatestConsent(actor.adminClient, actor.userId),
      ]);
      if (itemsResult.error) throw new HttpError(500, itemsResult.error.message);
      if (eventsResult.error) throw new HttpError(500, eventsResult.error.message);
      await appendEvent(actor, { eventType: "exported" });
      return jsonResponse({
        exportedAt: new Date().toISOString(),
        consent,
        items: itemsResult.data || [],
        events: eventsResult.data || [],
      }, 200, cors);
    }

    if (action === "clear") {
      const now = new Date().toISOString();
      const { data, error } = await actor.adminClient
        .from("customer_memory_items")
        .update({
          status: "deleted",
          deleted_at: now,
          updated_at: now,
        })
        .eq("user_id", actor.userId)
        .neq("status", "deleted")
        .select("id");
      if (error) throw new HttpError(500, error.message);
      await appendEvent(actor, {
        eventType: "cleared",
        payload: { cleared_count: data?.length || 0 },
      });
      return jsonResponse({ cleared: data?.length || 0 }, 200, cors);
    }

    const itemId = maybeUuid(body.itemId);
    if (action === "confirm" || action === "reject" || action === "delete") {
      if (!itemId) throw new HttpError(400, "item_required");
      const nextStatus = action === "confirm" ? "active" : action === "reject" ? "rejected" : "deleted";
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status: nextStatus,
        updated_at: now,
      };
      if (action === "confirm") patch.confirmed_at = now;
      if (action === "reject") patch.rejected_at = now;
      if (action === "delete") patch.deleted_at = now;

      const { data, error } = await actor.adminClient
        .from("customer_memory_items")
        .update(patch)
        .eq("id", itemId)
        .eq("user_id", actor.userId)
        .select("*")
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!data) throw new HttpError(404, "memory_item_not_found");
      await appendEvent(actor, {
        itemId,
        eventType: action === "confirm" ? "confirmed" : action === "reject" ? "rejected" : "deleted",
      });
      return jsonResponse({ item: data }, 200, cors);
    }

    if (action === "upsert") {
      try {
        await requirePersonalizationConsent(actor.adminClient, actor.userId);
      } catch (error) {
        await appendEvent(actor, {
          eventType: "consent_blocked",
          payload: { attempted_action: action },
        }).catch(() => {});
        throw error;
      }

      const category = sanitizeText(body.category, 30).toLowerCase();
      if (!VALID_CATEGORIES.has(category)) throw new HttpError(400, "invalid_category");
      const label = sanitizeText(body.label, 160);
      if (!label) throw new HttpError(400, "label_required");
      const memoryKey = normalizeKey(body.memoryKey || label, "explicit");
      const value = sanitizeExplicitValue(body.value);
      if (!value.text && value.values.length === 0 && value.boolean === null && value.number === null) {
        throw new HttpError(400, "value_required");
      }

      const { data: existing, error: existingError } = await actor.adminClient
        .from("customer_memory_items")
        .select("id")
        .eq("user_id", actor.userId)
        .eq("memory_key", memoryKey)
        .maybeSingle();
      if (existingError) throw new HttpError(500, existingError.message);

      const now = new Date().toISOString();
      const { data, error } = await actor.adminClient
        .from("customer_memory_items")
        .upsert({
          user_id: actor.userId,
          memory_key: memoryKey,
          label,
          category,
          value,
          source: "explicit",
          status: "active",
          confidence: 1,
          sensitivity: category === "dietary" || category === "accessibility"
            ? "sensitive"
            : "standard",
          evidence: { provided_by_user: true },
          confirmed_at: now,
          rejected_at: null,
          deleted_at: null,
          expires_at: null,
          updated_at: now,
        }, { onConflict: "user_id,memory_key" })
        .select("*")
        .single();
      if (error) throw new HttpError(500, error.message);

      await appendEvent(actor, {
        itemId: data.id,
        eventType: existing ? "updated" : "created",
        payload: { category, source: "explicit" },
      });
      return jsonResponse({ item: data }, 200, cors);
    }

    if (action !== "infer") throw new HttpError(400, "invalid_action");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    try {
      await requirePersonalizationConsent(actor.adminClient, actor.userId);
    } catch (error) {
      await appendEvent(actor, {
        eventType: "consent_blocked",
        payload: { attempted_action: action },
      }).catch(() => {});
      throw error;
    }

    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const [
      preferencesResult,
      favoritesResult,
      reservationsResult,
      ordersResult,
      searchesResult,
    ] = await Promise.all([
      actor.adminClient
        .from("user_preferences")
        .select("dietary_tags, max_budget, favorite_cuisines, updated_at")
        .eq("user_id", actor.userId)
        .maybeSingle(),
      actor.adminClient
        .from("favorites")
        .select("restaurant_id, created_at, restaurants(name, city, cuisine_type)")
        .eq("user_id", actor.userId)
        .order("created_at", { ascending: false })
        .limit(40),
      actor.adminClient
        .from("reservations")
        .select("restaurant_id, date, time, party_size, status, feature, restaurants(name, city, cuisine_type)")
        .eq("user_id", actor.userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(60),
      actor.adminClient
        .from("orders")
        .select("restaurant_id, total_amount, type, source, status, created_at, restaurants(name, city, cuisine_type)")
        .eq("user_id", actor.userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(80),
      actor.adminClient
        .from("search_logs")
        .select("search_query, results_count, created_at")
        .eq("user_id", actor.userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    const context = {
      requested_at: new Date().toISOString(),
      explicit_preferences: preferencesResult.data || null,
      favorites: favoritesResult.data || [],
      reservations: reservationsResult.data || [],
      orders: ordersResult.data || [],
      searches: searchesResult.data || [],
    };

    const response = await createOpenAIResponse({
      model: MODEL,
      input: [
        {
          role: "system",
          content: `Tu es TOK Customer Memory, un moteur prudent de préférences culinaires.
Le client a explicitement activé la personnalisation, mais chaque déduction doit rester proposée en attente de confirmation.
N'infère jamais santé, allergie, handicap, religion, origine, politique, sexualité, problèmes financiers, situation juridique ou contenu de support.
N'utilise pas les dietary_tags pour créer une nouvelle déduction : ils peuvent être affichés ailleurs comme préférence explicite, pas réinterprétés.
Ne crée que des préférences de restaurant, budget approximatif, localisation générale, moment de service ou contexte de sortie.
Une faible preuve donne une faible confiance. N'invente rien.
Les clés doivent être courtes, stables et en minuscules.`,
        },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens: 1500,
      jsonSchema: {
        name: "tok_customer_memory_suggestions",
        description: "Non-sensitive preference suggestions requiring customer confirmation.",
        schema: INFERENCE_SCHEMA,
      },
    });

    const result = parseStructuredOutput<MemoryInferenceResult>(response);
    const suggestions = (Array.isArray(result.suggestions) ? result.suggestions : [])
      .map(normalizeSuggestion)
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .slice(0, 12);

    const storedItems: unknown[] = [];
    for (const suggestion of suggestions) {
      const { data, error } = await actor.adminClient
        .from("customer_memory_items")
        .upsert({
          ...suggestion,
          user_id: actor.userId,
        }, { onConflict: "user_id,memory_key" })
        .select("*")
        .single();
      if (error) throw new HttpError(500, error.message);
      storedItems.push(data);
      await appendEvent(actor, {
        itemId: data.id,
        eventType: "inference_generated",
        payload: {
          category: data.category,
          confidence: data.confidence,
        },
      });
    }

    const usage = extractUsage(response);
    await recordUsage(actor, {
      status: "success",
      action,
      usage,
      metadata: {
        suggestion_count: storedItems.length,
        warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 5) : [],
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      action,
      status: "success",
      actor,
      request: req,
      targetEntityType: "customer_memory_items",
      targetEntityId: actor.userId,
      metadata: {
        suggestion_count: storedItems.length,
        consent_required: true,
      },
    });

    return jsonResponse({
      summary: sanitizeMultilineText(result.summary, 1200),
      warnings: Array.isArray(result.warnings)
        ? result.warnings.map((entry) => sanitizeText(entry, 300)).filter(Boolean).slice(0, 10)
        : [],
      items: storedItems,
    }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = safeErrorMessage(error);
    log.error("request_failed", { status, message, action });

    if (actor) {
      if (action === "infer") {
        await recordUsage(actor, {
          status: "failure",
          action,
          metadata: { error: message, rid: log.rid },
        }).catch(() => {});
      }
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        action,
        status: "failure",
        actor,
        request: req,
        targetEntityType: "customer_memory_items",
        targetEntityId: actor.userId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
