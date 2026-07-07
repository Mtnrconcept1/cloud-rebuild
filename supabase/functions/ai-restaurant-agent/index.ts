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
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";
import {
  assertTokCreditSpendRecorded,
  estimateTextAiPreflightCredits,
  requireRestaurantTokCreditBalance,
} from "../_shared/restaurant-credits.ts";

type RestaurantAgentAction =
  | "general"
  | "menu_optimizer"
  | "photo_enhancer"
  | "marketing_campaign"
  | "sales_insights"
  | "promotions"
  | "review_reply";

type RestaurantAgentResult = {
  title: string;
  summary: string;
  markdown: string;
  recommended_actions: string[];
  warnings: string[];
  confidence: "low" | "medium" | "high";
};

const FUNCTION_NAME = "ai-restaurant-agent";

const FEATURE_BY_ACTION: Record<RestaurantAgentAction, string> = {
  general: "ai_sales_insights",
  menu_optimizer: "ai_menu_optimizer",
  photo_enhancer: "ai_photo_enhancer",
  marketing_campaign: "ai_marketing_campaigns",
  sales_insights: "ai_sales_insights",
  promotions: "ai_marketing_campaigns",
  review_reply: "ai_sales_insights",
};

const ACTION_LABELS: Record<RestaurantAgentAction, string> = {
  general: "Assistant IA général",
  menu_optimizer: "Optimisation du menu",
  photo_enhancer: "Photos & visuels",
  marketing_campaign: "Campagnes marketing",
  sales_insights: "Analyse des ventes",
  promotions: "Promotions recommandées",
  review_reply: "Réponses aux avis",
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "markdown", "recommended_actions", "warnings", "confidence"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    markdown: { type: "string" },
    recommended_actions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

function normalizeAction(raw: unknown): RestaurantAgentAction {
  if (
    raw === "general" ||
    raw === "menu_optimizer" ||
    raw === "photo_enhancer" ||
    raw === "marketing_campaign" ||
    raw === "sales_insights" ||
    raw === "promotions" ||
    raw === "review_reply"
  ) {
    return raw;
  }
  return "general";
}

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeText(raw: unknown, max = 3500) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
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
  featureName: string,
) {
  const { data, error } = await actor.adminClient.rpc("check_restaurant_ai_quota", {
    p_restaurant_id: restaurantId,
    p_feature: featureName,
    p_units: 1,
  });

  if (!error) return data;
  if (!isMissingQuotaRpc(error)) throw new HttpError(503, error.message);

  return {
    allowed: true,
    feature: featureName,
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
    featureName: string;
    restaurantId?: string | null;
    conversationId?: string | null;
    taskId?: string | null;
    model: string;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const inputTokens = payload.usage?.input_tokens ?? 0;
  const outputTokens = payload.usage?.output_tokens ?? 0;

  const { error } = await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    feature_name: payload.featureName,
    source: FUNCTION_NAME,
    model: payload.model,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    conversation_id: payload.conversationId || null,
    task_id: payload.taskId || null,
    status: payload.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_chf: estimateCostChf(payload.model, inputTokens, outputTokens),
    metadata: {
      feature: payload.featureName,
      credit_kind: "ai_tools",
      credit_units: getOpenAITextCreditUnits(payload.model, inputTokens, outputTokens),
      ...(payload.metadata || {}),
    },
  });
  assertTokCreditSpendRecorded(error);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  let conversationId: string | null = null;
  let taskId: string | null = null;
  let action: RestaurantAgentAction = "general";
  let featureName = FEATURE_BY_ACTION.general;
  let model = selectTokAiModel("restaurant");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    restaurantId = maybeUuid(body.restaurantId);
    action = normalizeAction(body.action);
    featureName = FEATURE_BY_ACTION[action];
    model = action === "sales_insights" ? selectTokAiModel("strategy") : selectTokAiModel("restaurant");
    const prompt = sanitizeText(body.prompt || body.message || ACTION_LABELS[action]);
    const draftContext = typeof body.context === "object" && body.context ? body.context : {};

    if (!restaurantId) throw new HttpError(400, "restaurant_required");
    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 25, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 90, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 220, windowSeconds: 60 });

    const quota = await checkRestaurantQuota(actor, restaurantId, featureName);
    if (!isQuotaAllowed(quota)) throw new HttpError(402, "ai_quota_exceeded");

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [profileResult, menuResult, ordersResult, reviewsResult, campaignsResult, assetsResult] = await Promise.all([
      actor.adminClient
        .from("restaurant_ai_profiles")
        .select("brand_tone, specialties, visual_style, default_language, guardrails")
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
      actor.adminClient
        .from("menu_items")
        .select("id, name, description, price, category, is_available, image_url")
        .eq("restaurant_id", restaurantId)
        .limit(120),
      actor.adminClient
        .from("orders")
        .select("id, status, total_amount, delivery_fee, discount_amount, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300),
      actor.adminClient
        .from("reviews")
        .select("id, rating, quality_rating, service_rating, speed_rating, comment, created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(50),
      actor.adminClient
        .from("ad_campaigns")
        .select("id, title, type, status, impressions, clicks, conversions, spent, total_budget, starts_at, ends_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(25),
      actor.adminClient
        .from("ai_generated_assets")
        .select("id, title, asset_type, asset_url, status, created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const orders = (ordersResult.data || []) as Array<Record<string, unknown>>;
    const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const context = {
      action,
      feature: featureName,
      prompt,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        city: restaurant.city,
        cuisine_type: restaurant.cuisine_type,
      },
      ai_profile: profileResult.data || null,
      requested_context: draftContext,
      metrics_30d: {
        order_count: orders.length,
        revenue_chf: Number(revenue.toFixed(2)),
        average_ticket_chf: orders.length ? Number((revenue / orders.length).toFixed(2)) : 0,
      },
      menu_sample: menuResult.data || [],
      reviews_sample: (reviewsResult.data || []).slice(0, 20),
      campaigns_sample: campaignsResult.data || [],
      generated_assets_sample: assetsResult.data || [],
      quota,
    };
    const maxOutputTokens = action === "sales_insights" ? 1800 : 1400;
    const preflightCredits = estimateTextAiPreflightCredits({
      model,
      input: context,
      maxOutputTokens,
    });
    const creditPreflight = await requireRestaurantTokCreditBalance({
      adminClient: actor.adminClient,
      restaurantId,
      requiredCredits: preflightCredits,
    });

    const { data: conversation, error: conversationError } = await actor.adminClient
      .from("ai_conversations")
      .insert({
        scope: "restaurant",
        user_id: actor.userId,
        restaurant_id: restaurantId,
        title: `${ACTION_LABELS[action]} - ${restaurant.name}`,
        metadata: { action, feature: featureName, endpoint: FUNCTION_NAME },
      })
      .select("id")
      .single();

    if (conversationError) throw new HttpError(500, conversationError.message);
    conversationId = conversation.id;

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: prompt || ACTION_LABELS[action],
      model,
      metadata: { action, feature: featureName },
    });

    const systemPrompt = `Tu es l'agent IA restaurateur de TOK.
Travaille toujours en mode brouillon: ne publie pas, ne modifie pas un menu, ne change pas un prix et ne lance pas une campagne.
Tu peux proposer des descriptions, promotions, reponses aux avis, analyses de ventes et briefs photo.
Signale les limites des donnees et les risques marge, allergenes, marques concurrentes ou personnes reelles dans les visuels.
Reponds en francais operationnel, avec priorites courtes.`;

    const openAIResponse = await createOpenAIResponse({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens,
      jsonSchema: {
        name: "tok_ai_restaurant_agent_result",
        description: "Restaurant AI draft recommendation.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<RestaurantAgentResult>(openAIResponse);
    const usage = extractUsage(openAIResponse);

    const { data: task, error: taskError } = await actor.adminClient
      .from("ai_restaurant_tasks")
      .insert({
        restaurant_id: restaurantId,
        user_id: actor.userId,
        conversation_id: conversationId,
        task_type: action,
        feature_name: featureName,
        title: result.title || ACTION_LABELS[action],
        prompt: prompt || ACTION_LABELS[action],
        result,
        status: "draft",
        model,
        estimated_cost_chf: estimateCostChf(model, usage.input_tokens, usage.output_tokens),
        metadata: { confidence: result.confidence, warnings: result.warnings },
      })
      .select("id")
      .single();

    if (taskError) throw new HttpError(500, taskError.message);
    taskId = task.id;

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: result.markdown,
      model,
      usage,
      metadata: {
        action,
        feature: featureName,
        task_id: taskId,
        confidence: result.confidence,
      },
    });

    await insertUsage(actor, {
      status: "success",
      action,
      featureName,
      restaurantId,
      conversationId,
      taskId,
      model,
      usage,
      metadata: {
        confidence: result.confidence,
        preflight_required_credit_units: creditPreflight.requiredCredits,
        preflight_available_tok_credits: creditPreflight.availableCredits,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: "ai_restaurant_tasks",
      targetEntityId: taskId,
      metadata: { rid: log.rid, restaurant_id: restaurantId, conversation_id: conversationId },
    });

    return jsonResponse({
      ...result,
      action,
      featureName,
      conversationId,
      taskId,
      status: "draft",
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
        featureName,
        restaurantId,
        conversationId,
        taskId,
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
        targetEntityType: "ai_restaurant_tasks",
        targetEntityId: taskId || restaurantId,
        errorMessage: message,
        metadata: { rid: log.rid, conversation_id: conversationId },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
