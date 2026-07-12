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

const FUNCTION_NAME = "analyze-restaurant-image";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ANALYSIS_PROVIDER = (Deno.env.get("IMAGE_ANALYSIS_PROVIDER")?.trim().toLowerCase() || "contextual") as
  | "contextual"
  | "openai";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL_IMAGE_ANALYSIS")?.trim() || selectTokAiModel("image_economy");
const ACTIVE_MODEL = ANALYSIS_PROVIDER === "openai" ? OPENAI_MODEL : "tok-contextual-metadata-v1";
const WORKER_ID = `supabase-${ANALYSIS_PROVIDER}-image-metadata`;

type ImageAnalysisJob = {
  job_id: string;
  image_id: string;
  restaurant_id: string;
  bucket: string;
  storage_path: string;
  public_url: string | null;
};

type RestaurantImageRow = {
  id: string;
  restaurant_id: string;
  bucket: string;
  storage_path: string;
  public_url: string | null;
  source_type: string;
  source_table: string | null;
  source_id: string | null;
  social_post_media_id: string | null;
  restaurant_media_id: string | null;
  original_filename: string | null;
  mime_type: string | null;
  analysis_status: string;
  ai_metadata: Record<string, unknown> | null;
};

type TrustedImageContext = {
  restaurantName: string;
  restaurantCity: string;
  cuisineType: string | null;
  postBody: string | null;
  postType: string | null;
  mediaAltText: string | null;
};

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

class CompletionConfirmationError extends Error {}

type ImageMetadata = {
  description: string;
  short_description: string;
  alt_text: string;
  seo_title: string;
  seo_description: string;
  detected_objects: string[];
  food_items: string[];
  ingredients: string[];
  cuisine_types: string[];
  moods: string[];
  colors: string[];
  hashtags: string[];
  image_type: string;
  is_food_photo: boolean;
  has_people: boolean;
  has_logo: boolean;
  has_text: boolean;
  quality_score: number;
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "description",
    "short_description",
    "alt_text",
    "seo_title",
    "seo_description",
    "detected_objects",
    "food_items",
    "ingredients",
    "cuisine_types",
    "moods",
    "colors",
    "hashtags",
    "image_type",
    "is_food_photo",
    "has_people",
    "has_logo",
    "has_text",
    "quality_score",
  ],
  properties: {
    description: { type: "string", minLength: 20, maxLength: 900 },
    short_description: { type: "string", minLength: 8, maxLength: 180 },
    alt_text: { type: "string", minLength: 8, maxLength: 260 },
    seo_title: { type: "string", minLength: 8, maxLength: 90 },
    seo_description: { type: "string", minLength: 20, maxLength: 180 },
    detected_objects: { type: "array", minItems: 0, maxItems: 16, items: { type: "string", maxLength: 60 } },
    food_items: { type: "array", minItems: 0, maxItems: 12, items: { type: "string", maxLength: 60 } },
    ingredients: { type: "array", minItems: 0, maxItems: 16, items: { type: "string", maxLength: 60 } },
    cuisine_types: { type: "array", minItems: 0, maxItems: 8, items: { type: "string", maxLength: 60 } },
    moods: { type: "array", minItems: 0, maxItems: 8, items: { type: "string", maxLength: 60 } },
    colors: { type: "array", minItems: 0, maxItems: 8, items: { type: "string", maxLength: 60 } },
    hashtags: {
      type: "array",
      minItems: 0,
      maxItems: 12,
      items: { type: "string", pattern: "^#[A-Za-zÀ-ÖØ-öø-ÿ0-9_]{2,40}$" },
    },
    image_type: { type: "string", enum: ["plat", "restaurant", "equipe", "ambiance", "menu", "logo", "promotion", "autre"] },
    is_food_photo: { type: "boolean" },
    has_people: { type: "boolean" },
    has_logo: { type: "boolean" },
    has_text: { type: "boolean" },
    quality_score: { type: "number", minimum: 0, maximum: 10 },
  },
};

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function safeText(raw: unknown, maxLength = 900) {
  return typeof raw === "string" ? raw.trim().slice(0, maxLength) : "";
}

