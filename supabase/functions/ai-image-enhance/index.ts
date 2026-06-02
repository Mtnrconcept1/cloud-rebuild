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
import { OPENAI_API_KEY } from "../_shared/openai.ts";

type ImageEnhanceResult = {
  title: string;
  enhanced_prompt: string;
  edit_instructions: string;
  alt_text: string;
  publication_caption: string;
  checklist: string[];
  style_tags: string[];
  safety_notes: string[];
  marketing_angles: string[];
};

type GeneratedImage = {
  asset_id: string;
  generated_image_url: string;
  gallery_image_url: string;
  storage_bucket: string;
  storage_path: string;
  model: string;
};

type ImageQuality = "low" | "medium" | "high";

type ImageRequestOptions = {
  model: string;
  quality: ImageQuality;
  size: string;
  timeoutMs: number;
  mode: "interactive_fast" | "configured";
};

type OpenAIImageErrorDetails = {
  status: number;
  type: string;
  code: string;
  message: string;
};

const FUNCTION_NAME = "ai-image-enhance";
const IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-2";
const IMAGE_QUALITY = normalizeImageQuality(Deno.env.get("OPENAI_IMAGE_QUALITY")?.trim());
const IMAGE_TIMEOUT_MS = readPositiveIntEnv("OPENAI_IMAGE_TIMEOUT_MS", 50_000, 55_000);
const FORCE_STRICT_SOURCE_EDIT = readEnvFlag("TOK_IMAGE_FORCE_STRICT_SOURCE_EDIT", true);
const USE_FAST_INTERACTIVE_IMAGE = FORCE_STRICT_SOURCE_EDIT ? false : readEnvFlag("TOK_IMAGE_FAST_INTERACTIVE", false);
const INTERACTIVE_IMAGE_MODEL = Deno.env.get("TOK_INTERACTIVE_IMAGE_MODEL")?.trim() || "gpt-image-1-mini";
const INTERACTIVE_IMAGE_QUALITY = normalizeInteractiveImageQuality(Deno.env.get("TOK_INTERACTIVE_IMAGE_QUALITY")?.trim());
const INTERACTIVE_IMAGE_SIZE = normalizeInteractiveImageSize(Deno.env.get("TOK_INTERACTIVE_IMAGE_SIZE")?.trim());
const INTERACTIVE_IMAGE_TIMEOUT_MS = readPositiveIntEnv("TOK_INTERACTIVE_IMAGE_TIMEOUT_MS", 42_000, 50_000);
const SOURCE_IMAGE_TIMEOUT_MS = readPositiveIntEnv("TOK_SOURCE_IMAGE_TIMEOUT_MS", 12_000, 30_000);
const IMAGE_BUCKET = Deno.env.get("TOK_AI_IMAGE_BUCKET")?.trim() || "ai-generated-assets";
const GALLERY_BUCKET = Deno.env.get("TOK_GALLERY_IMAGE_BUCKET")?.trim() || "images";
const TOK_REFERENCE_FOLDER = "/tok-reference-food-webp";
const SOURCE_IMAGE_EDIT_PROMPT =
  "Améliore l’image en donnant un aspect de photographie professionnelle, éclairage incroyable, en gardant le produit identique. Supprime les objets et éléments parasites mais préserve la nature des aliments présents sur l’image.";

