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

type ImageEnhanceResult = {
  title: string;
  enhanced_prompt: string;
  edit_instructions: string;
  alt_text: string;
  publication_caption: string;
  checklist: string[];
  style_tags: string[];
  safety_notes: string[];
};

const FUNCTION_NAME = "ai-image-enhance";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "enhanced_prompt",
    "edit_instructions",
    "alt_text",
    "publication_caption",
    "checklist",
    "style_tags",
    "safety_notes",
  ],
  properties: {
    title: { type: "string" },
    enhanced_prompt: { type: "string" },
    edit_instructions: { type: "string" },
    alt_text: { type: "string" },
    publication_caption: { type: "string" },
    checklist: { type: "array", items: { type: "string" } },
    style_tags: { type: "array", items: { type: "string" } },
    safety_notes: { type: "array", items: { type: "string" } },
  },
};

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeText(raw: unknown, max = 3000) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function sanitizeUrl(raw: unknown) {
  if (typeof raw !== "string") return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString().slice(0, 1500);
  } catch {
    return "";
  }
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    restaurantId?: string | null;
    assetId?: string | null;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: "image_enhance",
    model: OPENAI_MODEL,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    generated_asset_id: payload.assetId || null,
    status: payload.status,
    input_tokens: payload.usage?.input_tokens ?? 0,
    output_tokens: payload.usage?.output_tokens ?? 0,
    total_tokens: payload.usage?.total_tokens ?? 0,
    metadata: payload.metadata || {},
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  let assetId: string | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    restaurantId = maybeUuid(body.restaurantId);
    const prompt = sanitizeText(body.prompt);
    const sourceImageUrl = sanitizeUrl(body.sourceImageUrl);
    const assetType = body.assetType === "campaign_visual" || body.assetType === "menu_visual" ||
        body.assetType === "banner"
      ? body.assetType
      : "image_brief";

    if (!restaurantId) throw new HttpError(400, "restaurant_required");
    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 10, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 25, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 100, windowSeconds: 60 });

    const { data: profile } = await actor.adminClient
      .from("restaurant_ai_profiles")
      .select("brand_tone, specialties, visual_style, default_language, guardrails")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    const systemPrompt = `Tu es un directeur artistique food premium pour TOK.
Tu aides les restaurateurs a ameliorer leurs photos et briefs visuels.
Ne promets pas de modifier une image existante si aucun pipeline d'edition n'est fourni.
Produis un brief exploitable par un photographe, un outil d'edition ou un futur generateur d'image.
Respecte la realite du plat, evite les claims nutritionnels/medicaux et signale les risques.`;

    const userContent = sourceImageUrl
      ? [
        {
          type: "input_text",
          text: JSON.stringify({
            restaurant: {
              id: restaurant.id,
              name: restaurant.name,
              city: restaurant.city,
              cuisine_type: restaurant.cuisine_type,
            },
            ai_profile: profile || null,
            prompt,
            asset_type: assetType,
          }),
        },
        { type: "input_image", image_url: sourceImageUrl },
      ]
      : JSON.stringify({
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          city: restaurant.city,
          cuisine_type: restaurant.cuisine_type,
        },
        ai_profile: profile || null,
        prompt,
        asset_type: assetType,
      });

    const openAIResponse = await createOpenAIResponse({
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxOutputTokens: 1200,
      jsonSchema: {
        name: "tok_image_enhancement_brief",
        description: "Restaurant image enhancement brief.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<ImageEnhanceResult>(openAIResponse);
    const usage = extractUsage(openAIResponse);

    const { data: asset, error: assetError } = await actor.adminClient
      .from("ai_generated_assets")
      .insert({
        restaurant_id: restaurantId,
        user_id: actor.userId,
        source_image_url: sourceImageUrl || null,
        asset_type: assetType,
        model: OPENAI_MODEL,
        prompt: result.enhanced_prompt,
        title: result.title,
        status: "generated",
        metadata: {
          edit_instructions: result.edit_instructions,
          alt_text: result.alt_text,
          publication_caption: result.publication_caption,
          checklist: result.checklist,
          style_tags: result.style_tags,
          safety_notes: result.safety_notes,
          original_prompt: prompt,
        },
      })
      .select("id")
      .single();

    if (assetError) throw new HttpError(500, assetError.message);
    assetId = asset.id;

    await insertUsage(actor, {
      status: "success",
      restaurantId,
      assetId,
      usage,
      metadata: { asset_type: assetType, has_source_image: Boolean(sourceImageUrl) },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: "image_enhance",
      actor,
      request: req,
      targetEntityType: "ai_generated_assets",
      targetEntityId: assetId,
      metadata: { rid: log.rid, restaurant_id: restaurantId },
    });

    return jsonResponse({
      ...result,
      assetId,
    }, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await insertUsage(actor, {
        status: "failure",
        restaurantId,
        assetId,
        metadata: { error: message, rid: log.rid },
      }).catch(() => {});

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: "image_enhance",
        actor,
        request: req,
        targetEntityType: "ai_generated_assets",
        targetEntityId: assetId,
        errorMessage: message,
        metadata: { rid: log.rid, restaurant_id: restaurantId },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