function cleanAltText(raw: unknown, maxLength = 260) {
  return safeText(raw, 900)
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeBoolean(raw: unknown) {
  return raw === true;
}

function safeQualityScore(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 10);
}

function cleanArray(raw: unknown, maxItems = 12, maxLength = 60) {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(
    raw
      .map((item) => safeText(item, maxLength))
      .filter(Boolean),
  )).slice(0, maxItems);
}

function cleanHashtags(raw: unknown) {
  return cleanArray(raw, 12, 40)
    .map((tag) => tag.startsWith("#") ? tag : `#${tag}`)
    .map((tag) => tag.replace(/[^\p{L}\p{N}_#]/gu, ""))
    .filter((tag) => /^#[\p{L}\p{N}_]{2,40}$/u.test(tag));
}

function normalizeMetadata(raw: ImageMetadata): ImageMetadata {
  return {
    description: safeText(raw.description, 900),
    short_description: safeText(raw.short_description, 180),
    alt_text: cleanAltText(raw.alt_text),
    seo_title: safeText(raw.seo_title, 90),
    seo_description: safeText(raw.seo_description, 180),
    detected_objects: cleanArray(raw.detected_objects, 16),
    food_items: cleanArray(raw.food_items, 12),
    ingredients: cleanArray(raw.ingredients, 16),
    cuisine_types: cleanArray(raw.cuisine_types, 8),
    moods: cleanArray(raw.moods, 8),
    colors: cleanArray(raw.colors, 8),
    hashtags: cleanHashtags(raw.hashtags),
    image_type: safeText(raw.image_type, 40) || "autre",
    is_food_photo: safeBoolean(raw.is_food_photo),
    has_people: safeBoolean(raw.has_people),
    has_logo: safeBoolean(raw.has_logo),
    has_text: safeBoolean(raw.has_text),
    quality_score: safeQualityScore(raw.quality_score),
  };
}

function inferMimeType(storagePath: string, fallback?: string | null) {
  const cleanFallback = fallback?.trim().toLowerCase();
  if (cleanFallback && SUPPORTED_IMAGE_MIME_TYPES.has(cleanFallback)) return cleanFallback;

  const lowerPath = storagePath.toLowerCase();
  if (lowerPath.endsWith(".png")) return "image/png";
  if (lowerPath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function bytesToBase64(bytes: Uint8Array) {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseImageRequest(value: unknown) {
  if (!isRecord(value)) throw new HttpError(400, "invalid_request_body");
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "imageId") {
    throw new HttpError(400, "only_image_id_is_accepted");
  }
  const imageId = maybeUuid(value.imageId);
  if (!imageId) throw new HttpError(400, "image_id_required");
  return imageId;
}

async function loadRestaurantImage(actor: Awaited<ReturnType<typeof authenticateRequest>>, imageId: string) {
  const { data, error } = await actor.adminClient
    .from("restaurant_images")
    .select("id,restaurant_id,bucket,storage_path,public_url,source_type,source_table,source_id,social_post_media_id,restaurant_media_id,original_filename,mime_type,analysis_status,ai_metadata")
    .eq("id", imageId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "image_not_found");
  await requireRestaurantAccess(actor, data.restaurant_id);
  return data as RestaurantImageRow;
}

async function loadTrustedImageContext(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  image: RestaurantImageRow,
): Promise<TrustedImageContext> {
  const { data: restaurant, error: restaurantError } = await actor.adminClient
    .from("restaurants")
    .select("id,name,city,cuisine_type")
    .eq("id", image.restaurant_id)
    .maybeSingle();

  if (restaurantError) throw new HttpError(500, restaurantError.message);
  if (!restaurant) throw new HttpError(409, "image_restaurant_not_found");

  let postBody: string | null = null;
  let postType: string | null = null;
  let mediaAltText: string | null = null;

  if (image.social_post_media_id) {
    const { data: media, error: mediaError } = await actor.adminClient
      .from("social_post_media")
      .select("id,post_id,media_path,alt_text")
      .eq("id", image.social_post_media_id)
      .maybeSingle();

    if (mediaError) throw new HttpError(500, mediaError.message);
    if (!media || media.media_path !== image.storage_path || image.bucket !== "social-post-media") {
      throw new HttpError(409, "social_media_identity_mismatch");
    }

    const { data: post, error: postError } = await actor.adminClient
      .from("social_posts")
      .select("id,restaurant_id,body,post_type")
      .eq("id", media.post_id)
      .maybeSingle();

    if (postError) throw new HttpError(500, postError.message);
    if (!post || post.restaurant_id !== image.restaurant_id) {
      throw new HttpError(409, "social_post_identity_mismatch");
    }

    postBody = safeText(post.body, 2000) || null;
    postType = safeText(post.post_type, 40) || null;
    mediaAltText = safeText(media.alt_text, 260) || null;
  } else if (image.restaurant_media_id) {
    const { data: media, error: mediaError } = await actor.adminClient
      .from("restaurant_media")
      .select("id,restaurant_id,storage_bucket,storage_path,alt_text")
      .eq("id", image.restaurant_media_id)
      .maybeSingle();

    if (mediaError) throw new HttpError(500, mediaError.message);
    if (
      !media
      || media.restaurant_id !== image.restaurant_id
      || media.storage_bucket !== image.bucket
      || media.storage_path !== image.storage_path
    ) {
      throw new HttpError(409, "restaurant_media_identity_mismatch");
    }

    mediaAltText = safeText(media.alt_text, 260) || null;
  } else {
    throw new HttpError(409, "verified_media_source_required");
  }

  return {
    restaurantName: safeText(restaurant.name, 160) || "Restaurant",
    restaurantCity: safeText(restaurant.city, 120),
    cuisineType: safeText(restaurant.cuisine_type, 120) || null,
    postBody,
    postType,
    mediaAltText,
  };
}

function buildContextualMetadata(context: TrustedImageContext): ImageMetadata {
  const restaurantLabel = [context.restaurantName, context.restaurantCity].filter(Boolean).join(" à ");
  const fallback = context.cuisineType
    ? `Photo du restaurant ${restaurantLabel}, cuisine ${context.cuisineType}.`
    : `Photo du restaurant ${restaurantLabel}.`;
  const description = safeText(context.postBody || context.mediaAltText || fallback, 900) || fallback;
  const altText = cleanAltText(context.mediaAltText || (
    context.postBody
      ? `Photo publiée par ${context.restaurantName} : ${context.postBody}`
      : fallback
  ), 260);
  const imageType = context.postType === "plat"
    ? "plat"
    : context.postType === "promo"
    ? "promotion"
    : context.postType === "evenement" || context.postType === "coulisses"
    ? "ambiance"
    : "restaurant";

  return {
    description,
    short_description: safeText(description, 180),
    alt_text: altText,
    seo_title: safeText(`${context.restaurantName} — Actualité`, 90),
    seo_description: safeText(description, 180),
    detected_objects: [],
    food_items: [],
    ingredients: [],
    cuisine_types: context.cuisineType ? [context.cuisineType] : [],
    moods: [],
    colors: [],
    hashtags: [],
    image_type: imageType,
    is_food_photo: context.postType === "plat",
    has_people: false,
    has_logo: false,
    has_text: false,
    quality_score: 0,
  };
}

async function claimJob(actor: Awaited<ReturnType<typeof authenticateRequest>>, imageId: string): Promise<ImageAnalysisJob | null> {
  const { data, error } = await actor.adminClient.rpc("claim_image_analysis_job_by_image_id", {
    p_worker_id: WORKER_ID,
    p_image_id: imageId,
  });

  if (error) throw new HttpError(500, error.message);
  return Array.isArray(data) && data.length > 0 ? data[0] as ImageAnalysisJob : null;
}

async function downloadImageAsDataUrl(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  image: RestaurantImageRow,
) {
  const { data, error } = await actor.adminClient.storage
    .from(image.bucket)
    .download(image.storage_path);

  if (error || !data) {
    throw new HttpError(502, `image_download_failed:${error?.message || "unknown"}`);
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length <= 0) throw new HttpError(400, "empty_image");
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "image_too_large_for_analysis");

  const mimeType = inferMimeType(image.storage_path, data.type || image.mime_type);
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new HttpError(415, "unsupported_image_type");
  }

  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

async function analyzeImage(
  dataUrl: string,
  image: RestaurantImageRow,
  context: TrustedImageContext,
) {
  const response = await createOpenAIResponse({
    model: OPENAI_MODEL,
    maxOutputTokens: 1200,
    input: [
      {
        role: "system",
        content: `Tu es le moteur d'indexation visuelle de TOK pour le fil Actualites et la galerie restaurant.
Analyse l'image avec prudence et retourne uniquement des metadonnees utiles a la recherche, a l'accessibilite et au SEO.
Ne fabrique pas de marque, de certification, de prix ou d'offre si ce n'est pas visible. Reponds en francais.`,
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              objectif: "Creer des metadonnees recherche pour une image restaurant.",
              source_type: image.source_type,
              contexte_verifie: {
                restaurant: context.restaurantName,
                ville: context.restaurantCity,
                cuisine: context.cuisineType,
                publication: context.postBody,
                type_publication: context.postType,
              },
            }),
          },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    jsonSchema: {
      name: "tok_restaurant_image_metadata",
      schema: OUTPUT_SCHEMA,
      strict: true,
    },
  });

  return {
    metadata: normalizeMetadata(parseStructuredOutput<ImageMetadata>(response)),
    usage: extractUsage(response),
  };
}

async function completeJob(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  job: ImageAnalysisJob,
  metadata: ImageMetadata,
) {
  const { data, error } = await actor.adminClient.rpc("complete_image_analysis_job", {
    p_job_id: job.job_id,
    p_image_id: job.image_id,
    p_description: metadata.description,
    p_short_description: metadata.short_description,
    p_alt_text: metadata.alt_text,
    p_seo_title: metadata.seo_title,
    p_seo_description: metadata.seo_description,
    p_detected_objects: metadata.detected_objects,
    p_food_items: metadata.food_items,
    p_ingredients: metadata.ingredients,
    p_cuisine_types: metadata.cuisine_types,
    p_moods: metadata.moods,
    p_colors: metadata.colors,
    p_hashtags: metadata.hashtags,
    p_image_type: metadata.image_type,
    p_is_food_photo: metadata.is_food_photo,
    p_has_people: metadata.has_people,
    p_has_logo: metadata.has_logo,
    p_has_text: metadata.has_text,
    p_quality_score: metadata.quality_score,
    p_ai_metadata: {
      ...metadata,
      provider: ANALYSIS_PROVIDER,
      model: ACTIVE_MODEL,
      generated_by: FUNCTION_NAME,
    },
    p_embedding: null,
  });

  if (error) throw new HttpError(500, error.message);
  if (
    !Array.isArray(data)
    || data.length !== 1
    || data[0]?.completed_image_id !== job.image_id
    || !["completed", "already_completed"].includes(data[0]?.completion_status)
  ) {
    throw new CompletionConfirmationError("image_analysis_completion_not_confirmed");
  }
}

async function failJob(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  job: ImageAnalysisJob | null,
  imageId: string,
  errorMessage: string,
) {
  if (!job) return;
  await actor.adminClient.rpc("fail_image_analysis_job", {
    p_job_id: job.job_id,
    p_image_id: imageId,
    p_error: errorMessage.slice(0, 2000),
  });
}

async function recordUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  image: RestaurantImageRow,
  status: "success" | "failure",
  metadata: Record<string, unknown>,
) {
  try {
    await actor.adminClient.from("ai_usage_logs").insert({
      function_name: FUNCTION_NAME,
      action: "analyze_restaurant_image",
      feature_name: "actualites_image_metadata",
      source: FUNCTION_NAME,
      model: ACTIVE_MODEL,
      user_id: actor.userId,
      restaurant_id: image.restaurant_id,
      status,
      input_tokens: metadata.input_tokens || 0,
      output_tokens: metadata.output_tokens || 0,
      total_tokens: metadata.total_tokens || 0,
      estimated_cost_chf: metadata.estimated_cost_chf || 0,
      metadata,
    });
  } catch (error) {
    console.warn("ai_usage_logs insert failed", error);
  }
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let image: RestaurantImageRow | null = null;
  let job: ImageAnalysisJob | null = null;
  let jobFinalized = false;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    if (!["contextual", "openai"].includes(ANALYSIS_PROVIDER)) {
      throw new HttpError(503, "image_analysis_provider_not_configured");
    }
    if (ANALYSIS_PROVIDER === "openai" && !OPENAI_API_KEY) {
      throw new HttpError(503, "openai_image_analysis_not_configured");
    }

    const body = await req.json().catch(() => null);
    const imageId = parseImageRequest(body);

    image = await loadRestaurantImage(actor, imageId);
    const trustedContext = await loadTrustedImageContext(actor, image);
    const existingProvider = isRecord(image.ai_metadata)
      ? safeText(image.ai_metadata.provider, 60).toLowerCase()
      : "";
    if (
      image.analysis_status === "completed"
      && (
        ANALYSIS_PROVIDER === "contextual"
        || existingProvider === ANALYSIS_PROVIDER
      )
    ) {
      return jsonResponse({ ok: true, status: "already_completed", imageId }, 200, cors);
    }

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    if (actor.userId) {
      await rl.consume(`user:${actor.userId}`, { maxRequests: 60, windowSeconds: 3600 });
    }
    await rl.consume(`restaurant:${image.restaurant_id}`, { maxRequests: 120, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 240, windowSeconds: 60 });

    job = await claimJob(actor, imageId);
    if (!job) {
      return jsonResponse({ ok: true, status: "not_claimed", imageId }, 202, cors);
    }

    let metadata: ImageMetadata;
    let usage: TokenUsage = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };

    if (ANALYSIS_PROVIDER === "openai") {
      const dataUrl = await downloadImageAsDataUrl(actor, image);
      const openAiResult = await analyzeImage(dataUrl, image, trustedContext);
      metadata = openAiResult.metadata;
      usage = openAiResult.usage;
    } else {
      metadata = buildContextualMetadata(trustedContext);
    }

    await completeJob(actor, job, metadata);
    jobFinalized = true;

    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    await recordUsage(actor, image, "success", {
      image_id: imageId,
      source_type: image.source_type,
      source_table: image.source_table,
      source_id: image.source_id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
      provider: ANALYSIS_PROVIDER,
      model: ACTIVE_MODEL,
      estimated_cost_chf: ANALYSIS_PROVIDER === "openai"
        ? estimateOpenAITextCostChf(OPENAI_MODEL, inputTokens, outputTokens)
        : 0,
      credit_units: ANALYSIS_PROVIDER === "openai"
        ? getOpenAITextCreditUnits(OPENAI_MODEL, inputTokens, outputTokens)
        : 0,
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      action: "analyze_restaurant_image",
      status: "success",
      actor,
      request: req,
      targetEntityType: "restaurant_image",
      targetEntityId: imageId,
      metadata: {
        provider: ANALYSIS_PROVIDER,
        model: ACTIVE_MODEL,
        source_type: image.source_type,
      },
    });

    return jsonResponse({ ok: true, status: "completed", imageId, metadata }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    log.error("request failed", { status, message });

    if (actor && image) {
      if (!jobFinalized && !(error instanceof CompletionConfirmationError)) {
        await failJob(actor, job, image.id, message);
      }
      await recordUsage(actor, image, "failure", {
        image_id: image.id,
        source_type: image.source_type,
        provider: ANALYSIS_PROVIDER,
        model: ACTIVE_MODEL,
        error: message,
      });
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        action: "analyze_restaurant_image",
        status: "failure",
        actor,
        request: req,
        targetEntityType: "restaurant_image",
        targetEntityId: image.id,
        errorMessage: message,
      });
    }

    return jsonResponse({ ok: false, error: message }, status, cors);
  }
});