const TOK_PHOTO_DNA = `
Charte graphique TOK pour retouche premium fidele:
- modele image cible: gpt-image-2 via OPENAI_IMAGE_MODEL, avec edition de l'image source quand elle existe;
- REGLE BLOQUANTE: si une image source est fournie, l'image finale doit rester une retouche fidele du meme sujet, pas une reinterpretation;
- conserver la nature exacte du sujet source: meme produit ou plat, meme contenant, meme packaging, meme forme generale et meme identite visuelle reconnaissable;
- conserver les textes, inscriptions, logos, marques, etiquettes, symboles, typographies visibles et elements de branding visibles aussi fidelement que possible;
- ne jamais inventer, remplacer, deformer ou approximativement recreer une etiquette, un logo ou un texte visible;
- si le sujet source est un produit emballe, une boite, un sachet, une bouteille, une conserve ou un verre imprime, conserver cet objet comme sujet principal;
- ne jamais transformer un produit emballe en plat servi, toast, assiette gastronomique ou scene culinaire differente;
- ne jamais remplacer une salade, un dessert, une bouteille, une assiette ou un plat source par un autre type de nourriture;
- composition: conserver une composition proche de la scene source; ameliorer seulement le cadrage lorsque cela ne change pas l'identite;
- lumiere chaude directionnelle, contraste maitrise, blancs propres, textures visibles, reflets propres et naturels;
- style avant/apres: meme photo, meme sujet, mais plus premium, plus nette, mieux eclairee et plus vendable;
- ne pas ajouter de texte, prix, faux logo tiers, fausse certification, visage, main, emballage concurrent ou claim medical;
- controle qualite final: au premier regard, l'utilisateur doit reconnaitre le sujet source exact.
Dossier de references visuelles du projet: public${TOK_REFERENCE_FOLDER}.
`;

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function readEnvFlag(name: string, fallback: boolean) {
  const value = Deno.env.get(name)?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function readPositiveIntEnv(name: string, fallback: number, max: number) {
  const value = Number(Deno.env.get(name)?.trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function normalizeImageQuality(raw: string | undefined): ImageQuality {
  const value = raw?.toLowerCase();
  if (value === "high" && readEnvFlag("TOK_ALLOW_HIGH_IMAGE_QUALITY", false)) return "high";
  if (value === "low" || value === "medium") return value;
  return "medium";
}

function normalizeInteractiveImageQuality(raw: string | undefined): ImageQuality {
  const value = raw?.toLowerCase();
  if (value === "high" && readEnvFlag("TOK_ALLOW_HIGH_IMAGE_QUALITY", false)) return "high";
  if (value === "medium") return "medium";
  return "low";
}

function normalizeInteractiveImageSize(raw: string | undefined) {
  return raw === "1024x1024" || raw === "1536x1024" || raw === "1024x1536" ? raw : "1024x1024";
}

function buildConfiguredImageRequestOptions(formatSize: string): ImageRequestOptions {
  return {
    model: IMAGE_MODEL,
    quality: IMAGE_QUALITY,
    size: formatSize,
    timeoutMs: IMAGE_TIMEOUT_MS,
    mode: "configured",
  };
}

function buildImageRequestOptions(formatSize: string): ImageRequestOptions {
  if (!USE_FAST_INTERACTIVE_IMAGE) return buildConfiguredImageRequestOptions(formatSize);

  return {
    model: INTERACTIVE_IMAGE_MODEL,
    quality: INTERACTIVE_IMAGE_QUALITY,
    size: INTERACTIVE_IMAGE_SIZE,
    timeoutMs: INTERACTIVE_IMAGE_TIMEOUT_MS,
    mode: "interactive_fast",
  };
}

function sanitizeText(raw: unknown, max = 3000) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function sanitizeDiagnostic(raw: unknown, max = 220) {
  return sanitizeText(raw, max)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .trim();
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

function normalizeAssetType(raw: unknown) {
  return raw === "campaign_visual" || raw === "menu_visual" || raw === "banner" || raw === "image"
    ? raw
    : "menu_visual";
}

function normalizeFormat(raw: unknown) {
  if (raw === "portrait") return { label: "portrait", size: "1024x1536" };
  if (raw === "square") return { label: "square", size: "1024x1024" };
  return { label: "landscape", size: "1536x1024" };
}

function clampVariantCount(raw: unknown) {
  const count = Math.floor(Number(raw || 1));
  if (!Number.isFinite(count)) return 1;
  return Math.min(2, Math.max(1, count));
}

function estimateCostChf(inputTokens = 0, outputTokens = 0, imageCount = 0) {
  return Number(((inputTokens * 0.00000025) + (outputTokens * 0.000001) + (imageCount * 0.045)).toFixed(6));
}

function guessMimeFromUrl(url: string) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function bytesFromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, timeoutMessage: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) throw new HttpError(503, timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readOpenAIImageError(response: Response): Promise<OpenAIImageErrorDetails> {
  const bodyText = await response.text().catch(() => "");
  let parsed: Record<string, unknown> = {};

  try {
    parsed = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
  } catch {
    parsed = {};
  }

  const rawError = typeof parsed.error === "object" && parsed.error !== null
    ? parsed.error as Record<string, unknown>
    : parsed;

  return {
    status: response.status,
    type: sanitizeDiagnostic(rawError.type, 120),
    code: sanitizeDiagnostic(rawError.code, 120),
    message: sanitizeDiagnostic(rawError.message || bodyText, 260),
  };
}

function publicOpenAIImageError(operation: "image_generation" | "image_edit", details: OpenAIImageErrorDetails) {
  if (details.status === 429) return new HttpError(429, "ai_rate_limited");
  if (details.status === 402) return new HttpError(402, "ai_credits_exhausted");

  const reason = details.code || details.type || details.message || "unknown";
  const publicMessage = `${operation}_failed:${details.status}:${reason}`.slice(0, 420);

  if (details.status === 400) return new HttpError(400, publicMessage);
  if (details.status === 401 || details.status === 403) return new HttpError(502, publicMessage);
  return new HttpError(502, publicMessage);
}

function logOpenAIImageError(operation: "image_generation" | "image_edit", details: OpenAIImageErrorDetails, options: ImageRequestOptions) {
  console.error(`[${FUNCTION_NAME}] ${operation}_provider_error`, {
    provider_status: details.status,
    provider_type: details.type || null,
    provider_code: details.code || null,
    provider_message: details.message || null,
    model: options.model,
    quality: options.quality,
    size: options.size,
    mode: options.mode,
  });
}

function buildImageOnlyResult(input: {
  restaurantName: string;
  dishName: string;
  userPrompt: string;
  format: string;
  sourceImagePresent: boolean;
}): ImageEnhanceResult {
  const dishLabel = input.dishName || "produit ou plat du restaurant";
  const title = input.dishName ? `Visuel TOK - ${input.dishName}` : "Visuel TOK";
  const enhancedPrompt = input.sourceImagePresent
    ? SOURCE_IMAGE_EDIT_PROMPT
    : [
      `Créer une photographie professionnelle appétissante pour ${dishLabel}.`,
      input.userPrompt,
      `Restaurant: ${input.restaurantName}. Format demandé: ${input.format}.`,
      "Image finale sans texte incrusté, sans watermark, sans élément de marque concurrente.",
    ].filter(Boolean).join("\n").slice(0, 3000);

  return {
    title,
    enhanced_prompt: enhancedPrompt,
    edit_instructions: "",
    alt_text: `Visuel TOK premium pour ${dishLabel}`,
    publication_caption: "",
    checklist: [],
    style_tags: ["tok", "image-only", input.format],
    safety_notes: [],
    marketing_angles: [],
  };
}

async function fetchImageBlob(url: string) {
  const response = await fetchWithTimeout(url, {}, SOURCE_IMAGE_TIMEOUT_MS, "source_image_timeout");
  if (!response.ok) throw new HttpError(400, "source_image_unreachable");
  const contentType = response.headers.get("content-type") || guessMimeFromUrl(url);
  if (!contentType.startsWith("image/")) throw new HttpError(400, "source_image_invalid_type");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 18 * 1024 * 1024) throw new HttpError(400, "source_image_too_large");
  return new Blob([bytes], { type: contentType });
}

async function callOpenAIImageGeneration(prompt: string, n: number, options: ImageRequestOptions) {
  const response = await fetchWithTimeout(IMAGE_GENERATIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      prompt,
      size: options.size,
      n,
      quality: options.quality,
      output_format: "png",
      moderation: "auto",
    }),
  }, options.timeoutMs, "image_generation_timeout");

  if (!response.ok) {
    const details = await readOpenAIImageError(response);
    logOpenAIImageError("image_generation", details, options);
    throw publicOpenAIImageError("image_generation", details);
  }

  return await response.json();
}

