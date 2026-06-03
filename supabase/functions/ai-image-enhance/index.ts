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
  gallery_storage_bucket: string;
  gallery_storage_path: string;
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
const IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-1.5";
const IMAGE_QUALITY = normalizeImageQuality(Deno.env.get("OPENAI_IMAGE_QUALITY")?.trim());
const IMAGE_TIMEOUT_MS = readPositiveIntEnv("OPENAI_IMAGE_TIMEOUT_MS", 95_000, 115_000);
const USE_FAST_INTERACTIVE_IMAGE = readEnvFlag("TOK_IMAGE_FAST_INTERACTIVE", false);
const INTERACTIVE_IMAGE_MODEL = Deno.env.get("TOK_INTERACTIVE_IMAGE_MODEL")?.trim() || "gpt-image-1-mini";
const INTERACTIVE_IMAGE_QUALITY = normalizeInteractiveImageQuality(Deno.env.get("TOK_INTERACTIVE_IMAGE_QUALITY")?.trim());
const INTERACTIVE_IMAGE_SIZE = normalizeInteractiveImageSize(Deno.env.get("TOK_INTERACTIVE_IMAGE_SIZE")?.trim());
const INTERACTIVE_IMAGE_TIMEOUT_MS = readPositiveIntEnv("TOK_INTERACTIVE_IMAGE_TIMEOUT_MS", 42_000, 50_000);
const SOURCE_IMAGE_TIMEOUT_MS = readPositiveIntEnv("TOK_SOURCE_IMAGE_TIMEOUT_MS", 12_000, 30_000);
const IMAGE_BUCKET = Deno.env.get("TOK_AI_IMAGE_BUCKET")?.trim() || "ai-generated-assets";
const GALLERY_BUCKET = Deno.env.get("TOK_GALLERY_IMAGE_BUCKET")?.trim() || "images";
const TOK_REFERENCE_FOLDER = "/tok-reference-food-webp";
const SUPPORTED_SOURCE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_STUDIO_RETOUCH_PROMPT = `
Retouche cette photo de [TYPE_DE_PLAT] en conservant strictement le produit d'origine : mêmes ingrédients visibles, mêmes proportions, même structure, même angle de vue global, même composition générale, même position des éléments principaux et même identité visuelle. Ne pas remplacer ni redessiner le produit.

Objectif : transformer l'image en photographie culinaire publicitaire haut de gamme, style [STYLE_SOHAITÉ : studio premium / restaurant haut de gamme / fast-food premium / artisanal chic], avec une ambiance [AMBIANCE : chaude / élégante / gourmande / moderne / sombre premium / lumineuse naturelle].

Instructions :
- Supprimer les éléments parasites et nettoyer la scène.
- Simplifier ou remplacer l'arrière-plan par un décor [TYPE_DE_FOND].
- Améliorer le support sous le produit pour le rendre plus premium et discret.
- Appliquer un éclairage [TYPE_DE_LUMIÈRE : doux, studio, chaud, contrasté, naturel].
- Améliorer les textures gourmandes adaptées au produit : [TEXTURES À METTRE EN VALEUR].
- Corriger la balance des blancs, la colorimétrie, le contraste et les volumes.
- Accentuer la netteté sur le sujet principal uniquement.
- Ajouter une profondeur de champ élégante si utile.
- Donner un rendu final réaliste, premium, propre, appétissant et commercial.

Contraintes :
- Ne pas modifier la nature du produit.
- Ne pas ajouter de texte, logo ou éléments graphiques.
- Ne pas changer le nombre d'éléments principaux.
- Ne pas déformer les ingrédients.
- Rendu photographique réaliste uniquement.
- Préserver le cadrage et le ratio d'origine sauf indication contraire.
`.trim();
const SOURCE_IMAGE_EDIT_PROMPT = PHOTO_STUDIO_RETOUCH_PROMPT;
const PREMIUM_SOURCE_IMAGE_EDIT_PROMPT = PHOTO_STUDIO_RETOUCH_PROMPT;
const DEFAULT_PHOTO_STUDIO_STYLE = "studio premium / restaurant haut de gamme";
const DEFAULT_PHOTO_STUDIO_AMBIANCE = "elegante, gourmande, moderne et lumineuse naturelle";
const DEFAULT_PHOTO_STUDIO_BACKGROUND = "studio culinaire propre, premium et discret";
const DEFAULT_PHOTO_STUDIO_LIGHTING = "doux, studio et naturel";
const DEFAULT_PHOTO_STUDIO_TEXTURES =
  "fraicheur, croustillant, brillance naturelle, relief des ingredients, moelleux, dorure et sauces selon le produit source";

