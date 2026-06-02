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
  extractUsage,
  parseStructuredOutput,
  selectTokAiModel,
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

const FUNCTION_NAME = "ai-image-enhance";
const IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-2";
const IMAGE_QUALITY = Deno.env.get("OPENAI_IMAGE_QUALITY")?.trim() || "high";
const IMAGE_BUCKET = Deno.env.get("TOK_AI_IMAGE_BUCKET")?.trim() || "ai-generated-assets";
const GALLERY_BUCKET = Deno.env.get("TOK_GALLERY_IMAGE_BUCKET")?.trim() || "images";
const TOK_REFERENCE_FOLDER = "/tok-reference-food-webp";

const TOK_PHOTO_DNA = `
Charte graphique TOK pour plats marketing:
- rendu photo studio premium, realiste, ultra appetissant, sans deformation du produit original;
- composition hero food: plat plus proche, cadrage dynamique, profondeur de champ douce, texture visible;
- lumiere chaude directionnelle, contraste maitrise, blancs propres, aliments brillants mais naturels;
- fonds TOK: noir charbon, bois sombre, beige creme, touches orange TOK, herbes fraiches, sauces, vapeur discrete;
- style avant/apres: transformer une photo telephone plate en visuel de marque restaurant premium;
- conserver l'identite du plat, la structure, les ingredients principaux et les portions plausibles;
- ne pas ajouter de texte, prix, faux logo tiers, fausse certification, visage, main, emballage concurrent ou claim medical;
- si le logo TOK est visible dans le produit source, le garder subtil, propre et non deforme;
- objectif final: image vendable sur page restaurant, fiche plat, campagne sponsorisee, actualite TOK ou banniere.
Dossier de references visuelles du projet: public${TOK_REFERENCE_FOLDER}.
`;

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
    "marketing_angles",
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
    marketing_angles: { type: "array", items: { type: "string" } },
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

async function fetchImageBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new HttpError(400, "source_image_unreachable");
  const contentType = response.headers.get("content-type") || guessMimeFromUrl(url);
  if (!contentType.startsWith("image/")) throw new HttpError(400, "source_image_invalid_type");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 18 * 1024 * 1024) throw new HttpError(400, "source_image_too_large");
  return new Blob([bytes], { type: contentType });
}

async function callOpenAIImageGeneration(prompt: string, size: string, n: number) {
  const response = await fetch(IMAGE_GENERATIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size,
      n,
      quality: IMAGE_QUALITY,
      output_format: "png",
      moderation: "auto",
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, "ai_rate_limited");
    if (response.status === 402) throw new HttpError(402, "ai_credits_exhausted");
    throw new HttpError(502, "image_generation_failed");
  }

  return await response.json();
}

async function callOpenAIImageEdit(prompt: string, sourceImageUrl: string, size: string, n: number) {
  const sourceBlob = await fetchImageBlob(sourceImageUrl);
  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", String(n));
  form.append("quality", IMAGE_QUALITY);
  form.append("output_format", "png");
  form.append("moderation", "auto");
  form.append("image", sourceBlob, "source.png");

  const response = await fetch(IMAGE_EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, "ai_rate_limited");
    if (response.status === 402) throw new HttpError(402, "ai_credits_exhausted");
    throw new HttpError(502, "image_edit_failed");
  }

  return await response.json();
}

