import type {
  TokImageGenerationRequest,
  TokImageGenerationResult,
  TokAiMessage,
} from "@/lib/ai/tokAiClient";
import { COMMERCIAL_DEMO_SUPABASE_URL } from "@/integrations/supabase/demoClient";
import {
  invokeCommercialDemoFunction,
  invokeCommercialDemoRpc,
} from "@/lib/commercialDemoProject";
const COMMERCIAL_DEMO_AI_FUNCTION = "commercial-demo-ai";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REFERENCE_IMAGES = 3;
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REFERENCE_DATA_URL_LENGTH = Math.ceil(MAX_REFERENCE_IMAGE_BYTES * 4 / 3) + 256;
const MAX_OUTPUT_IMAGE_BYTES = 12 * 1024 * 1024;
const REFERENCE_IMAGE_TIMEOUT_MS = 12_000;
const EDGE_REQUEST_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 350;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type CommercialDemoAiTool = "assistant" | "support_chat";
export type CommercialDemoAiSurface = "client" | "restaurant" | "courier";

export type CommercialDemoAiRuntime = {
  sessionId: string;
  surface: CommercialDemoAiSurface;
};

export type CommercialDemoAiConversation = {
  id: string;
  tool: CommercialDemoAiTool | "marketing_studio" | "photo_studio";
  surface: CommercialDemoAiSurface;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

type CommercialDemoAiResponse = {
  conversation_id: string;
  reply: string;
  tool: CommercialDemoAiTool;
  model: string;
  credit_units: 0;
  estimated_cost_chf: number;
  created_at: string;
  replayed?: boolean;
};

type CommercialDemoVisualResponse = {
  generation_id: string;
  tool?: "marketing_studio" | "photo_studio" | "advisor_visual";
  prompt?: string;
  output_url: string;
  output_mime_type: string;
  model: string;
  format: "landscape" | "square" | "portrait";
  width: number;
  height: number;
  credit_units: 0;
  estimated_cost_chf: number;
  alt_text: string;
  style?: string | null;
  created_at: string;
  replayed?: boolean;
};

type CommercialDemoVisualHistoryResponse = {
  generations: CommercialDemoVisualResponse[];
};

export type CommercialDemoVisualHistoryTool = "marketing_studio" | "photo_studio" | "advisor_visual";
export type CommercialDemoVisualHistoryItem = TokImageGenerationResult & {
  created_at: string;
  prompt: string;
  tool: CommercialDemoVisualHistoryTool;
  style: string | null;
};

const inFlightRequests = new Map<string, Promise<unknown>>();

function isSurface(value: string | undefined): value is CommercialDemoAiSurface {
  return value === "client" || value === "restaurant" || value === "courier";
}

function assertResponseData<T>(value: unknown, label: string): T {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} n'a pas retourné de résultat exploitable.`);
  }
  return value as T;
}

function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Ce navigateur ne peut pas sécuriser la requête IA. Rechargez la page dans un navigateur récent.");
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function runSingleInFlight<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = operation().finally(() => {
    if (inFlightRequests.get(key) === pending) inFlightRequests.delete(key);
  });
  // Deliberately synchronous: a double click in the same render turn reuses the
  // same promise and, therefore, the same server idempotency key.
  inFlightRequests.set(key, pending);
  return pending;
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  const candidate = error as { status?: unknown; context?: { status?: unknown } };
  const status = Number(candidate.status || candidate.context?.status || 0);
  return Number.isFinite(status) ? status : 0;
}

function shouldRetry(error: unknown) {
  const status = getErrorStatus(error);
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return true;
  if (status >= 400) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return /fetch|network|timeout|timed out|temporar|connection/.test(message);
}

