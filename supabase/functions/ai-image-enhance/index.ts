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

type ImageQuality = "medium";
type ImageOutputResolution = "web" | "studio" | "print";
type TokImageModel = "gpt-image-2";

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

type ImageOperationResult = {
  response: unknown;
  options: ImageRequestOptions;
  retryUsed: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
};

const FUNCTION_NAME = "ai-image-enhance";
const IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const IMAGE_MODEL: TokImageModel = "gpt-image-2";
const IMAGE_QUALITY: ImageQuality = "medium";
const IMAGE_TIMEOUT_MS = readPositiveIntEnv("OPENAI_IMAGE_TIMEOUT_MS", 95_000, 115_000);
const GPT_IMAGE_2_TIMEOUT_FLOOR_MS = 110_000;
const CONFIGURED_RETRY_IMAGE_TIMEOUT_MS = 70_000;
const USE_FAST_INTERACTIVE_IMAGE = readEnvFlag("TOK_IMAGE_FAST_INTERACTIVE", false);
const INTERACTIVE_IMAGE_TIMEOUT_MS = readPositiveIntEnv("TOK_INTERACTIVE_IMAGE_TIMEOUT_MS", 42_000, 50_000);
const SOURCE_IMAGE_TIMEOUT_MS = readPositiveIntEnv("TOK_SOURCE_IMAGE_TIMEOUT_MS", 12_000, 30_000);
const IMAGE_BUCKET = Deno.env.get("TOK_AI_IMAGE_BUCKET")?.trim() || "ai-generated-assets";
const GALLERY_BUCKET = Deno.env.get("TOK_GALLERY_IMAGE_BUCKET")?.trim() || "images";
const TOK_REFERENCE_FOLDER = "/tok-reference-food-webp";
const MARKETING_REFERENCE_LIMIT = 4;
const MARKETING_REFERENCE_MEDIA_TYPE_PRIORITY = [
  "marketing_logo",
  "marketing_business_card",
  "marketing_menu",
  "marketing_brand_visual",
] as const;
const MARKETING_REFERENCE_MEDIA_TYPES = [...MARKETING_REFERENCE_MEDIA_TYPE_PRIORITY];
const MARKETING_REFERENCE_STORAGE_SEGMENT = "/marketing-assets/";
const SUPPORTED_SOURCE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const USD_TO_CHF_RATE = 0.81;
const PHOTO_CREDIT_CHF = 0.009;
const GPT_IMAGE_2_MEDIUM_BASE_COST_CHF = 0.05;
const GPT_IMAGE_2_MEDIUM_BASE_COST_USD = GPT_IMAGE_2_MEDIUM_BASE_COST_CHF / USD_TO_CHF_RATE;
const PHOTO_STUDIO_MASTER_PROMPT =
  "Génère une image de qualité photographique professionnelle studio, digne des meilleurs food photographe. Au besoin, change l’angle de vue mais préserve les ingrédients du plat tout en améliorant la fraîcheur, l’éclairage, la profondeur de champ. Si le produit est coupé, tronqué, partiellement hors cadre ou sort de l'image, génère la partie manquante en élargissant l'angle ou en modifiant l'angle de vue, sans changer le produit, ses ingrédients, ses logos, ses textes ou son packaging. Le produit doit être parfaitement mis en valeur";