async function extractGeneratedImageBytes(imageResponse: unknown) {
  const data = (imageResponse as Record<string, unknown>)?.data;
  const first = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (!first) throw new HttpError(502, "image_empty_response");

  if (typeof first.b64_json === "string") {
    return bytesFromBase64(first.b64_json);
  }

  if (typeof first.url === "string") {
    const response = await fetch(first.url);
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
    usage?: ReturnType<typeof extractUsage>;
    imageCount?: number;
    metadata?: Record<string, unknown>;
  },
) {
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: "image_enhance",
    model: IMAGE_MODEL,
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
    const prompt = sanitizeText(body.prompt || body.objective || "Rendre ce plat irrésistible dans la charte graphique TOK.");
    const dishName = sanitizeText(body.dishName, 120);
    const sourceImageUrl = sanitizeUrl(body.sourceImageUrl);
    const assetType = normalizeAssetType(body.assetType);
    const format = normalizeFormat(body.format);
    const variantCount = clampVariantCount(body.variantCount);
    const generateImage = body.generateImage !== false;

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

    const systemPrompt = `Tu es le directeur artistique food premium de TOK.
Tu transformes des photos de restaurateurs en briefs et prompts exploitables pour generer des visuels marketing coherents.
Tu utilises la charte graphique TOK et le dossier de references ${TOK_REFERENCE_FOLDER} comme memoire de style.
Tu ne dois jamais deformer le plat, inventer une portion mensongere, ajouter un logo concurrent, ajouter du texte illisible ou promettre un effet nutritionnel.
${TOK_PHOTO_DNA}`;

    const creativeContext = {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        city: restaurant.city,
        cuisine_type: restaurant.cuisine_type,
      },
      ai_profile: profile || null,
      dish_name: dishName || null,
      user_objective: prompt,
      asset_type: assetType,
      requested_format: format.label,
      reference_folder: `public${TOK_REFERENCE_FOLDER}`,
      source_image_present: Boolean(sourceImageUrl),
      tok_style_dna: TOK_PHOTO_DNA,
    };

    const userContent = sourceImageUrl
      ? [
        { type: "input_text", text: JSON.stringify(creativeContext) },
        { type: "input_image", image_url: sourceImageUrl },
      ]
      : JSON.stringify(creativeContext);

    const openAIResponse = await createOpenAIResponse({
      model: selectTokAiModel("image_premium"),
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxOutputTokens: 1400,
      jsonSchema: {
        name: "tok_image_enhancement_brief",
        description: "TOK branded restaurant image generation brief.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = parseStructuredOutput<ImageEnhanceResult>(openAIResponse);
    const usage = extractUsage(openAIResponse);

    let generated: GeneratedImage | null = null;

    if (generateImage) {
      const finalPrompt = [
        result.enhanced_prompt,
        "",
        "Contraintes finales:",
        TOK_PHOTO_DNA,
        "Image finale sans texte incruste, sans watermark, sans element de marque concurrente. Produit credible et appetissant.",
      ].join("\n").slice(0, 7000);

      let imageResponse: unknown;
      if (sourceImageUrl) {
        try {
          imageResponse = await callOpenAIImageEdit(finalPrompt, sourceImageUrl, format.size, variantCount);
        } catch (error) {
          if (error instanceof HttpError && error.message === "image_edit_failed") {
            imageResponse = await callOpenAIImageGeneration(finalPrompt, format.size, variantCount);
          } else {
            throw error;
          }
        }
      } else {
        imageResponse = await callOpenAIImageGeneration(finalPrompt, format.size, variantCount);
      }

      const imageBytes = await extractGeneratedImageBytes(imageResponse);
      const stored = await storeGeneratedImage(actor, restaurantId, imageBytes);

      const persistedAssetId = await insertGeneratedAsset(actor, {
        restaurant_id: restaurantId,
        user_id: actor.userId,
        source_image_url: sourceImageUrl || null,
        asset_url: stored.galleryImageUrl,
        storage_bucket: IMAGE_BUCKET,
        storage_path: stored.path,
        asset_type: assetType,
        model: IMAGE_MODEL,
        prompt: result.enhanced_prompt,
        title: result.title,
        status: "stored",
        metadata: {
          image_quality: IMAGE_QUALITY,
          output_format: "png",
          preview_image_url: stored.imageUrl,
          gallery_image_url: stored.galleryImageUrl,
          gallery_storage_bucket: GALLERY_BUCKET,
          gallery_storage_path: stored.galleryPath,
          edit_instructions: result.edit_instructions,
          alt_text: result.alt_text,
          publication_caption: result.publication_caption,
          checklist: result.checklist,
          style_tags: result.style_tags,
          safety_notes: result.safety_notes,
          marketing_angles: result.marketing_angles,
          original_prompt: prompt,
          dish_name: dishName,
          format: format.label,
          reference_folder: `public${TOK_REFERENCE_FOLDER}`,
        },
      });

      assetId = persistedAssetId || stored.id;
      generated = {
        asset_id: assetId,
        generated_image_url: stored.imageUrl,
        gallery_image_url: stored.galleryImageUrl,
        storage_bucket: IMAGE_BUCKET,
        storage_path: stored.path,
        model: IMAGE_MODEL,
      };
    } else {
      const persistedAssetId = await insertGeneratedAsset(actor, {
        restaurant_id: restaurantId,
        user_id: actor.userId,
        source_image_url: sourceImageUrl || null,
        asset_type: "image_brief",
        model: selectTokAiModel("image_premium"),
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
          marketing_angles: result.marketing_angles,
          original_prompt: prompt,
          dish_name: dishName,
          format: format.label,
          reference_folder: `public${TOK_REFERENCE_FOLDER}`,
        },
      });

      assetId = persistedAssetId || crypto.randomUUID();
    }

    await insertUsage(actor, {
      status: "success",
      restaurantId,
      assetId,
      usage,
      imageCount: generated ? variantCount : 0,
      metadata: {
        asset_type: assetType,
        has_source_image: Boolean(sourceImageUrl),
        generated_image: Boolean(generated),
        image_model: IMAGE_MODEL,
        image_quality: IMAGE_QUALITY,
        gallery_bucket: GALLERY_BUCKET,
        output_format: "png",
        format: format.label,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: generated ? "image_generate" : "image_brief",
      actor,
      request: req,
      targetEntityType: "ai_generated_assets",
      targetEntityId: assetId,
      metadata: {
        rid: log.rid,
        restaurant_id: restaurantId,
        image_model: IMAGE_MODEL,
        image_quality: IMAGE_QUALITY,
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
      model: generated?.model || selectTokAiModel("image_premium"),
      reference_folder: `public${TOK_REFERENCE_FOLDER}`,
      status: generated ? "stored" : "generated",
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