async function invokeCommercialDemoAi<T>(body: Record<string, unknown>, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const data = await invokeCommercialDemoFunction<T>(
        COMMERCIAL_DEMO_AI_FUNCTION,
        body,
        { timeout: EDGE_REQUEST_TIMEOUT_MS },
      );
      return assertResponseData<T>(data, label);
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !shouldRetry(error)) break;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} est momentanément indisponible.`);
}

function normalizeImageMimeType(value: string) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function getBase64ByteLength(payload: string) {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

function normalizeImageDataUrl(value: string, maxBytes = MAX_REFERENCE_IMAGE_BYTES) {
  const maxDataUrlLength = maxBytes === MAX_REFERENCE_IMAGE_BYTES
    ? MAX_REFERENCE_DATA_URL_LENGTH
    : Math.ceil(maxBytes * 4 / 3) + 256;
  if (value.length > maxDataUrlLength) {
    throw new Error(`Une image dépasse la limite de ${Math.round(maxBytes / 1024 / 1024)} Mo.`);
  }
  const match = value.match(/^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("Le format d'une image de référence n'est pas pris en charge.");
  const mimeType = normalizeImageMimeType(match[1]);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Les références doivent être des images JPEG, PNG ou WebP.");
  }
  if (getBase64ByteLength(match[2]) > maxBytes) {
    throw new Error(`Une image dépasse la limite de ${Math.round(maxBytes / 1024 / 1024)} Mo.`);
  }
  return `data:${mimeType};base64,${match[2]}`;
}

function blobToDataUrl(blob: Blob, mimeType: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire une image de référence."));
    reader.onload = () => {
      try {
        resolve(normalizeImageDataUrl(String(reader.result || "")));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsDataURL(new Blob([blob], { type: mimeType }));
  });
}

async function referenceUrlToDataUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (trimmed.startsWith("data:")) return normalizeImageDataUrl(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(trimmed, typeof window === "undefined" ? undefined : window.location.href);
  } catch {
    throw new Error("Une image de référence utilise une adresse invalide.");
  }
  let configuredSupabaseOrigin = "";
  try {
    configuredSupabaseOrigin = new URL(String(import.meta.env.VITE_SUPABASE_URL || "")).origin;
  } catch {
    configuredSupabaseOrigin = "";
  }
  const currentOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const dedicatedDemoOrigin = new URL(COMMERCIAL_DEMO_SUPABASE_URL).origin;
  const isTrustedRemote = parsed.protocol === "https:"
    && (
      parsed.origin === currentOrigin
      || parsed.origin === dedicatedDemoOrigin
      || (configuredSupabaseOrigin !== "" && parsed.origin === configuredSupabaseOrigin)
    );
  if (parsed.protocol !== "blob:" && !isTrustedRemote) {
    throw new Error("Une image de référence utilise un protocole non autorisé.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFERENCE_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.href, {
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Impossible de charger une image de référence (${response.status}).`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error("Une image de référence dépasse la limite de 4 Mo.");
    }
    const blob = await response.blob();
    if (blob.size > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error("Une image de référence dépasse la limite de 4 Mo.");
    }
    const mimeType = normalizeImageMimeType(blob.type || response.headers.get("content-type") || "");
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error("Les références doivent être des images JPEG, PNG ou WebP.");
    }
    return await blobToDataUrl(blob, mimeType);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Le chargement d'une image de référence a expiré.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildReferenceImages(request: TokImageGenerationRequest) {
  const candidates = [request.sourceImageUrl, ...(request.referenceImageUrls || [])]
    .filter((value): value is string => (
      typeof value === "string"
      && value.trim().length > 0
      // The legacy in-memory demo resources are SVG placeholders. They remain
      // useful for palette extraction but are not valid OpenAI edit inputs.
      && !value.trim().toLowerCase().startsWith("data:image/svg+xml")
    ));
  const uniqueCandidates = Array.from(new Set(candidates)).slice(0, MAX_REFERENCE_IMAGES);
  return Promise.all(uniqueCandidates.map(referenceUrlToDataUrl));
}

function getCommercialDemoVisualTool(request: TokImageGenerationRequest): CommercialDemoVisualHistoryTool {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname.toLowerCase();
  if (pathname.includes("/advisor")) return "advisor_visual";
  if (
    request.marketingAssetMode
    || request.assetType === "campaign_visual"
    || request.assetType === "banner"
    || pathname.includes("/campagnes")
    || pathname.includes("/reseaux-sociaux")
  ) {
    return "marketing_studio";
  }
  return "photo_studio";
}

