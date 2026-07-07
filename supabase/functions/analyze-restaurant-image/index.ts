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
const WORKER_ID = "supabase-openai-image-metadata";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MODEL = Deno.env.get("OPENAI_MODEL_IMAGE_ANALYSIS")?.trim() || selectTokAiModel("image_economy");

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
  source_context: Record<string, unknown> | null;
  original_filename: string | null;
  mime_type: string | null;
  analysis_status: string;
};

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
    alt_text: safeText(raw.alt_text, 260),
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

function buildSearchAltText(metadata: ImageMetadata) {
  const keywords = [
    ...metadata.food_items,
    ...metadata.ingredients,
    ...metadata.cuisine_types,
    ...metadata.moods,
    ...metadata.hashtags,
  ].filter(Boolean).slice(0, 14);

  return [
    metadata.alt_text || metadata.short_description || metadata.description,
    keywords.length ? `Elements detectes: ${keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 420);
}

async function loadRestaurantImage(actor: Awaited<ReturnType<typeof authenticateRequest>>, imageId: string) {
  const { data, error } = await actor.adminClient
    .from("restaurant_images")
    .select("id,restaurant_id,bucket,storage_path,public_url,source_type,source_table,source_id,source_context,original_filename,mime_type,analysis_status")
    .eq("id", imageId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "image_not_found");
  await requireRestaurantAccess(actor, data.restaurant_id);
  return data as RestaurantImageRow;
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

async function analyzeImage(dataUrl: string, image: RestaurantImageRow) {
  const response = await createOpenAIResponse({
    model: MODEL,
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
              original_filename: image.original_filename,
              contexte: image.source_context || {},
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
  const { error } = await actor.adminClient.rpc("complete_image_analysis_job", {
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
      provider: "openai",
      model: MODEL,
      generated_by: FUNCTION_NAME,
    },
    p_embedding: null,
  });

  if (error) throw new HttpError(500, error.message);
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

async function syncActualitesMediaMetadata(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  image: RestaurantImageRow,
  metadata: ImageMetadata,
) {
  if (image.source_type !== "actualites" || image.source_table !== "social_posts" || !image.source_id) return;

  const mediaPath = typeof image.source_context?.mediaPath === "string"
    ? image.source_context.mediaPath
    : image.storage_path;
  const { data: mediaRow } = await actor.adminClient
    .from("social_post_media")
    .select("id,metadata")
    .eq("post_id", image.source_id)
    .eq("media_path", mediaPath)
    .maybeSingle();

  const currentMetadata = mediaRow?.metadata && typeof mediaRow.metadata === "object" && !Array.isArray(mediaRow.metadata)
    ? mediaRow.metadata as Record<string, unknown>
    : {};

  await actor.adminClient
    .from("social_post_media")
    .update({
      alt_text: buildSearchAltText(metadata),
      metadata: {
        ...currentMetadata,
        image_analysis: {
          restaurant_image_id: image.id,
          provider: "openai",
          model: MODEL,
          analyzed_at: new Date().toISOString(),
          food_items: metadata.food_items,
          ingredients: metadata.ingredients,
          cuisine_types: metadata.cuisine_types,
          hashtags: metadata.hashtags,
          quality_score: metadata.quality_score,
        },
      },
    })
    .eq("post_id", image.source_id)
    .eq("media_path", mediaPath);
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
      model: MODEL,
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

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    const imageId = maybeUuid(body.imageId);
    if (!imageId) throw new HttpError(400, "image_id_required");

    image = await loadRestaurantImage(actor, imageId);
    if (image.analysis_status === "completed") {
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

    const dataUrl = await downloadImageAsDataUrl(actor, image);
    const { metadata, usage } = await analyzeImage(dataUrl, image);
    await completeJob(actor, job, metadata);
    await syncActualitesMediaMetadata(actor, image, metadata);

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
      estimated_cost_chf: estimateOpenAITextCostChf(MODEL, inputTokens, outputTokens),
      credit_units: getOpenAITextCreditUnits(MODEL, inputTokens, outputTokens),
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
      metadata: { model: MODEL, source_type: image.source_type },
    });

    return jsonResponse({ ok: true, status: "completed", imageId, metadata }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    log.error("request failed", { status, message });

    if (actor && image) {
      await failJob(actor, job, image.id, message);
      await recordUsage(actor, image, "failure", {
        image_id: image.id,
        source_type: image.source_type,
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