async function callOpenAIImageEdit(prompt: string, sourceImageUrl: string, n: number, options: ImageRequestOptions) {
  const sourceBlob = await fetchImageBlob(sourceImageUrl);
  const form = new FormData();
  form.append("model", options.model);
  form.append("prompt", prompt);
  form.append("size", options.size);
  form.append("n", String(n));
  form.append("quality", options.quality);
  form.append("output_format", "png");
  form.append("moderation", "auto");
  form.append("image", sourceBlob, "source.png");

  const response = await fetchWithTimeout(IMAGE_EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  }, options.timeoutMs, "image_edit_timeout");

  if (!response.ok) {
    const details = await readOpenAIImageError(response);
    logOpenAIImageError("image_edit", details, options);
    throw publicOpenAIImageError("image_edit", details);
  }

  return await response.json();
}

async function extractGeneratedImageBytes(imageResponse: unknown) {
  const data = (imageResponse as Record<string, unknown>)?.data;
  const first = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (!first) throw new HttpError(502, "image_empty_response");

  if (typeof first.b64_json === "string") return bytesFromBase64(first.b64_json);

  if (typeof first.url === "string") {
    const response = await fetchWithTimeout(first.url, {}, SOURCE_IMAGE_TIMEOUT_MS, "image_url_timeout");
    if (!response.ok) throw new HttpError(502, "image_url_unreachable");
    return new Uint8Array(await response.arrayBuffer());
  }

  throw new HttpError(502, "image_missing_payload");
}