function assertVisualOutputUrl(value: string, mimeType: string) {
  const url = String(value || "").trim();
  const normalizedMimeType = normalizeImageMimeType(mimeType);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    throw new Error("Le format du visuel OpenAI retourné n'est pas pris en charge.");
  }
  if (url.startsWith("data:")) return normalizeImageDataUrl(url, MAX_OUTPUT_IMAGE_BYTES);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Le visuel OpenAI retourné utilise une adresse invalide.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Le visuel OpenAI retourné doit utiliser une adresse sécurisée.");
  }
  return parsed.href;
}

function normalizeEstimatedCost(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export function getCommercialDemoAiRuntime(): CommercialDemoAiRuntime | null {
  if (typeof document === "undefined") return null;
  const root = document.documentElement;
  const sessionId = root.dataset.commercialDemoSessionId || "";
  const surface = root.dataset.commercialDemoFrame;
  if (!UUID_PATTERN.test(sessionId) || !isSurface(surface)) return null;
  return { sessionId, surface };
}

export function parseCommercialDemoAiJson<T>(reply: string): T {
  const normalized = String(reply || "").trim();
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() || normalized;
  const firstObject = fenced.indexOf("{");
  const firstArray = fenced.indexOf("[");
  const start = firstObject < 0 ? firstArray : firstArray < 0 ? firstObject : Math.min(firstObject, firstArray);
  const endObject = fenced.lastIndexOf("}");
  const endArray = fenced.lastIndexOf("]");
  const end = Math.max(endObject, endArray);
  if (start < 0 || end < start) throw new Error("La réponse IA ne contient pas de JSON exploitable.");
  return JSON.parse(fenced.slice(start, end + 1)) as T;
}

export async function askCommercialDemoAi(input: {
  runtime: CommercialDemoAiRuntime;
  tool: CommercialDemoAiTool;
  message: string;
  conversationId?: string | null;
  context?: Record<string, unknown>;
  referenceImages?: string[];
  requestId?: string;
}) {
  const requestId = input.requestId && UUID_PATTERN.test(input.requestId) ? input.requestId : createRequestId();
  const rawReferenceImages = input.referenceImages || [];
  if (rawReferenceImages.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`Maximum ${MAX_REFERENCE_IMAGES} images par analyse IA.`);
  }
  const referenceImages = rawReferenceImages.map((value) => normalizeImageDataUrl(value));
  const inFlightKey = [
    "chat",
    input.runtime.sessionId,
    input.runtime.surface,
    input.tool,
    input.conversationId || "new",
    fingerprint(input.message),
    fingerprint(JSON.stringify(input.context || {})),
    referenceImages.map(fingerprint).join("."),
  ].join(":");

  return runSingleInFlight(inFlightKey, async () => {
    const result = await invokeCommercialDemoAi<CommercialDemoAiResponse>({
      action: "chat",
      request_id: requestId,
      session_id: input.runtime.sessionId,
      surface: input.runtime.surface,
      tool: input.tool,
      message: input.message,
      conversation_id: input.conversationId || null,
      context: input.context || {},
      reference_images: referenceImages,
    }, "L'assistant OpenAI de démonstration");
    if (!UUID_PATTERN.test(String(result.conversation_id || "")) || typeof result.reply !== "string") {
      throw new Error("Réponse invalide de l'assistant OpenAI de démonstration.");
    }
    return result;
  });
}

export async function getCommercialDemoAiHistory(
  runtime: CommercialDemoAiRuntime,
  tool?: CommercialDemoAiConversation["tool"],
) {
  const data = await invokeCommercialDemoRpc<CommercialDemoAiConversation[]>(
    "commercial_demo_ai_history",
    {
      p_session_id: runtime.sessionId,
      p_tool: tool || null,
    },
  );
  return Array.isArray(data) ? data : [];
}