const TOK_PHOTO_DNA = `
Charte de retouche culinaire premium non brandee:
- modele image cible: gpt-image-1.5 via OPENAI_IMAGE_MODEL, avec edition de l'image source quand elle existe;
- REGLE BLOQUANTE: si une image source est fournie, l'image finale doit rester une retouche fidele du meme sujet, pas une reinterpretation;
- conserver la nature exacte du sujet source: meme produit ou plat, meme contenant, meme packaging, meme forme generale et meme identite visuelle reconnaissable;
- conserver les textes, inscriptions, marques, etiquettes, symboles et typographies visibles du sujet source seulement s'ils existent deja physiquement sur le plat, le contenant ou le packaging;
- supprimer les logos de coin, les watermarks, les filigranes, les bulles de marque, les badges, les autocollants virtuels ou les marques superposees qui ne font pas partie de l'objet photographie;
- ne jamais inventer, remplacer, deformer ou approximativement recreer une etiquette, un logo ou un texte visible;
- si le sujet source est un produit emballe, une boite, un sachet, une bouteille, une conserve ou un verre imprime, conserver cet objet comme sujet principal;
- ne jamais transformer un produit emballe en plat servi, toast, assiette gastronomique ou scene culinaire differente;
- ne jamais remplacer une salade, un dessert, une bouteille, une assiette ou un plat source par un autre type de nourriture;
- nettoyage studio: supprimer les objets hors sujet, mains, couverts inutiles, miettes, taches, reflets sales, bords de table distrayants, fonds encombrants et parasites visuels;
- composition: conserver une composition proche de la scene source; ameliorer seulement le cadrage lorsque cela ne change pas l'identite;
- rendu studio photo: eclairage softbox premium, contraste maitrise, blancs propres, sujet net, textures visibles, reflets propres et naturels;
- profondeur de champ: garder le produit principal net et ajouter un flou d'arriere-plan doux seulement si cela ne masque aucun detail important du sujet;
- formes et volumes: renforcer les contours, volumes et textures par la lumiere et la nettete, sans remodeler le produit, ses ingredients, son emballage ou ses proportions;
- style avant/apres: meme photo, meme sujet, mais plus premium, plus nette, mieux eclairee et plus vendable;
- ne jamais ajouter de logo, filigrane, watermark, marque ou texte incruste dans l'image generee;
- ne jamais ajouter de logo de plateforme, bulle de marque, mascotte, macaron, badge ou pictogramme de marque dans l'image generee;
- interdit absolu: ne pas dessiner, simuler, reproduire ou integrer un element de marque de plateforme, un macaron de marque ou un filigrane;
- ne pas ajouter de prix, faux logo tiers, fausse certification, visage, main, emballage concurrent ou claim medical;
- controle qualite final: au premier regard, l'utilisateur doit reconnaitre le sujet source exact.
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
  if (value === "low" || value === "medium") return value;
  if (value === "high" && readEnvFlag("TOK_ALLOW_HIGH_IMAGE_QUALITY", false)) return "high";
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

function buildImageRequestOptions(formatSize: string, sourceImagePresent: boolean): ImageRequestOptions {
  const shouldUseFastInteractiveEdit = sourceImagePresent && USE_FAST_INTERACTIVE_IMAGE;
  if (!shouldUseFastInteractiveEdit) return buildConfiguredImageRequestOptions(formatSize);

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

function stripBrandOverlayInstructions(raw: string) {
  return raw
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const lower = part
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const mentionsOverlay = /\b(logo|filigrane|watermark|marque|badge|macaron|mascotte|calque)\b/.test(lower);
      const asksAddition = /\b(ajout|ajoute|ajouter|appose|apposer|incruste|incruster|genere|generer|dessine|dessiner)\b/.test(lower);
      return !(mentionsOverlay && asksAddition);
    })
    .join(" ")
    .trim()
    .slice(0, 1800);
}

function stripPlatformBrandTerms(raw: string) {
  return raw
    .replace(/\bTOK\b/gi, "plateforme")
    .replace(/\bTheTok\b/gi, "plateforme")
    .replace(/\bMiamz\b/gi, "marque")
    .trim();
}

function buildPhotoStudioRetouchPrompt(input: { dishName: string; userPrompt: string }) {
  const dishLabel = input.dishName || "produit ou plat du restaurant";
  const extraInstruction = input.userPrompt
    ? `Consigne restaurateur additionnelle: ${input.userPrompt}`
    : "";

  return [
    PHOTO_STUDIO_RETOUCH_PROMPT
      .replace(/\[TYPE_DE_PLAT\]/g, dishLabel)
      .replace(/\[STYLE_[^\]]+\]/g, DEFAULT_PHOTO_STUDIO_STYLE)
      .replace(/\[AMBIANCE[^\]]+\]/g, DEFAULT_PHOTO_STUDIO_AMBIANCE)
      .replace(/\[TYPE_DE_FOND\]/g, DEFAULT_PHOTO_STUDIO_BACKGROUND)
      .replace(/\[TYPE_DE_LUMI[^\]]+\]/g, DEFAULT_PHOTO_STUDIO_LIGHTING)
      .replace(/\[TEXTURES[^\]]+\]/g, DEFAULT_PHOTO_STUDIO_TEXTURES),
    extraInstruction,
    "Retouche uniquement la photo source; ne cree pas une nouvelle scene libre.",
  ].filter(Boolean).join("\n\n").slice(0, 3600);
}

function buildCompactPhotoStudioRetouchPrompt(input: { dishName: string }) {
  const dishLabel = input.dishName || "produit ou plat du restaurant";

  return [
    `Retouche cette photo de ${dishLabel} comme une photographie culinaire publicitaire haut de gamme.`,
    "Conserve strictement le produit d'origine: memes ingredients visibles, memes proportions, meme structure, meme angle global, meme cadrage et meme position des elements principaux.",
    "Nettoie la scene, supprime les elements parasites, simplifie l'arriere-plan, ameliore le support, applique un bel eclairage studio doux, corrige colorimetrie, contraste, volumes et nettete du sujet principal.",
    "Ajoute une profondeur de champ elegante seulement si elle garde tous les details importants du produit principal lisibles.",
    "Contraintes: ne change pas la nature du produit, ne change pas le nombre d'elements principaux, ne deforme pas les ingredients, n'ajoute aucun texte, logo, badge, watermark ou element graphique.",
    "Rendu final realiste, premium, propre, appetissant et commercial.",
  ].join("\n");
}

function sanitizeConfiguredUrl(raw: unknown, fallback = "") {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fallback;
    return parsed.toString();
  } catch {
    return fallback;
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

function normalizeImageMimeType(raw: string | null, url: string) {
  const contentType = raw?.split(";")[0]?.trim().toLowerCase() || "";
  if (contentType === "image/jpg") return "image/jpeg";
  if (contentType.startsWith("image/")) return contentType;
  return guessMimeFromUrl(url);
}

function getSourceImageFileName(mimeType: string) {
  if (mimeType === "image/png") return "source.png";
  if (mimeType === "image/webp") return "source.webp";
  return "source.jpg";
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
  sourceEditPrompt?: string;
}): ImageEnhanceResult {
  const dishLabel = input.dishName || "produit ou plat du restaurant";
  const title = input.dishName ? `Visuel TOK - ${input.dishName}` : "Visuel TOK";
  const enhancedPrompt = input.sourceImagePresent
    ? input.sourceEditPrompt || SOURCE_IMAGE_EDIT_PROMPT
    : [
      `Creer une photographie culinaire de studio professionnelle et appetissante pour ${dishLabel}.`,
      input.userPrompt,
      `Restaurant: ${input.restaurantName}. Format demande: ${input.format}.`,
      "Rendu studio attendu: fond propre, eclairage softbox premium, sujet net, textures appetissantes, formes valorisees, profondeur de champ douce et joli flou d'arriere-plan. Image finale non brandee: sans logo, sans texte de marque, sans marque de plateforme, sans bulle, sans mascotte, sans macaron, sans texte incruste et sans watermark. Les elements de marque sont ajoutes apres generation par l'interface, comme calque transparent separe.",
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
  const contentType = normalizeImageMimeType(response.headers.get("content-type"), url);
  if (!contentType.startsWith("image/")) throw new HttpError(400, "source_image_invalid_type");
  if (!SUPPORTED_SOURCE_IMAGE_MIME_TYPES.has(contentType)) throw new HttpError(400, "source_image_unsupported_type");
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
  form.append("image[]", sourceBlob, getSourceImageFileName(sourceBlob.type));

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

function shouldRetryImageEdit(error: unknown) {
  if (!(error instanceof HttpError)) return false;
  if (!error.message.startsWith("image_edit_failed:")) return false;

  const message = error.message.toLowerCase();
  return ![
    "content_policy",
    "safety",
    "rate",
    "credits",
    "invalid_image",
    "image_parse",
    "unsupported",
    "too_large",
    "file",
    "format",
    ":401:",
    ":403:",
    "api key",
    "invalid_value",
    "unsupported_parameter",
    "model",
  ].some((blockedReason) => message.includes(blockedReason));
}

async function callOpenAIImageEditWithRetry(input: {
  primaryPrompt: string;
  retryPrompt: string;
  sourceImageUrl: string;
  n: number;
  options: ImageRequestOptions;
}) {
  try {
    return {
      response: await callOpenAIImageEdit(input.primaryPrompt, input.sourceImageUrl, input.n, input.options),
      retryUsed: false,
    };
  } catch (error) {
    if (!shouldRetryImageEdit(error)) throw error;

    console.warn(`[${FUNCTION_NAME}] image_edit_retry`, {
      reason: error instanceof Error ? error.message : "unknown",
      model: input.options.model,
      quality: input.options.quality,
      size: input.options.size,
      mode: input.options.mode,
    });

    return {
      response: await callOpenAIImageEdit(input.retryPrompt, input.sourceImageUrl, input.n, input.options),
      retryUsed: true,
    };
  }
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
    const prompt = stripPlatformBrandTerms(stripBrandOverlayInstructions(sanitizeText(body.prompt || body.objective || PREMIUM_SOURCE_IMAGE_EDIT_PROMPT)));
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
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 60, windowSeconds: 600 });
    await rl.consume("global", { maxRequests: 180, windowSeconds: 60 });

    const sourceEditPrompt = sourceImageUrl
      ? buildPhotoStudioRetouchPrompt({ dishName, userPrompt: prompt })
      : "";
    const compactSourceEditPrompt = sourceImageUrl
      ? buildCompactPhotoStudioRetouchPrompt({ dishName })
      : "";

    const result = buildImageOnlyResult({
      restaurantName: restaurant.name || "Restaurant",
      dishName,
      userPrompt: prompt,
      format: format.label,
      sourceImagePresent: Boolean(sourceImageUrl),
      sourceEditPrompt,
    });
    const briefSource = "image_only";

    let generated: GeneratedImage | null = null;
    const generatedImageOptions = buildImageRequestOptions(format.size, Boolean(sourceImageUrl));
    let usedImageOptions: ImageRequestOptions | null = null;
    let imageEditRetryUsed = false;
    let sourceEditUsed = false;
    const imageOptions = generatedImageOptions;
    const finalPrompt = sourceImageUrl
      ? [
        sourceEditPrompt || PREMIUM_SOURCE_IMAGE_EDIT_PROMPT,
        "",
        "Contraintes finales non negociables:",
        TOK_PHOTO_DNA,
        "Rendu attendu: avant/apres fidele. Meme sujet reconnaissable immediatement, mais plus net, nettoye de tous les parasites, eclaire comme un studio photo, avec formes mieux valorisees, textures plus appetissantes, profondeur de champ douce et joli flou d'arriere-plan quand cela sert le produit.",
        "Interdiction explicite: ne pas ajouter de logo, texte de marque, bulle de marque, badge, filigrane ou watermark. Si un logo, une bulle de marque ou un filigrane existe deja dans l'image source, il doit etre retire de l'image generee. Les elements de marque sont superposes par l'interface apres generation, jamais par le modele.",
      ].join("\n").slice(0, 7000)
      : [
        result.enhanced_prompt,
        "",
        "Contraintes finales non negociables:",
        TOK_PHOTO_DNA,
        "Image finale de studio non brandee: sujet net, fond propre, eclairage softbox premium, formes valorisees, profondeur de champ douce, joli flou d'arriere-plan, sans texte incruste, sans logo, sans texte de marque, sans filigrane, sans watermark, sans badge, sans bulle de marque et sans mascotte. Les elements de marque seront ajoutes hors image par l'interface comme calque transparent separe, jamais par le modele image.",
      ].join("\n").slice(0, 7000);

    let imageResponse: unknown;
    if (sourceImageUrl) {
      const editResult = await callOpenAIImageEditWithRetry({
        primaryPrompt: finalPrompt,
        retryPrompt: [
          compactSourceEditPrompt,
          "",
          "Garde la retouche fidele a la photo source. Ne remplace pas le plat ou produit.",
        ].join("\n").slice(0, 2200),
        sourceImageUrl,
        n: variantCount,
        options: imageOptions,
      });
      imageResponse = editResult.response;
      imageEditRetryUsed = editResult.retryUsed;
      sourceEditUsed = true;
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
        brand_overlay_positioning: "frontend_transparent_layer",
        brand_overlay_size: "180x180",
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
      gallery_storage_bucket: GALLERY_BUCKET,
      gallery_storage_path: stored.galleryPath,
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
        brand_overlay_positioning: "frontend_transparent_layer",
        brand_overlay_size: "180x180",
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
        brand_overlay_positioning: "frontend_transparent_layer",
        brand_overlay_size: "180x180",
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
      gallery_storage_bucket: generated?.gallery_storage_bucket || null,
      gallery_storage_path: generated?.gallery_storage_path || null,
      model: generated?.model || IMAGE_MODEL,
      image_mode: usedImageOptions?.mode,
      brand_overlay_positioning: "frontend_transparent_layer",
      brand_overlay_size: "180x180",
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