async function storeGeneratedImage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  restaurantId: string,
  bytes: Uint8Array,
) {
  const id = crypto.randomUUID();
  const path = `ai-generated/${restaurantId}/${id}.png`;
  const { error: uploadError } = await actor.adminClient.storage.from(IMAGE_BUCKET).upload(path, bytes, {
    contentType: "image/png",
    upsert: false,
  });

  if (uploadError) throw new HttpError(500, uploadError.message);

  const { data: publicData } = actor.adminClient.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  let imageUrl = publicData.publicUrl;

  if (IMAGE_BUCKET === "ai-generated-assets") {
    const { data: signed } = await actor.adminClient.storage.from(IMAGE_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) imageUrl = signed.signedUrl;
  }

  const galleryPath = `ai-gallery/${restaurantId}/${id}.png`;
  const { error: galleryUploadError } = await actor.adminClient.storage.from(GALLERY_BUCKET).upload(galleryPath, bytes, {
    contentType: "image/png",
    upsert: false,
  });

  if (galleryUploadError) throw new HttpError(500, galleryUploadError.message);

  const { data: galleryPublicData } = actor.adminClient.storage.from(GALLERY_BUCKET).getPublicUrl(galleryPath);
  return { id, path, imageUrl, galleryPath, galleryImageUrl: galleryPublicData.publicUrl };
}

function isMissingGeneratedAssetsTable(error: { message?: string } | null | undefined) {
  const message = error?.message || "";
  return message.includes("ai_generated_assets") && (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("Could not find the table")
  );
}

