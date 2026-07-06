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
  estimateTextAiPreflightCredits,
  requireRestaurantTokCreditBalance,
} from "../_shared/restaurant-credits.ts";

const FUNCTION_NAME = "ai-social-post-copy";

type SocialPostCopyVariant = {
  title: string;
  body: string;
  postType: "plat" | "promo" | "evenement" | "coulisses" | "annonce";
  ctaType: "none" | "reserve" | "order" | "menu" | "offer";
  campaignGoal: "awareness" | "orders" | "bookings" | "loyalty" | "offer";
  campaignName: string;
};

type SocialPostCopyResult = {
  variants: SocialPostCopyVariant[];
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: {
    variants: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body", "postType", "ctaType", "campaignGoal", "campaignName"],
        properties: {
          title: { type: "string", minLength: 3, maxLength: 64 },
          body: { type: "string", minLength: 70, maxLength: 700 },
          postType: { type: "string", enum: ["plat", "promo", "evenement", "coulisses", "annonce"] },
          ctaType: { type: "string", enum: ["none", "reserve", "order", "menu", "offer"] },
          campaignGoal: { type: "string", enum: ["awareness", "orders", "bookings", "loyalty", "offer"] },
          campaignName: { type: "string", minLength: 3, maxLength: 80 },
        },
      },
    },
  },
};

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeText(raw: unknown, max = 900) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function sanitizeStringArray(raw: unknown, maxItems = 8, maxLength = 120) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeAnswers(raw: unknown) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  return {
    objective: sanitizeText(record.objective, 80),
    moment: sanitizeText(record.moment, 80),
    offer: sanitizeText(record.offer, 120),
    tone: sanitizeText(record.tone, 80),
    audience: sanitizeText(record.audience, 80),
    strengths: sanitizeStringArray(record.strengths),
  };
}

function normalizeVariants(result: SocialPostCopyResult): SocialPostCopyVariant[] {
  return (Array.isArray(result.variants) ? result.variants : [])
    .filter((variant) => variant && typeof variant.body === "string")
    .slice(0, 3)
    .map((variant) => ({
      ...variant,
      title: sanitizeText(variant.title, 64) || "Variante TOK",
      body: sanitizeText(variant.body, 700),
      campaignName: sanitizeText(variant.campaignName, 80) || sanitizeText(variant.title, 64) || "Post IA",
    }))
    .filter((variant) => variant.body.length >= 40);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  const model = selectTokAiModel("restaurant");

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    restaurantId = maybeUuid(body.restaurantId);
    if (!restaurantId) throw new HttpError(400, "restaurant_required");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const currentText = sanitizeText(body.currentText, 1200);
    const answers = sanitizeAnswers(body.answers);

    if (!answers.objective || !answers.moment || !answers.tone || !answers.audience) {
      throw new HttpError(400, "missing_required_answers");
    }

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 45, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 120, windowSeconds: 60 });

    const promptContext = {
      restaurant: {
        name: restaurant.name,
        city: restaurant.city,
        cuisine_type: restaurant.cuisine_type,
      },
      current_text: currentText || null,
      answers,
    };
    const preflightCredits = estimateTextAiPreflightCredits({
      model,
      input: promptContext,
      maxOutputTokens: 1200,
    });
    const creditPreflight = await requireRestaurantTokCreditBalance({
      adminClient: actor.adminClient,
      restaurantId,
      requiredCredits: preflightCredits,
    });

    const openAIResponse = await createOpenAIResponse({
      model,
      maxOutputTokens: 1200,
      input: [
        {
          role: "system",
          content: `Tu es le copywriter IA de TOK pour des restaurateurs suisses romands.
Genere exactement 3 variantes de post social en francais, premium, concret, chaleureux et orienté action.
Chaque variante doit etre publiable directement, sans hashtags excessifs, sans promesse mensongere, sans mentionner OpenAI.
Respecte le contexte fourni. Si une offre ou quantite est absente, reste prudent. Termine avec une invitation claire mais naturelle.`,
        },
        { role: "user", content: JSON.stringify(promptContext) },
      ],
      jsonSchema: {
        name: "social_post_copy_variants",
        schema: OUTPUT_SCHEMA,
        strict: true,
      },
    });

    const parsed = parseStructuredOutput<SocialPostCopyResult>(openAIResponse);
    const variants = normalizeVariants(parsed);
    if (variants.length !== 3) throw new HttpError(502, "ai_invalid_response");

    const usage = extractUsage(openAIResponse);
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    await actor.adminClient.from("ai_usage_logs").insert({
      function_name: FUNCTION_NAME,
      action: "generate_social_post_copy",
      feature_name: "ai_social_post_copy",
      source: FUNCTION_NAME,
      model,
      user_id: actor.userId,
      restaurant_id: restaurantId,
      status: "success",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
      estimated_cost_chf: estimateOpenAITextCostChf(model, inputTokens, outputTokens),
      metadata: {
        credit_kind: "ai_tools",
        credit_units: getOpenAITextCreditUnits(model, inputTokens, outputTokens),
        preflight_required_credit_units: creditPreflight.requiredCredits,
        preflight_available_tok_credits: creditPreflight.availableCredits,
        objective: answers.objective,
        variant_count: variants.length,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      action: "generate_social_post_copy",
      status: "success",
      actor,
      request: req,
      targetEntityType: "restaurant",
      targetEntityId: restaurantId,
      metadata: { model, objective: answers.objective },
    });

    return jsonResponse({ variants }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    log.error("request failed", { status, message });

    if (actor) {
      await actor.adminClient.from("ai_usage_logs").insert({
        function_name: FUNCTION_NAME,
        action: "generate_social_post_copy",
        feature_name: "ai_social_post_copy",
        source: FUNCTION_NAME,
        model,
        user_id: actor.userId,
        restaurant_id: restaurantId,
        status: "failure",
        metadata: { error: message },
      });

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        action: "generate_social_post_copy",
        status: "failure",
        actor,
        request: req,
        targetEntityType: "restaurant",
        targetEntityId: restaurantId,
        errorMessage: message,
      });
    }

    return jsonResponse({ error: message }, status, cors);
  }
});
