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
  requireRestaurantTokCreditBalance,
} from "../_shared/restaurant-credits.ts";

const FUNCTION_NAME = "menu-image-import";
const MAX_IMAGES = 3;
const MAX_IMAGE_DATA_URL_LENGTH = 8_500_000;

type ExtractedMenuItem = {
  name: string;
  description: string;
  price: number;
  category: string;
};

type MenuExtractionResult = {
  items: ExtractedMenuItem[];
  warnings: string[];
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "warnings"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "price", "category"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: "string", maxLength: 700 },
          price: { type: "number", minimum: 0, maximum: 100000 },
          category: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
    },
    warnings: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 240 },
    },
  },
};

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeText(raw: unknown, max: number) {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function normalizeImages(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw))
    .filter((value): value is string =>
      typeof value === "string" &&
      /^data:image\/(jpeg|png|webp);base64,/i.test(value) &&
      value.length <= MAX_IMAGE_DATA_URL_LENGTH
    )
    .slice(0, MAX_IMAGES);
}

function normalizeResult(raw: MenuExtractionResult): MenuExtractionResult {
  const seen = new Set<string>();
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((item) => ({
      name: sanitizeText(item?.name, 160),
      description: sanitizeText(item?.description, 700),
      price: Math.round(Number(item?.price) * 100) / 100,
      category: sanitizeText(item?.category, 100) || "Autres",
    }))
    .filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0)
    .filter((item) => {
      const key = `${item.category.toLowerCase()}|${item.name.toLowerCase()}|${item.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);

  return {
    items,
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : [])
      .map((warning) => sanitizeText(warning, 240))
      .filter(Boolean)
      .slice(0, 20),
  };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  const model = selectTokAiModel("image_premium");

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    restaurantId = maybeUuid(body.restaurantId);
    if (!restaurantId) throw new HttpError(400, "restaurant_required");
    const images = normalizeImages(body.images);
    if (!images.length) throw new HttpError(400, "menu_images_required");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const rateLimiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 10, windowSeconds: 3600 });
    await rateLimiter.consume(`restaurant:${restaurantId}`, { maxRequests: 20, windowSeconds: 3600 });
    await requireRestaurantTokCreditBalance({
      adminClient: actor.adminClient,
      restaurantId,
      requiredCredits: 1,
    });

    const response = await createOpenAIResponse({
      model,
      maxOutputTokens: 6000,
      input: [
        {
          role: "system",
          content: `Tu extrais fidèlement des cartes de restaurant à partir de photos.
Lis toutes les pages dans leur ordre. Reconstitue catégories, noms, descriptions et prix.
Les prix doivent être des nombres décimaux sans symbole monétaire. N'invente jamais un plat, un prix ou une description.
Conserve la langue et l'orthographe visibles, en corrigeant seulement les espaces OCR évidents.
Si un prix est illisible ou absent, mets 0 et ajoute un avertissement précis.
Fusionne les doublons causés par le chevauchement de photos. Ne traite pas les horaires, adresses ou mentions légales comme des plats.`,
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `Restaurant: ${restaurant.name || "non renseigné"}. Extrais le menu de ces ${images.length} photo(s).` },
            ...images.map((imageUrl) => ({ type: "input_image", image_url: imageUrl, detail: "high" })),
          ],
        },
      ],
      jsonSchema: {
        name: "restaurant_menu_extraction",
        schema: OUTPUT_SCHEMA,
        strict: true,
      },
    });

    const result = normalizeResult(parseStructuredOutput<MenuExtractionResult>(response));
    if (!result.items.length) throw new HttpError(422, "menu_items_not_detected");

    const usage = extractUsage(response);
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const { error: usageError } = await actor.adminClient.from("ai_usage_logs").insert({
      function_name: FUNCTION_NAME,
      action: "extract_menu_from_images",
      feature_name: "menu_image_import",
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
        credit_units: Math.max(1, getOpenAITextCreditUnits(model, inputTokens, outputTokens)),
        image_count: images.length,
        item_count: result.items.length,
      },
    });
    assertTokCreditSpendRecorded(usageError);

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      action: "extract_menu_from_images",
      status: "success",
      actor,
      request: req,
      targetEntityType: "restaurant",
      targetEntityId: restaurantId,
      metadata: { model, imageCount: images.length, itemCount: result.items.length },
    });

    return jsonResponse(result, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    log.error("request failed", { status, message });

    if (actor) {
      await actor.adminClient.from("ai_usage_logs").insert({
        function_name: FUNCTION_NAME,
        action: "extract_menu_from_images",
        feature_name: "menu_image_import",
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
        action: "extract_menu_from_images",
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