export async function archiveCommercialDemoAiConversation(
  runtime: CommercialDemoAiRuntime,
  conversationId: string,
) {
  if (!UUID_PATTERN.test(conversationId)) return false;
  const data = await invokeCommercialDemoRpc<boolean>(
    "commercial_demo_ai_archive_conversation",
    {
      p_session_id: runtime.sessionId,
      p_conversation_id: conversationId,
    },
  );
  return data === true;
}

export async function generateCommercialDemoVisual(
  runtime: CommercialDemoAiRuntime,
  request: TokImageGenerationRequest,
): Promise<TokImageGenerationResult> {
  const tool = getCommercialDemoVisualTool(request);
  // generationSeed belongs to the creative request. It must never double as
  // the transport idempotency key: reusing a creative seed for a later edit
  // would otherwise replay the old image (or conflict with the new payload).
  const requestId = createRequestId();
  const referenceFingerprint = (request.referenceImageUrls || [])
    .concat(request.sourceImageUrl || [])
    .map(fingerprint)
    .join(".");
  const inFlightKey = [
    "visual",
    runtime.sessionId,
    runtime.surface,
    tool,
    fingerprint(JSON.stringify({
      prompt: request.prompt,
      dishName: request.dishName || "",
      format: request.format || "landscape",
      outputResolution: request.outputResolution || "studio",
      styleMode: request.styleMode || (request.marketingAssetMode ? "premium" : "creative"),
      assetType: request.assetType || "campaign_visual",
      marketingAssetMode: Boolean(request.marketingAssetMode),
      generationSeed: request.generationSeed || null,
      palette: request.demoReferencePalette || null,
    })),
    referenceFingerprint,
  ].join(":");

  return runSingleInFlight(inFlightKey, async () => {
    const referenceImages = await buildReferenceImages(request);
    const result = await invokeCommercialDemoAi<CommercialDemoVisualResponse>({
      action: "visual_generate",
      request_id: requestId,
      session_id: runtime.sessionId,
      surface: runtime.surface,
      tool,
      prompt: request.prompt,
      format: request.format || "landscape",
      style: request.styleMode || (request.marketingAssetMode ? "premium" : "creative"),
      context: {
        headline: request.dishName || "UNE EXPÉRIENCE À DÉCOUVRIR",
        subheadline: request.prompt.slice(0, 150),
        cta: "RÉSERVER SUR TOK",
        asset_type: request.assetType || "campaign_visual",
        output_resolution: request.outputResolution || "studio",
        generation_seed: request.generationSeed || null,
        reference_count: referenceImages.length,
        primary_color: request.demoReferencePalette?.primaryColor || null,
        secondary_color: request.demoReferencePalette?.secondaryColor || null,
        background_color: request.demoReferencePalette?.backgroundColor || null,
        reference_fingerprint: request.demoReferencePalette?.fingerprint || "",
        reference_label: request.demoReferencePalette?.label || "",
      },
      ...(referenceImages.length > 0 ? { reference_images: referenceImages } : {}),
    }, "Le Studio OpenAI de démonstration");
    if (!UUID_PATTERN.test(String(result.generation_id || ""))) {
      throw new Error("Identifiant de génération OpenAI invalide.");
    }
    const outputUrl = assertVisualOutputUrl(result.output_url, result.output_mime_type);
    const estimatedCostChf = normalizeEstimatedCost(result.estimated_cost_chf);
    return {
      title: request.dishName || "Visuel OpenAI de démonstration",
      enhanced_prompt: result.prompt || request.prompt,
      edit_instructions: referenceImages.length > 0
        ? "Visuel réellement retouché par OpenAI à partir des références sélectionnées."
        : "Visuel réellement généré par OpenAI dans l'espace commercial isolé.",
      alt_text: result.alt_text,
      publication_caption: request.prompt.slice(0, 220),
      checklist: [
        "OpenAI réel dans la démonstration",
        "Crédits applicatifs Démo illimités",
        "Coût fournisseur suivi en interne",
      ],
      style_tags: ["tok", "commercial-demo", result.style || "openai"],
      safety_notes: ["La clé OpenAI reste exclusivement dans la fonction serveur Supabase."],
      marketing_angles: ["Offre claire", "Appel à l'action TOK"],
      assetId: result.generation_id,
      generated_image_url: outputUrl,
      gallery_image_url: outputUrl,
      storage_bucket: null,
      storage_path: null,
      gallery_storage_bucket: null,
      gallery_storage_path: null,
      model: result.model || "openai",
      output_resolution: request.outputResolution || "studio",
      output_size: `${Number(result.width) || 0}x${Number(result.height) || 0}`,
      output_quality: "high",
      credit_units: 0,
      estimated_cost_chf: estimatedCostChf,
      image_mode: "configured",
      generation_seed: request.generationSeed || null,
      created_at: result.created_at,
      reference_folder: "commercial-demo-openai-isolated",
      status: "generated",
    };
  });
}

