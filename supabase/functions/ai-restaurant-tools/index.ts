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
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
} from "../_shared/openai.ts";
import {
  estimateTextAiPreflightCredits,
  requireRestaurantTokCreditBalance,
} from "../_shared/restaurant-credits.ts";

type RestaurantToolAction =
  | "dish_optimization"
  | "campaign"
  | "review_reply"
  | "translation"
  | "sales_analysis"
  | "pricing";

type RestaurantToolResult = {
  title: string;
  summary: string;
  markdown: string;
  next_steps: string[];
  warnings: string[];
  confidence: "low" | "medium" | "high";
};

const FUNCTION_NAME = "ai-restaurant-tools";

const ACTION_LABELS: Record<RestaurantToolAction, string> = {
  dish_optimization: "Optimisation de plat",
  campaign: "Creation de campagne",
  review_reply: "Reponse a un avis",
  translation: "Traduction de contenu",
  sales_analysis: "Analyse des ventes",
  pricing: "Optimisation de prix",
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "markdown", "next_steps", "warnings", "confidence"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    markdown: { type: "string" },
    next_steps: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

function normalizeAction(raw: unknown): RestaurantToolAction {
  if (
    raw === "dish_optimization" ||
    raw === "campaign" ||
    raw === "review_reply" ||
    raw === "translation" ||
    raw === "sales_analysis" ||
    raw === "pricing"
  ) {
    return raw;
  }

  return "dish_optimization";
}

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeText(raw: unknown, max = 3000) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    action: string;
    restaurantId?: string | null;
    conversationId?: string | null;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const inputTokens = payload.usage?.input_tokens ?? 0;
  const outputTokens = payload.usage?.output_tokens ?? 0;
  const estimatedCostChf = estimateOpenAITextCostChf(OPENAI_MODEL, inputTokens, outputTokens);

  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    model: OPENAI_MODEL,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    conversation_id: payload.conversationId || null,
    status: payload.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_chf: estimatedCostChf,
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
  let restaurantId: string | null = null;
  let conversationId: string | null = null;
  let action: RestaurantToolAction = "dish_optimization";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    restaurantId = maybeUuid(body.restaurantId);
    action = normalizeAction(body.action);
    const prompt = sanitizeText(body.prompt);
    const targetLanguage = sanitizeText(body.targetLanguage, 32) || "fr-CH";

    if (!restaurantId) throw new HttpError(400, "restaurant_required");
    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 60, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 200, windowSeconds: 60 });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      profileResult,
      menuResult,
      ordersResult,
      reviewsResult,
      campaignsResult,
    ] = await Promise.all([
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
        .select("id, total_amount, status, delivery_fee, discount_amount, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(300),
      actor.adminClient
        .from("reviews")
        .select("id, rating, quality_rating, service_rating, speed_rating, comment, created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(40),
      actor.adminClient
        .from("ad_campaigns")
        .select("id, title, type, status, impressions, clicks, conversions, spent, total_budget, starts_at, ends_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const menuItems = (menuResult.data || []) as Array<Record<string, unknown>>;
    const orders = (ordersResult.data || []) as Array<Record<string, unknown>>;
    const reviews = (reviewsResult.data || []) as Array<Record<string, unknown>>;
    const campaigns = (campaignsResult.data || []) as Array<Record<string, unknown>>;
    const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

    const context = {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        city: restaurant.city,
        cuisine_type: restaurant.cuisine_type,
      },
      ai_profile: profileResult.data || null,
      tool: {
        action,
        label: ACTION_LABELS[action],
        prompt,
        target_language: targetLanguage,
      },
      metrics_30d: {
        orders: orders.length,
        revenue_chf: Number(revenue.toFixed(2)),
        average_ticket_chf: orders.length > 0 ? Number((revenue / orders.length).toFixed(2)) : 0,
      },
      menu: {
        total_items: menuItems.length,
        sample: menuItems.slice(0, 25),
      },
      reviews: {
        total_sample: reviews.length,
        sample: reviews.slice(0, 12).map((review) => ({
          rating: review.rating,
          quality_rating: review.quality_rating,
          service_rating: review.service_rating,
          speed_rating: review.speed_rating,
          comment: typeof review.comment === "string" ? review.comment.slice(0, 500) : "",
          created_at: review.created_at,
        })),
      },
      campaigns: campaigns.slice(0, 12),
    };
    const maxOutputTokens = 1600;
    const preflightCredits = estimateTextAiPreflightCredits({
      model: OPENAI_MODEL,
      input: context,
      maxOutputTokens,
    });
    const creditPreflight = await requireRestaurantTokCreditBalance({
      adminClient: actor.adminClient,
      restaurantId,
      requiredCredits: preflightCredits,
    });

    const systemPrompt = `Tu es l'agent IA restaurateur de TOK.
Tu aides un restaurateur a produire des contenus et decisions actionnables.
Utilise les donnees fournies, ne cree pas de fausses statistiques et signale les limites.
Ne publie rien, ne modifie aucun prix, menu ou campagne : propose seulement un brouillon ou une recommandation.
Pour les reponses d'avis, reste professionnel, empathique, court et non defensif.
Pour les prix et promotions, mentionne l'impact marge/valeur percue et les risques.`;

    const { data: conversation, error: conversationError } = await actor.adminClient
      .from("ai_conversations")
      .insert({
        scope: "restaurant",
        user_id: actor.userId,
        restaurant_id: restaurantId,
        title: `${ACTION_LABELS[action]} - ${restaurant.name}`,
        metadata: { action },
      })
      .select("id")
      .single();

    if (conversationError) throw new HttpError(500, conversationError.message);
    conversationId = conversation.id;

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: prompt || ACTION_LABELS[action],
      model: OPENAI_MODEL,
      metadata: { action },
    });

    const openAIResponse = await createOpenAIResponse({
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens,
      jsonSchema: {
        name: "tok_restaurant_tool_result",
        description: "Restaurant AI tool output.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<RestaurantToolResult>(openAIResponse);
    const usage = extractUsage(openAIResponse);

    await actor.adminClient.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: result.markdown,
      model: OPENAI_MODEL,
      usage,
      metadata: {
        action,
        title: result.title,
        summary: result.summary,
        next_steps: result.next_steps,
        warnings: result.warnings,
        confidence: result.confidence,
      },
    });

    await insertUsage(actor, {
      status: "success",
      action,
      restaurantId,
      conversationId,
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
      targetEntityType: "restaurants",
      targetEntityId: restaurantId,
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
        restaurantId,
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
        targetEntityType: "restaurants",
        targetEntityId: restaurantId,
        errorMessage: message,
        metadata: { rid: log.rid, conversation_id: conversationId },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