async function insertGeneratedAsset(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: Record<string, unknown>,
) {
  const { data, error } = await actor.adminClient
    .from("ai_generated_assets")
    .insert(payload)
    .select("id")
    .single();

  if (!error) return typeof data?.id === "string" ? data.id : null;
  if (isMissingGeneratedAssetsTable(error)) return null;
  throw new HttpError(500, error.message);
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    restaurantId?: string | null;
    assetId?: string | null;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    imageCount?: number;
    metadata?: Record<string, unknown>;
  },
) {
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: "image_enhance",
    model: payload.model || IMAGE_MODEL,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    generated_asset_id: payload.assetId || null,
    status: payload.status,
    input_tokens: payload.usage?.input_tokens ?? 0,
    output_tokens: payload.usage?.output_tokens ?? 0,
    total_tokens: payload.usage?.total_tokens ?? 0,
    estimated_cost_chf: estimateCostChf(payload.usage?.input_tokens, payload.usage?.output_tokens, payload.imageCount || 0),
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
    const prompt = sanitizeText(body.prompt || body.objective || SOURCE_IMAGE_EDIT_PROMPT);
    const dishName = sanitizeText(body.dishName, 120);
    const sourceImageUrl = sanitizeUrl(body.sourceImageUrl);
    const assetType = normalizeAssetType(body.assetType);
    const format = normalizeFormat(body.format);
    const variantCount = clampVariantCount(body.variantCount);
    const generateImage = body.generateImage !== false;
    const imageOnly = true;

    if (!restaurantId) throw new HttpError(400, "restaurant_required");
    if (!generateImage) throw new HttpError(400, "image_generation_required");
    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 40, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 80, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 120, windowSeconds: 60 });

    const result = buildImageOnlyResult({
      restaurantName: restaurant.name || "Restaurant TOK",
      dishName,
      userPrompt: prompt,
      format: format.label,
      sourceImagePresent: Boolean(sourceImageUrl),
    });
    const briefSource = "image_only";

    let generated: GeneratedImage | null = null;
    const generatedImageOptions = buildImageRequestOptions(format.size);
    let usedImageOptions: ImageRequestOptions | null = null;
    let imageEditRetryUsed = false;
    let sourceEditUsed = false;

    let imageOptions = generatedImageOptions;
    const finalPrompt = sourceImageUrl
      ? SOURCE_IMAGE_EDIT_PROMPT
      : [
        result.enhanced_prompt,
        "",
        "Contraintes finales non négociables:",
        TOK_PHOTO_DNA,
        "Image finale sans texte incrusté, sans watermark, sans élément de marque concurrente. Produit crédible et appétissant.",
      ].join("\n").slice(0, 7000);

    let imageResponse: unknown;
    if (sourceImageUrl) {
      try {
        imageResponse = await callOpenAIImageEdit(finalPrompt, sourceImageUrl, variantCount, imageOptions);
        sourceEditUsed = true;
      } catch (error) {
        const isImageEditFailure = error instanceof HttpError && error.message.startsWith("image_edit_failed");
        if (isImageEditFailure) {
          const configuredEditOptions = buildConfiguredImageRequestOptions(format.size);
          const shouldRetryConfiguredEdit =
            configuredEditOptions.model !== imageOptions.model ||
            configuredEditOptions.quality !== imageOptions.quality ||
            configuredEditOptions.size !== imageOptions.size;

          if (!shouldRetryConfiguredEdit) throw error;

          log.warn("image_edit_retry", {
            restaurant_id: restaurantId,
            primary_model: imageOptions.model,
            retry_model: configuredEditOptions.model,
          });
          imageResponse = await callOpenAIImageEdit(finalPrompt, sourceImageUrl, variantCount, configuredEditOptions);
          imageOptions = configuredEditOptions;
          imageEditRetryUsed = true;
          sourceEditUsed = true;
        } else {
          throw error;
        }
      }
    } else {
      imageResponse = await callOpenAIImageGeneration(finalPrompt, variantCount, imageOptions);
    }

    const imageBytes = await extractGeneratedImageBytes(imageResponse);
    const stored = await storeGeneratedImage(actor, restaurantId, imageBytes);
    usedImageOptions = imageOptions;

    const persistedAssetId = await insertGeneratedAsset(actor, {
      restaurant_id: restaurantId,
      user_id: actor.userId,
      source_image_url: sourceImageUrl || null,
      asset_url: stored.galleryImageUrl,
      storage_bucket: IMAGE_BUCKET,
      storage_path: stored.path,
      asset_type: assetType,
      model: imageOptions.model,
      prompt: result.enhanced_prompt,
      title: result.title,
      status: "stored",
      metadata: {
        image_quality: imageOptions.quality,
        request_image_model: imageOptions.model,
        request_image_quality: imageOptions.quality,
        request_image_size: imageOptions.size,
        image_mode: imageOptions.mode,
        source_edit_used: sourceEditUsed,
        image_edit_retry: imageEditRetryUsed,
        generation_fallback_allowed: !sourceImageUrl,
        output_format: "png",
        brief_source: briefSource,
        preview_image_url: stored.imageUrl,
        gallery_image_url: stored.galleryImageUrl,
        gallery_storage_bucket: GALLERY_BUCKET,
        gallery_storage_path: stored.galleryPath,
        original_prompt: prompt,
        dish_name: dishName,
        format: format.label,
        source_preservation_policy: sourceImageUrl ? "strict_source_edit_no_generation_fallback" : "generation_without_source",
        reference_folder: `public${TOK_REFERENCE_FOLDER}`,
      },
    });

    const generatedAssetId = persistedAssetId || stored.id;
    assetId = generatedAssetId;
    generated = {
      asset_id: generatedAssetId,
      generated_image_url: stored.imageUrl,
      gallery_image_url: stored.galleryImageUrl,
      storage_bucket: IMAGE_BUCKET,
      storage_path: stored.path,
      model: imageOptions.model,
    };

    await insertUsage(actor, {
      status: "success",
      restaurantId,
      assetId,
      model: usedImageOptions?.model,
      imageCount: generated ? variantCount : 0,
      metadata: {
        asset_type: assetType,
        has_source_image: Boolean(sourceImageUrl),
        generated_image: Boolean(generated),
        image_only: imageOnly,
        brief_source: briefSource,
        image_timeout_ms: usedImageOptions?.timeoutMs,
        image_model: usedImageOptions?.model,
        image_quality: usedImageOptions?.quality,
        image_mode: usedImageOptions?.mode,
        source_edit_used: sourceEditUsed,
        image_edit_retry: imageEditRetryUsed,
        generation_fallback_allowed: !sourceImageUrl,
        gallery_bucket: GALLERY_BUCKET,
        output_format: "png",
        format: format.label,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: "image_generate",
      actor,
      request: req,
      targetEntityType: "ai_generated_assets",
      targetEntityId: assetId,
      metadata: {
        rid: log.rid,
        restaurant_id: restaurantId,
        image_model: usedImageOptions?.model,
        image_quality: usedImageOptions?.quality,
        image_mode: usedImageOptions?.mode,
        brief_source: briefSource,
        image_only: imageOnly,
        source_edit_used: sourceEditUsed,
        image_edit_retry: imageEditRetryUsed,
        gallery_bucket: GALLERY_BUCKET,
      },
    });

    return jsonResponse({
      ...result,
      assetId,
      generated_image_url: generated?.generated_image_url || null,
      gallery_image_url: generated?.gallery_image_url || null,
      storage_bucket: generated?.storage_bucket || null,
      storage_path: generated?.storage_path || null,
      model: generated?.model || IMAGE_MODEL,
      image_mode: usedImageOptions?.mode,
      reference_folder: `public${TOK_REFERENCE_FOLDER}`,
      status: "stored",
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