const PHOTO_STUDIO_RETOUCH_PROMPT = `
${PHOTO_STUDIO_MASTER_PROMPT}.

Sujet source : [TYPE_DE_PLAT]. Préserver strictement le produit d'origine : mêmes ingrédients visibles, même catégorie alimentaire, même nombre d'éléments principaux, mêmes proportions générales et même identité visuelle reconnaissable. Ne pas remplacer ni redessiner librement le produit.

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
- Changer légèrement l'angle de vue uniquement si cela améliore le rendu studio sans perdre la reconnaissance du plat source.
- Si le produit est coupé, tronqué, partiellement hors cadre ou sort de l'image, élargir le cadre ou ajuster l'angle de vue pour générer la partie manquante de manière réaliste, sans inventer un autre produit ni changer les ingrédients, logos, textes, packaging ou nombre d'éléments principaux.
- Donner un rendu final réaliste, premium, propre, appétissant et commercial.

Contraintes :
- Ne pas modifier la nature du produit.
- Ne jamais remplacer la categorie alimentaire source par une autre categorie alimentaire.
- Si la source montre deux burgers, deux tacos, une pizza, un sandwich, un plat emballe ou un dessert, la sortie doit conserver ce meme nombre et cette meme categorie.
- Ne pas ajouter de nouveau texte, logo ou élément graphique.
- Conserver les logos, textes, étiquettes, packagings et marques déjà présents physiquement sur l'image source.
- Ne pas changer le nombre d'éléments principaux.
- Ne pas déformer les ingrédients.
- Rendu photographique réaliste uniquement.
- Préserver le ratio d'origine sauf indication contraire.
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
- modele image cible: gpt-image-2, avec edition de l'image source quand elle existe;
- REGLE BLOQUANTE: si une image source est fournie, l'image finale doit rester une retouche fidele du meme sujet, pas une reinterpretation;
- conserver la nature exacte du sujet source: meme produit ou plat, meme contenant, meme packaging, meme forme generale et meme identite visuelle reconnaissable;
- conserver la categorie alimentaire exacte du sujet source; ne jamais transformer des burgers en tartine, toast, salade, pizza, dessert, bowl, assiette gastronomique ou autre plat different;
- conserver le nombre exact d'elements alimentaires principaux visibles dans la source;
- conserver les logos, textes, inscriptions, marques, etiquettes, symboles, packagings et typographies visibles du sujet source seulement s'ils existent deja physiquement sur le plat, le contenant ou le packaging;
- supprimer uniquement les overlays artificiels qui ne font pas partie de l'objet photographie: watermarks, filigranes, bulles de marque, badges, autocollants virtuels ou marques superposees;
- ne jamais inventer, remplacer, supprimer, deformer ou approximativement recreer une etiquette, un logo ou un texte visible deja present sur l'objet photographie;
- si le sujet source est un produit emballe, une boite, un sachet, une bouteille, une conserve ou un verre imprime, conserver cet objet comme sujet principal;
- ne jamais transformer un produit emballe en plat servi, toast, assiette gastronomique ou scene culinaire differente;
- ne jamais remplacer une salade, un dessert, une bouteille, une assiette ou un plat source par un autre type de nourriture;
- ne jamais remplacer un burger, sandwich, tacos, pizza, kebab, wrap ou plateau source par une tartine, un toast, une salade, un bol ou une assiette differente;
- nettoyage studio: supprimer les objets hors sujet, mains, couverts inutiles, miettes, taches, reflets sales, bords de table distrayants, fonds encombrants et parasites visuels;
- composition: conserver une composition reconnaissable depuis la scene source; ajuster l'angle ou le cadrage seulement si cela valorise le plat sans changer son identite;
- rendu studio photo: eclairage softbox premium, contraste maitrise, blancs propres, sujet net, textures visibles, reflets propres et naturels;
- profondeur de champ: garder le produit principal net et ajouter un flou d'arriere-plan doux seulement si cela ne masque aucun detail important du sujet;
- formes et volumes: renforcer les contours, volumes et textures par la lumiere et la nettete, sans remodeler le produit, ses ingredients, son emballage ou ses proportions;
- recuperation de cadrage: si le sujet source est coupe, tronque, partiellement hors cadre ou sort de l'image, elargir le cadre ou ajuster l'angle de vue pour completer la partie manquante de facon realiste sans changer le produit, ses ingredients, ses logos, ses textes, son packaging ou son nombre d'elements principaux;
- style avant/apres: meme photo, meme sujet, mais plus premium, plus nette, mieux eclairee et plus vendable;
- ne jamais ajouter de nouveau logo, filigrane, watermark, marque ou texte incruste dans l'image generee;
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

function normalizeImageModel(_raw: unknown): TokImageModel {
  return IMAGE_MODEL;
}

function getImageModelCreditMultiplier(_model: TokImageModel) {
  return 1;
}

function getConfiguredImageTimeoutMs(model: TokImageModel) {
  if (model === "gpt-image-2") return Math.max(IMAGE_TIMEOUT_MS, GPT_IMAGE_2_TIMEOUT_FLOOR_MS);
  return IMAGE_TIMEOUT_MS;
}

function getFallbackImageTimeoutMs(options: ImageRequestOptions) {
  if (options.mode === "configured") {
    return Math.min(options.timeoutMs, Math.max(INTERACTIVE_IMAGE_TIMEOUT_MS, CONFIGURED_RETRY_IMAGE_TIMEOUT_MS));
  }

  return Math.min(options.timeoutMs, INTERACTIVE_IMAGE_TIMEOUT_MS);
}

function buildConfiguredImageRequestOptions(formatSize: string, quality = IMAGE_QUALITY, model: TokImageModel = IMAGE_MODEL): ImageRequestOptions {
  return {
    model,
    quality,
    size: formatSize,
    timeoutMs: getConfiguredImageTimeoutMs(model),
    mode: "configured",
  };
}

function buildImageRequestOptions(formatSize: string, sourceImagePresent: boolean, quality: ImageQuality, model: TokImageModel): ImageRequestOptions {
  const shouldUseFastInteractiveGeneration = !sourceImagePresent && USE_FAST_INTERACTIVE_IMAGE;
  if (!shouldUseFastInteractiveGeneration) return buildConfiguredImageRequestOptions(formatSize, quality, model);

  return {
    model,
    quality: IMAGE_QUALITY,
    size: formatSize,
    timeoutMs: INTERACTIVE_IMAGE_TIMEOUT_MS,
    mode: "interactive_fast",
  };
}

function buildMarketingImageRequestOptions(formatSize: string, _hasReferenceImages: boolean, quality: ImageQuality, model: TokImageModel): ImageRequestOptions {
  return buildConfiguredImageRequestOptions(formatSize, quality, model);
}

function buildFallbackImageRequestOptions(options: ImageRequestOptions): ImageRequestOptions {
  return {
    ...options,
    quality: IMAGE_QUALITY,
    timeoutMs: getFallbackImageTimeoutMs(options),
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

function normalizeReferenceImageUrls(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((entry) => sanitizeUrl(entry)).filter(Boolean))).slice(0, 4);
}

function normalizeReferenceMediaIds(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((entry) => maybeUuid(entry)).filter((id): id is string => Boolean(id)))).slice(0, MARKETING_REFERENCE_LIMIT);
}

type MarketingReferenceRow = {
  id: string;
  media_url: string;
  media_type: typeof MARKETING_REFERENCE_MEDIA_TYPES[number];
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string | null;
};

function toMarketingReferenceRow(raw: Record<string, unknown>): MarketingReferenceRow | null {
  const mediaType = typeof raw.media_type === "string" ? raw.media_type : "";
  if (!MARKETING_REFERENCE_MEDIA_TYPES.includes(mediaType as typeof MARKETING_REFERENCE_MEDIA_TYPES[number])) return null;

  const url = sanitizeUrl(raw.media_url);
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id || !url) return null;

  return {
    id,
    media_url: url,
    media_type: mediaType as typeof MARKETING_REFERENCE_MEDIA_TYPES[number],
    storage_bucket: typeof raw.storage_bucket === "string" ? raw.storage_bucket : null,
    storage_path: typeof raw.storage_path === "string" ? raw.storage_path : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : null,
  };
}

function isCurrentMarketingStudioReference(row: MarketingReferenceRow, restaurantId: string) {
  return row.storage_bucket === GALLERY_BUCKET &&
    Boolean(row.storage_path?.includes(`${MARKETING_REFERENCE_STORAGE_SEGMENT}${restaurantId}/`));
}

function selectMarketingReferenceRows(rows: MarketingReferenceRow[]) {
  const selected: MarketingReferenceRow[] = [];

  for (const mediaType of MARKETING_REFERENCE_MEDIA_TYPE_PRIORITY) {
    for (const row of rows.filter((item) => item.media_type === mediaType)) {
      if (selected.some((item) => item.media_url === row.media_url)) continue;
      selected.push(row);
      if (selected.length >= MARKETING_REFERENCE_LIMIT) return selected;
      if (mediaType !== "marketing_brand_visual") break;
    }
  }

  return selected;
}

function getMarketingReferenceFingerprint(rows: MarketingReferenceRow[]) {
  return rows
    .map((row) => `${row.media_type}:${row.id}:${row.storage_path || ""}`)
    .join("|")
    .slice(0, 900);
}

async function resolveCurrentMarketingReferences(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  restaurantId: string,
  requestedMediaIds: string[],
) {
  if (!requestedMediaIds.length) {
    throw new HttpError(400, "marketing_reference_ids_required");
  }

  const { data, error } = await actor.adminClient
    .from("restaurant_media")
    .select("id, media_url, media_type, storage_bucket, storage_path, created_at")
    .eq("restaurant_id", restaurantId)
    .in("media_type", MARKETING_REFERENCE_MEDIA_TYPES)
    .in("id", requestedMediaIds)
    .order("created_at", { ascending: false });

  if (error) throw new HttpError(500, error.message);

  const rows = (data || [])
    .map((row: Record<string, unknown>) => toMarketingReferenceRow(row))
    .filter((row: MarketingReferenceRow | null): row is MarketingReferenceRow => Boolean(row))
    .filter((row: MarketingReferenceRow) => isCurrentMarketingStudioReference(row, restaurantId));
  const validIds = new Set(rows.map((row) => row.id));
  const missingIds = requestedMediaIds.filter((id) => !validIds.has(id));
  if (missingIds.length) {
    throw new HttpError(409, "marketing_reference_mismatch");
  }

  const selectedRows = selectMarketingReferenceRows(rows);

  if (!selectedRows.length) {
    throw new HttpError(400, "marketing_reference_required");
  }

  return {
    rows: selectedRows,
    urls: selectedRows.map((row) => row.media_url),
    ids: selectedRows.map((row) => row.id),
    mediaTypes: selectedRows.map((row) => row.media_type),
    fingerprint: getMarketingReferenceFingerprint(selectedRows),
  };
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
    "La consigne restaurateur ne peut jamais autoriser le remplacement du plat, du produit, des ingredients principaux ou du nombre d'elements visibles.",
  ].filter(Boolean).join("\n\n").slice(0, 3600);
}

function buildCompactPhotoStudioRetouchPrompt(input: { dishName: string }) {
  const dishLabel = input.dishName || "produit ou plat du restaurant";

  return [
    `${PHOTO_STUDIO_MASTER_PROMPT}. Sujet source: ${dishLabel}.`,
    "Conserve le produit d'origine: meme categorie alimentaire, memes ingredients visibles, meme nombre d'elements principaux, memes proportions generales et meme identite reconnaissable. L'angle peut etre ajuste seulement si le plat reste clairement le meme.",
    "Si le sujet est coupe, tronque, partiellement hors cadre ou sort de l'image, elargis le cadre ou ajuste l'angle de vue pour completer la partie manquante de facon realiste sans inventer un autre produit.",
    "Ne remplace jamais le plat source par une tartine, un toast, une salade, un bol, une pizza, un dessert ou une assiette differente.",
    "Nettoie la scene, supprime les elements parasites, simplifie l'arriere-plan, ameliore le support, applique un bel eclairage studio doux, corrige colorimetrie, contraste, volumes et nettete du sujet principal.",
    "Ajoute une profondeur de champ elegante seulement si elle garde tous les details importants du produit principal lisibles.",
    "Contraintes: ne change pas la nature du produit, ne change pas le nombre d'elements principaux, ne deforme pas les ingredients, conserve les logos ou etiquettes deja presents sur l'objet photographie, n'ajoute aucun nouveau texte, logo, badge, watermark ou element graphique.",
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

function normalizeOutputResolution(_raw: unknown): ImageOutputResolution {
  return "studio";
}

function getQualityForOutputResolution(_resolution: ImageOutputResolution): ImageQuality {
  return "medium";
}

function getOpenAIOutputCostUsd(_size: string, _quality: ImageQuality) {
  return GPT_IMAGE_2_MEDIUM_BASE_COST_USD;
}

function getImageOutputConfig(format: ReturnType<typeof normalizeFormat>, rawResolution: unknown, imageModel: TokImageModel) {
  const outputResolution = normalizeOutputResolution(rawResolution);
  const outputQuality = getQualityForOutputResolution(outputResolution);
  const imageModelCreditMultiplier = getImageModelCreditMultiplier(imageModel);
  const outputCostUsd = getOpenAIOutputCostUsd(format.size, outputQuality);
  const baseOutputCostChf = GPT_IMAGE_2_MEDIUM_BASE_COST_CHF;
  const outputCostChf = GPT_IMAGE_2_MEDIUM_BASE_COST_CHF;
  const creditUnits = Math.max(1, Math.ceil(outputCostChf / PHOTO_CREDIT_CHF));

  return {
    outputResolution,
    outputQuality,
    outputSize: format.size,
    imageModel,
    imageModelCreditMultiplier,
    outputCostUsd,
    baseOutputCostChf,
    outputCostChf,
    creditUnits,
  };
}

function clampVariantCount(raw: unknown) {
  const count = Math.floor(Number(raw || 1));
  if (!Number.isFinite(count)) return 1;
  return Math.min(2, Math.max(1, count));
}

type ImageUsage = {
  input_tokens?: number;
  input_text_tokens?: number;
  input_image_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

function estimateCostChf(_usage: ImageUsage = {}, imageCount = 0, _options?: Pick<ImageRequestOptions, "size" | "quality">) {
  return Number((GPT_IMAGE_2_MEDIUM_BASE_COST_CHF * Math.max(1, imageCount)).toFixed(6));
}

function creditUnitsFromEstimatedCost(estimatedCostChf: number) {
  if (!Number.isFinite(estimatedCostChf) || estimatedCostChf <= 0) return 1;
  return Math.max(1, Math.ceil(estimatedCostChf / PHOTO_CREDIT_CHF));
}

function getBillablePhotoCreditUnits(estimatedCostChf: number, outputCreditUnits: number) {
  const outputUnits = Number.isFinite(outputCreditUnits) ? Math.max(1, Math.ceil(outputCreditUnits)) : 1;
  return Math.max(outputUnits, creditUnitsFromEstimatedCost(estimatedCostChf));
}

function readUsageNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key] ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function extractImageUsage(data: unknown) {
  const usage = (data as Record<string, unknown>)?.usage;
  if (!usage || typeof usage !== "object") return {};

  const record = usage as Record<string, unknown>;
  const inputTokens = Number(record.input_tokens ?? 0);
  const outputTokens = Number(record.output_tokens ?? 0);
  const totalTokens = Number(record.total_tokens ?? inputTokens + outputTokens);
  const inputDetails =
    record.input_tokens_details && typeof record.input_tokens_details === "object"
      ? (record.input_tokens_details as Record<string, unknown>)
      : {};
  const inputImageTokens = readUsageNumber(inputDetails, ["image_tokens", "image_input_tokens", "images"]);
  const inputTextTokens = readUsageNumber(inputDetails, ["text_tokens", "text_input_tokens", "text"]);

  return {
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    input_text_tokens: inputTextTokens,
    input_image_tokens: inputImageTokens,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
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

function buildMarketingVisualResult(input: {
  userPrompt: string;
  format: string;
  referenceImageCount: number;
}): ImageEnhanceResult {
  const enhancedPrompt = [
    input.userPrompt,
    "",
    "Objectif: générer un visuel marketing final pour le restaurateur, pas un brief.",
    "Utiliser exclusivement les visuels de référence fournis dans cette requête comme source d'identité visuelle: logo, palette, typographies, textures, style photo, composition, formes, badges, icônes, hiérarchie et ton commercial.",
    "Ne jamais appliquer l'identité visuelle de la plateforme par défaut, ne jamais ajouter sa mascotte, son logo, son URL, sa palette ou ses messages si le prompt courant et les références actives ne le demandent pas explicitement.",
    "Ignorer toute identité, tout asset, tout prompt ou toute préférence provenant d'une génération précédente. Les références actives de cette requête remplacent complètement les anciennes.",
    "Le nom du compte restaurant n'est pas une reference visuelle et ne doit jamais servir a inventer une marque, un logo ou une typographie.",
    "Si aucun nom, logo ou personnage n'est clairement visible dans les references actives ou explicitement demande dans le brief courant, generer une mise en page sans marque inventee.",
    `Format demandé: ${input.format}. Références visuelles actives: ${input.referenceImageCount}.`,
    "Contraintes: respecter la marque visible dans les fichiers actifs, ne pas inventer d'autre marque, ne pas ajouter de coordonnées privées, ne pas créer de faux label officiel, garder le texte demandé lisible.",
  ].join("\n").slice(0, 4200);

  return {
    title: "Image marketing restaurant",
    enhanced_prompt: enhancedPrompt,
    edit_instructions: "",
    alt_text: "Visuel marketing restaurant généré par IA",
    publication_caption: "",
    checklist: [],
    style_tags: ["marketing", "campaign", input.format],
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

function isImageTimeoutError(error: unknown) {
  return error instanceof HttpError && (
    error.message === "image_edit_timeout" ||
    error.message === "image_generation_timeout" ||
    error.message === "image_url_timeout"
  );
}

function shouldRetryImageGeneration(error: unknown) {
  if (isImageTimeoutError(error)) return true;
  if (!(error instanceof HttpError)) return false;
  if (!error.message.startsWith("image_generation_failed:")) return false;

  const message = error.message.toLowerCase();
  return ![
    "content_policy",
    "safety",
    "rate",
    "credits",
    ":401:",
    ":403:",
    "api key",
    "invalid_value",
    "unsupported_parameter",
    "model",
  ].some((blockedReason) => message.includes(blockedReason));
}

async function callOpenAIImageGenerationWithRetry(prompt: string, n: number, options: ImageRequestOptions): Promise<ImageOperationResult> {
  try {
    return {
      response: await callOpenAIImageGeneration(prompt, n, options),
      options,
      retryUsed: false,
      fallbackUsed: false,
      fallbackReason: null,
    };
  } catch (error) {
    if (!shouldRetryImageGeneration(error)) throw error;

    const retryOptions = buildFallbackImageRequestOptions(options);
    console.warn(`[${FUNCTION_NAME}] image_generation_retry`, {
      reason: error instanceof Error ? error.message : "unknown",
      model: retryOptions.model,
      quality: retryOptions.quality,
      size: retryOptions.size,
      mode: retryOptions.mode,
    });

    return {
      response: await callOpenAIImageGeneration(prompt, n, retryOptions),
      options: retryOptions,
      retryUsed: true,
      fallbackUsed: options.quality !== retryOptions.quality,
      fallbackReason: error instanceof Error ? error.message : "image_generation_retry",
    };
  }
}

async function callOpenAIImageEdit(prompt: string, sourceImageUrl: string, n: number, options: ImageRequestOptions) {
  return await callOpenAIImageEditWithReferences(prompt, [sourceImageUrl], n, options);
}

async function callOpenAIImageEditWithReferences(prompt: string, imageUrls: string[], n: number, options: ImageRequestOptions) {
  if (!imageUrls.length) throw new HttpError(400, "reference_image_required");
  const sourceBlobs = await Promise.all(imageUrls.map((url) => fetchImageBlob(url)));
  const form = new FormData();
  form.append("model", options.model);
  form.append("prompt", prompt);
  form.append("size", options.size);
  form.append("n", String(n));
  form.append("quality", options.quality);
  form.append("output_format", "png");
  form.append("moderation", "auto");
  sourceBlobs.forEach((sourceBlob, index) => {
    form.append("image[]", sourceBlob, `reference-${index + 1}-${getSourceImageFileName(sourceBlob.type)}`);
  });

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
  if (isImageTimeoutError(error)) return true;
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

function normalizeBlockedSourceImageEditFailure(error: unknown) {
  if (isImageTimeoutError(error)) return new HttpError(503, "image_edit_timeout");
  if (!(error instanceof HttpError)) return new HttpError(502, "image_edit_transient_failure");

  const message = error.message.toLowerCase();
  if (message.startsWith("image_edit_failed:5") || message.includes("server_error") || message.includes("temporar")) {
    return new HttpError(502, "image_edit_transient_failure");
  }
  if (message.includes("rate")) return new HttpError(429, "ai_rate_limited");
  if (message.includes("credits")) return new HttpError(402, "ai_credits_exhausted");

  return new HttpError(502, "source_image_edit_required");
}

async function callOpenAIImageEditWithRetry(input: {
  primaryPrompt: string;
  retryPrompt: string;
  sourceImageUrl: string;
  n: number;
  options: ImageRequestOptions;
  allowGenerationFallback: boolean;
  fallbackPrompt?: string;
}): Promise<ImageOperationResult> {
  try {
    return {
      response: await callOpenAIImageEdit(input.primaryPrompt, input.sourceImageUrl, input.n, input.options),
      options: input.options,
      retryUsed: false,
      fallbackUsed: false,
      fallbackReason: null,
    };
  } catch (error) {
    if (!shouldRetryImageEdit(error)) throw error;

    const retryOptions = buildFallbackImageRequestOptions(input.options);
    console.warn(`[${FUNCTION_NAME}] image_edit_retry`, {
      reason: error instanceof Error ? error.message : "unknown",
      model: retryOptions.model,
      quality: retryOptions.quality,
      size: retryOptions.size,
      mode: retryOptions.mode,
    });

    if (isImageTimeoutError(error) && input.allowGenerationFallback) {
      console.warn(`[${FUNCTION_NAME}] image_edit_fallback`, {
        reason: error instanceof Error ? error.message : "unknown",
        model: retryOptions.model,
        quality: retryOptions.quality,
        size: retryOptions.size,
        mode: retryOptions.mode,
      });

      return {
        response: await callOpenAIImageGeneration(input.fallbackPrompt || input.retryPrompt, input.n, retryOptions),
        options: retryOptions,
        retryUsed: true,
        fallbackUsed: true,
        fallbackReason: error instanceof Error ? error.message : "image_edit_timeout",
      };
    }

    try {
      return {
        response: await callOpenAIImageEdit(input.retryPrompt, input.sourceImageUrl, input.n, retryOptions),
        options: retryOptions,
        retryUsed: true,
        fallbackUsed: input.options.quality !== retryOptions.quality,
        fallbackReason: error instanceof Error ? error.message : "image_edit_retry",
      };
    } catch (retryError) {
      if (!shouldRetryImageGeneration(retryError) && !shouldRetryImageEdit(retryError)) throw retryError;
      if (!input.allowGenerationFallback) {
        console.warn(`[${FUNCTION_NAME}] source_image_edit_fallback_blocked`, {
          reason: retryError instanceof Error ? retryError.message : "unknown",
          model: retryOptions.model,
          quality: retryOptions.quality,
          size: retryOptions.size,
          mode: retryOptions.mode,
        });
        throw normalizeBlockedSourceImageEditFailure(retryError);
      }

      console.warn(`[${FUNCTION_NAME}] image_edit_fallback`, {
        reason: retryError instanceof Error ? retryError.message : "unknown",
        model: retryOptions.model,
        quality: retryOptions.quality,
        size: retryOptions.size,
        mode: retryOptions.mode,
      });

      return {
        response: await callOpenAIImageGeneration(input.fallbackPrompt || input.retryPrompt, input.n, retryOptions),
        options: retryOptions,
        retryUsed: true,
        fallbackUsed: true,
        fallbackReason: retryError instanceof Error ? retryError.message : "image_edit_fallback",
      };
    }
  }
}

async function callOpenAIImageEditWithReferencesAndRecovery(input: {
  prompt: string;
  imageUrls: string[];
  n: number;
  options: ImageRequestOptions;
  fallbackPrompt: string;
  allowGenerationFallback: boolean;
}): Promise<ImageOperationResult> {
  try {
    return {
      response: await callOpenAIImageEditWithReferences(input.prompt, input.imageUrls, input.n, input.options),
      options: input.options,
      retryUsed: false,
      fallbackUsed: false,
      fallbackReason: null,
    };
  } catch (error) {
    if (!shouldRetryImageEdit(error)) throw error;

    const retryOptions = buildFallbackImageRequestOptions(input.options);
    console.warn(`[${FUNCTION_NAME}] image_reference_edit_retry`, {
      reason: error instanceof Error ? error.message : "unknown",
      model: retryOptions.model,
      quality: retryOptions.quality,
      size: retryOptions.size,
      mode: retryOptions.mode,
      referenceCount: input.imageUrls.length,
    });

    if (isImageTimeoutError(error) && input.allowGenerationFallback) {
      console.warn(`[${FUNCTION_NAME}] image_edit_fallback`, {
        reason: error instanceof Error ? error.message : "unknown",
        model: retryOptions.model,
        quality: retryOptions.quality,
        size: retryOptions.size,
        mode: retryOptions.mode,
        referenceCount: input.imageUrls.length,
      });

      return {
        response: await callOpenAIImageGeneration(input.fallbackPrompt, input.n, retryOptions),
        options: retryOptions,
        retryUsed: true,
        fallbackUsed: true,
        fallbackReason: error instanceof Error ? error.message : "image_reference_edit_timeout",
      };
    }

    try {
      return {
        response: await callOpenAIImageEditWithReferences(input.prompt, input.imageUrls, input.n, retryOptions),
        options: retryOptions,
        retryUsed: true,
        fallbackUsed: input.options.quality !== retryOptions.quality,
        fallbackReason: error instanceof Error ? error.message : "image_reference_edit_retry",
      };
    } catch (retryError) {
      if (!shouldRetryImageGeneration(retryError) && !shouldRetryImageEdit(retryError)) throw retryError;

      console.warn(`[${FUNCTION_NAME}] image_edit_fallback`, {
        reason: retryError instanceof Error ? retryError.message : "unknown",
        model: retryOptions.model,
        quality: retryOptions.quality,
        size: retryOptions.size,
        mode: retryOptions.mode,
        referenceCount: input.imageUrls.length,
      });

      if (!input.allowGenerationFallback) throw new HttpError(502, "image_reference_edit_required");

      return {
        response: await callOpenAIImageGeneration(input.fallbackPrompt, input.n, retryOptions),
        options: retryOptions,
        retryUsed: true,
        fallbackUsed: true,
        fallbackReason: retryError instanceof Error ? retryError.message : "image_reference_edit_fallback",
      };
    }
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
    usage?: ImageUsage;
    imageCount?: number;
    costOptions?: Pick<ImageRequestOptions, "size" | "quality">;
    estimatedCostChf?: number;
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
    estimated_cost_chf: payload.estimatedCostChf ?? estimateCostChf(payload.usage, payload.imageCount || 0, payload.costOptions),
    metadata: payload.metadata || {},
  });
}

function readTokCreditBalance(usage: unknown) {
  const credits = typeof usage === "object" && usage !== null && Array.isArray((usage as { credits?: unknown }).credits)
    ? (usage as { credits: Array<Record<string, unknown>> }).credits
    : [];
  const tokCredit = credits.find((credit) => credit?.kind === "tok_credits");
  const balance = Number(tokCredit?.balance ?? 0);

  return Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
}

async function requireTokCreditBalance(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  restaurantId: string,
  requiredCredits: number,
) {
  const required = Math.max(1, Math.ceil(requiredCredits));
  const { data, error } = await actor.adminClient.rpc("get_restaurant_credit_usage", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw new HttpError(500, error.message);

  const balance = readTokCreditBalance(data);
  if (balance < required) {
    throw new HttpError(402, "ai_credits_exhausted");
  }

  return balance;
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
    const assetType = normalizeAssetType(body.assetType);
    const marketingAssetMode = assetType === "campaign_visual" && body.marketingAssetMode === true;
    const rawPrompt = sanitizeText(body.prompt || body.objective || PREMIUM_SOURCE_IMAGE_EDIT_PROMPT);
    const prompt = marketingAssetMode
      ? rawPrompt
      : stripPlatformBrandTerms(stripBrandOverlayInstructions(rawPrompt));
    const dishName = sanitizeText(body.dishName, 120);
    const sourceImageUrl = sanitizeUrl(body.sourceImageUrl);
    const requestedReferenceImageUrls = normalizeReferenceImageUrls(body.referenceImageUrls)
      .filter((url) => url !== sourceImageUrl);
    const requestedReferenceMediaIds = normalizeReferenceMediaIds(body.referenceMediaIds);
    const format = normalizeFormat(body.format);
    const imageModel = normalizeImageModel(body.imageModel ?? body.model);
    const imageModelCreditMultiplier = getImageModelCreditMultiplier(imageModel);
    const outputConfig = getImageOutputConfig(format, body.outputResolution, imageModel);
    const variantCount = clampVariantCount(body.variantCount);
    const billableImageCount = Math.max(1, variantCount);
    const requestedOutputCreditUnits = outputConfig.creditUnits * billableImageCount;
    const generateImage = body.generateImage !== false;
    const imageOnly = true;

    if (!restaurantId) throw new HttpError(400, "restaurant_required");
    if (!generateImage) throw new HttpError(400, "image_generation_required");
    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const marketingReferences = marketingAssetMode
      ? await resolveCurrentMarketingReferences(actor, restaurantId, requestedReferenceMediaIds)
      : null;
    const referenceImageUrls = marketingReferences?.urls || requestedReferenceImageUrls;

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 60, windowSeconds: 600 });
    await rl.consume("global", { maxRequests: 180, windowSeconds: 60 });
    const availableTokCredits = await requireTokCreditBalance(actor, restaurantId, requestedOutputCreditUnits);

    const sourceEditPrompt = sourceImageUrl
      ? buildPhotoStudioRetouchPrompt({ dishName, userPrompt: prompt })
      : "";
    const compactSourceEditPrompt = sourceImageUrl
      ? buildCompactPhotoStudioRetouchPrompt({ dishName })
      : "";

    const result = marketingAssetMode
      ? buildMarketingVisualResult({
        userPrompt: prompt,
        format: format.label,
        referenceImageCount: referenceImageUrls.length + (sourceImageUrl ? 1 : 0),
      })
      : buildImageOnlyResult({
        restaurantName: restaurant.name || "Restaurant",
        dishName,
        userPrompt: prompt,
        format: format.label,
        sourceImagePresent: Boolean(sourceImageUrl),
        sourceEditPrompt,
      });
    const briefSource = marketingAssetMode ? "marketing_image_only" : "image_only";

    let generated: GeneratedImage | null = null;
    const generatedImageOptions = marketingAssetMode
      ? buildMarketingImageRequestOptions(format.size, referenceImageUrls.length > 0, outputConfig.outputQuality, imageModel)
      : buildImageRequestOptions(format.size, Boolean(sourceImageUrl), outputConfig.outputQuality, imageModel);
    let usedImageOptions: ImageRequestOptions | null = null;
    let imageEditRetryUsed = false;
    let imageFallbackUsed = false;
    let imageFallbackReason: string | null = null;
    let sourceEditUsed = false;
    const generationFallbackAllowed = !sourceImageUrl && !(marketingAssetMode && referenceImageUrls.length);
    const imageOptions = generatedImageOptions;
    const finalPrompt = marketingAssetMode
      ? [
        result.enhanced_prompt,
        "",
        "Instructions finales de composition:",
        "- Produire une image finale complète au format affiche, pas des variantes de logo isolé.",
        "- S'inspirer uniquement des références actives envoyées dans cette requête sans copier les captures d'écran brutes.",
        "- Les références actives remplacent toute identité ou tout prompt d'une génération précédente.",
        "- Ne pas deduire une marque depuis le nom du compte restaurant; seules les images jointes et le brief courant font autorite.",
        "- Ne pas inventer de logo, de nom de marque, de chef, de personnage, de plat ou de mascotte absent des references actives et du brief courant.",
        "- Le texte principal doit être très grand, contrasté et lisible.",
        "- Le rendu doit ressembler à une publicité professionnelle terminée pour la marque du restaurateur, prête pour validation.",
        "- Ne pas utiliser l'identité visuelle de la plateforme sauf si les références actives fournies par le restaurateur sont elles-mêmes des visuels de cette plateforme.",
      ].join("\n").slice(0, 7000)
      : sourceImageUrl
      ? [
        sourceEditPrompt || PREMIUM_SOURCE_IMAGE_EDIT_PROMPT,
        "",
        "Contraintes finales non negociables:",
        TOK_PHOTO_DNA,
        "Rendu attendu: avant/apres fidele. Meme sujet reconnaissable immediatement, mais plus net, nettoye de tous les parasites, eclaire comme un studio photo, avec formes mieux valorisees, textures plus appetissantes, profondeur de champ douce et joli flou d'arriere-plan quand cela sert le produit.",
        "Interdiction explicite: ne pas ajouter de nouveau logo, texte de marque, bulle de marque, badge, filigrane ou watermark. Si un logo, une etiquette, un texte de marque ou un packaging existe deja physiquement dans l'image source, il doit etre conserve et rester reconnaissable. Seuls les filigranes, badges ou marques superposes qui ne font pas partie de l'objet photographie peuvent etre retires.",
      ].join("\n").slice(0, 7000)
      : [
        result.enhanced_prompt,
        "",
        "Contraintes finales non negociables:",
        TOK_PHOTO_DNA,
        "Image finale de studio non brandee: sujet net, fond propre, eclairage softbox premium, formes valorisees, profondeur de champ douce, joli flou d'arriere-plan, sans texte incruste, sans logo, sans texte de marque, sans filigrane, sans watermark, sans badge, sans bulle de marque et sans mascotte. Les elements de marque seront ajoutes hors image par l'interface comme calque transparent separe, jamais par le modele image.",
      ].join("\n").slice(0, 7000);

    let imageResponse: unknown;
    if (marketingAssetMode && referenceImageUrls.length) {
      const editResult = await callOpenAIImageEditWithReferencesAndRecovery({
        prompt: finalPrompt,
        imageUrls: referenceImageUrls,
        n: variantCount,
        options: imageOptions,
        fallbackPrompt: [
          result.enhanced_prompt,
          "",
          "Retouche source indisponible apres retry: creer un visuel marketing final coherent avec le brief courant, sans inventer de nouvelle marque et sans reprendre d'anciens assets.",
        ].join("\n").slice(0, 4200),
        allowGenerationFallback: false,
      });
      imageResponse = editResult.response;
      usedImageOptions = editResult.options;
      imageEditRetryUsed = editResult.retryUsed;
      imageFallbackUsed = editResult.fallbackUsed;
      imageFallbackReason = editResult.fallbackReason;
    } else if (sourceImageUrl) {
      const editResult = await callOpenAIImageEditWithRetry({
        primaryPrompt: finalPrompt,
        retryPrompt: [
          compactSourceEditPrompt,
          "",
          "Garde la retouche fidele a la photo source. Ne remplace pas le plat, le produit, la categorie alimentaire, les ingredients principaux ni le nombre d'elements visibles.",
        ].join("\n").slice(0, 2200),
        sourceImageUrl,
        n: variantCount,
        options: imageOptions,
        allowGenerationFallback: false,
      });
      imageResponse = editResult.response;
      usedImageOptions = editResult.options;
      imageEditRetryUsed = editResult.retryUsed;
      imageFallbackUsed = editResult.fallbackUsed;
      imageFallbackReason = editResult.fallbackReason;
      sourceEditUsed = true;
    } else {
      const generationResult = await callOpenAIImageGenerationWithRetry(finalPrompt, variantCount, imageOptions);
      imageResponse = generationResult.response;
      usedImageOptions = generationResult.options;
      imageFallbackUsed = generationResult.fallbackUsed;
      imageFallbackReason = generationResult.fallbackReason;
    }

    const imageUsage = extractImageUsage(imageResponse);
    const imageBytes = await extractGeneratedImageBytes(imageResponse);
    const stored = await storeGeneratedImage(actor, restaurantId, imageBytes);
    usedImageOptions = usedImageOptions || imageOptions;
    const actualOutputCostUsd = getOpenAIOutputCostUsd(usedImageOptions.size, usedImageOptions.quality);
    const baseActualOutputCostChf = actualOutputCostUsd * USD_TO_CHF_RATE;
    const actualOutputCostChf = baseActualOutputCostChf * imageModelCreditMultiplier;
    const actualCreditUnits = Math.max(1, Math.ceil(actualOutputCostChf / PHOTO_CREDIT_CHF));
    const photoCreditUnits = actualCreditUnits * Math.max(1, variantCount);
    const baseEstimatedImageCostChf = estimateCostChf(
      imageUsage,
      billableImageCount,
      usedImageOptions ? { size: usedImageOptions.size, quality: usedImageOptions.quality } : undefined,
    );
    const estimatedImageCostChf = Number((baseEstimatedImageCostChf * imageModelCreditMultiplier).toFixed(6));
    const estimatedCostCreditUnits = creditUnitsFromEstimatedCost(estimatedImageCostChf);
    const billablePhotoCreditUnits = Math.max(
      requestedOutputCreditUnits,
      getBillablePhotoCreditUnits(estimatedImageCostChf, photoCreditUnits),
    );
    const billingCreditSource = billablePhotoCreditUnits > Math.max(photoCreditUnits, estimatedCostCreditUnits)
      ? "requested_output_resolution"
      : billablePhotoCreditUnits > photoCreditUnits
      ? "estimated_total_cost"
      : "output_resolution";

    const persistedAssetId = await insertGeneratedAsset(actor, {
      restaurant_id: restaurantId,
      user_id: actor.userId,
      source_image_url: sourceImageUrl || null,
      asset_url: stored.galleryImageUrl,
      storage_bucket: IMAGE_BUCKET,
      storage_path: stored.path,
      asset_type: assetType,
      model: usedImageOptions.model,
      prompt: result.enhanced_prompt,
      title: result.title,
      status: "stored",
      metadata: {
        image_quality: usedImageOptions.quality,
        image_model_credit_multiplier: imageModelCreditMultiplier,
        output_resolution: outputConfig.outputResolution,
        requested_output_quality: outputConfig.outputQuality,
        requested_output_credit_units: requestedOutputCreditUnits,
        output_credit_units: photoCreditUnits,
        estimated_cost_credit_units: estimatedCostCreditUnits,
        billable_credit_units: billablePhotoCreditUnits,
        billing_credit_source: billingCreditSource,
        preflight_available_tok_credits: availableTokCredits,
        estimated_openai_output_cost_usd: actualOutputCostUsd,
        estimated_openai_base_output_cost_chf: baseActualOutputCostChf,
        estimated_openai_output_cost_chf: actualOutputCostChf,
        estimated_openai_base_cost_chf: baseEstimatedImageCostChf,
        estimated_openai_cost_chf: estimatedImageCostChf,
        requested_image_model: imageModel,
        request_image_model: usedImageOptions.model,
        request_image_quality: usedImageOptions.quality,
        request_image_size: usedImageOptions.size,
        image_mode: usedImageOptions.mode,
        source_edit_used: sourceEditUsed,
        image_edit_retry: imageEditRetryUsed,
        image_fallback_used: imageFallbackUsed,
        image_fallback_reason: imageFallbackReason,
        brand_overlay_positioning: "frontend_transparent_layer",
        brand_overlay_size: "180x180",
        generation_fallback_allowed: generationFallbackAllowed,
        output_format: "png",
        brief_source: briefSource,
        preview_image_url: stored.imageUrl,
        gallery_image_url: stored.galleryImageUrl,
        gallery_storage_bucket: GALLERY_BUCKET,
        gallery_storage_path: stored.galleryPath,
        marketing_asset_mode: marketingAssetMode,
        reference_image_urls: referenceImageUrls,
        reference_image_count: referenceImageUrls.length,
        requested_reference_image_count: requestedReferenceImageUrls.length,
        reference_source: marketingAssetMode ? "server_current_restaurant_media" : "request_payload",
        requested_reference_media_ids: requestedReferenceMediaIds,
        reference_media_ids: marketingReferences?.ids || [],
        reference_media_types: marketingReferences?.mediaTypes || [],
        reference_fingerprint: marketingReferences?.fingerprint || null,
        reference_identity_scope: marketingAssetMode ? "current_uploaded_restaurant_resources" : "source_or_tok_photo_studio",
        original_prompt: prompt,
        dish_name: dishName,
        format: format.label,
        source_preservation_policy: sourceImageUrl
          ? "strict_source_edit_without_generation_fallback"
          : "generation_without_source",
        reference_folder: marketingAssetMode ? null : `public${TOK_REFERENCE_FOLDER}`,
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
      model: usedImageOptions.model,
    };

    await insertUsage(actor, {
      status: "success",
      restaurantId,
      assetId,
      model: usedImageOptions?.model,
      usage: imageUsage,
      imageCount: generated ? variantCount : 0,
      costOptions: usedImageOptions ? { size: usedImageOptions.size, quality: usedImageOptions.quality } : undefined,
      estimatedCostChf: estimatedImageCostChf,
      metadata: {
        credit_kind: "photo_retouch",
        credit_units: billablePhotoCreditUnits,
        credit_units_per_image: actualCreditUnits,
        image_model_credit_multiplier: imageModelCreditMultiplier,
        requested_output_credit_units: requestedOutputCreditUnits,
        output_credit_units: photoCreditUnits,
        estimated_cost_credit_units: estimatedCostCreditUnits,
        billing_credit_source: billingCreditSource,
        preflight_available_tok_credits: availableTokCredits,
        output_resolution: outputConfig.outputResolution,
        output_size: usedImageOptions.size,
        output_quality: usedImageOptions.quality,
        requested_output_quality: outputConfig.outputQuality,
        estimated_openai_output_cost_usd: actualOutputCostUsd,
        estimated_openai_base_output_cost_chf: baseActualOutputCostChf,
        estimated_openai_output_cost_chf: actualOutputCostChf,
        estimated_openai_base_cost_chf: baseEstimatedImageCostChf,
        photo_credit_chf: PHOTO_CREDIT_CHF,
        usd_to_chf_rate: USD_TO_CHF_RATE,
        asset_type: assetType,
        has_source_image: Boolean(sourceImageUrl),
        generated_image: Boolean(generated),
        image_only: imageOnly,
        brief_source: briefSource,
        image_timeout_ms: usedImageOptions?.timeoutMs,
        requested_image_model: imageModel,
        image_model: usedImageOptions?.model,
        image_quality: usedImageOptions?.quality,
        image_size: usedImageOptions?.size,
        image_mode: usedImageOptions?.mode,
        marketing_asset_mode: marketingAssetMode,
        reference_image_count: referenceImageUrls.length,
        requested_reference_image_count: requestedReferenceImageUrls.length,
        reference_source: marketingAssetMode ? "server_current_restaurant_media" : "request_payload",
        requested_reference_media_ids: requestedReferenceMediaIds,
        reference_media_ids: marketingReferences?.ids || [],
        reference_media_types: marketingReferences?.mediaTypes || [],
        reference_fingerprint: marketingReferences?.fingerprint || null,
        source_edit_used: sourceEditUsed,
        image_edit_retry: imageEditRetryUsed,
        image_fallback_used: imageFallbackUsed,
        image_fallback_reason: imageFallbackReason,
        brand_overlay_positioning: "frontend_transparent_layer",
        brand_overlay_size: "180x180",
        generation_fallback_allowed: generationFallbackAllowed,
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
        requested_image_model: imageModel,
        image_model_credit_multiplier: imageModelCreditMultiplier,
        image_quality: usedImageOptions?.quality,
        image_size: usedImageOptions?.size,
        output_resolution: outputConfig.outputResolution,
        credit_units: billablePhotoCreditUnits,
        estimated_openai_output_cost_usd: actualOutputCostUsd,
        estimated_openai_base_output_cost_chf: baseActualOutputCostChf,
        estimated_openai_output_cost_chf: actualOutputCostChf,
        image_mode: usedImageOptions?.mode,
        brief_source: briefSource,
        image_only: imageOnly,
        marketing_asset_mode: marketingAssetMode,
        reference_image_count: referenceImageUrls.length,
        requested_reference_image_count: requestedReferenceImageUrls.length,
        reference_source: marketingAssetMode ? "server_current_restaurant_media" : "request_payload",
        requested_reference_media_ids: requestedReferenceMediaIds,
        reference_media_ids: marketingReferences?.ids || [],
        reference_media_types: marketingReferences?.mediaTypes || [],
        reference_fingerprint: marketingReferences?.fingerprint || null,
        source_edit_used: sourceEditUsed,
        image_edit_retry: imageEditRetryUsed,
        image_fallback_used: imageFallbackUsed,
        image_fallback_reason: imageFallbackReason,
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
      output_resolution: outputConfig.outputResolution,
      output_size: usedImageOptions?.size || outputConfig.outputSize,
      output_quality: usedImageOptions?.quality || outputConfig.outputQuality,
      credit_units: billablePhotoCreditUnits,
      estimated_cost_chf: estimatedImageCostChf,
      image_mode: usedImageOptions?.mode,
      brand_overlay_positioning: "frontend_transparent_layer",
      brand_overlay_size: "180x180",
      reference_folder: marketingAssetMode ? null : `public${TOK_REFERENCE_FOLDER}`,
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