function mapCommercialDemoVisualHistoryItem(result: CommercialDemoVisualResponse): CommercialDemoVisualHistoryItem {
  if (!UUID_PATTERN.test(String(result.generation_id || ""))) {
    throw new Error("Identifiant d'historique visuel OpenAI invalide.");
  }
  const prompt = typeof result.prompt === "string" ? result.prompt : "Visuel OpenAI de démonstration";
  const tool = result.tool === "photo_studio" || result.tool === "advisor_visual"
    ? result.tool
    : "marketing_studio";
  const outputUrl = assertVisualOutputUrl(result.output_url, result.output_mime_type);
  return {
    title: tool === "marketing_studio" ? "Visuel marketing OpenAI" : "Visuel photo OpenAI",
    enhanced_prompt: prompt,
    edit_instructions: "Création OpenAI restaurée depuis l'historique isolé de la démonstration.",
    alt_text: result.alt_text || "Visuel OpenAI de démonstration TOK",
    publication_caption: prompt.slice(0, 220),
    checklist: ["Historique Démo persistant", "Crédits applicatifs illimités", "Coût suivi en interne"],
    style_tags: ["tok", "commercial-demo", result.style || "openai"],
    safety_notes: ["La clé OpenAI n'est jamais exposée au navigateur."],
    marketing_angles: ["Démonstration commerciale"],
    assetId: result.generation_id,
    generated_image_url: outputUrl,
    gallery_image_url: outputUrl,
    storage_bucket: null,
    storage_path: null,
    gallery_storage_bucket: null,
    gallery_storage_path: null,
    model: result.model || "openai",
    output_resolution: "studio",
    output_size: `${Number(result.width) || 0}x${Number(result.height) || 0}`,
    output_quality: "high",
    credit_units: 0,
    estimated_cost_chf: normalizeEstimatedCost(result.estimated_cost_chf),
    image_mode: "configured",
    generation_seed: null,
    created_at: result.created_at,
    reference_folder: "commercial-demo-openai-isolated",
    status: "generated",
    prompt,
    tool,
    style: result.style || null,
  };
}

export async function getCommercialDemoVisualHistory(
  runtime: CommercialDemoAiRuntime,
  tool?: CommercialDemoVisualHistoryTool,
  limit = 30,
) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 30, 1), 60);
  const result = await invokeCommercialDemoAi<CommercialDemoVisualHistoryResponse>({
    action: "visual_history",
    session_id: runtime.sessionId,
    surface: runtime.surface,
    tool: tool || null,
    limit: boundedLimit,
  }, "L'historique visuel OpenAI de démonstration");
  if (!Array.isArray(result.generations)) return [];
  return result.generations.map((item) => mapCommercialDemoVisualHistoryItem(
    assertResponseData<CommercialDemoVisualResponse>(item, "L'historique visuel OpenAI de démonstration"),
  ));
}

export function toTokAiMessages(messages: CommercialDemoAiConversation["messages"]): TokAiMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role as TokAiMessage["role"], content: message.content }));
}
