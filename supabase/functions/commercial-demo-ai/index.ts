import {
  HttpError,
  authenticateRequest,
  jsonResponse,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractOutputText,
  extractUsage,
  selectTokAiModel,
} from "../_shared/openai.ts";
import {
  addCommercialDemoSignedUrl,
  applyCommercialDemoAiRetention,
  claimCommercialDemoAiRequest,
  completeCommercialDemoChat,
  completeCommercialDemoVisual,
  drainCommercialDemoAiStorageCleanup,
  failCommercialDemoAiRequest,
  getCommercialDemoVisualHistory,
  loadCommercialDemoConversationMessages,
  loadCommercialDemoPromptContext,
  readCompletedCommercialDemoAiRequest,
  removeCommercialDemoVisual,
  requireCommercialDemoAiFeature,
  requireUuid,
  resolveCommercialDemoAiContext,
  sanitizeObject,
  sanitizeText,
  sha256Bytes,
  sha256Hex,
  uploadCommercialDemoVisual,
  type CommercialDemoAiClaim,
  type CommercialDemoAiContext,
  type CommercialDemoChatTool,
  type CommercialDemoSurface,
  type CommercialDemoVisualTool,
} from "../_shared/commercial-demo-ai.ts";

const FUNCTION_NAME = "commercial-demo-ai";
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 2;
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_CONCURRENT = readBoundedInteger("COMMERCIAL_DEMO_AI_MAX_CONCURRENT", 12, 1, 24);
const TEXT_TIMEOUT_MS = readBoundedInteger("COMMERCIAL_DEMO_AI_TEXT_TIMEOUT_MS", 45_000, 5_000, 90_000);
const IMAGE_TIMEOUT_MS = readBoundedInteger("COMMERCIAL_DEMO_AI_IMAGE_TIMEOUT_MS", 105_000, 20_000, 115_000);
const IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-2";
const IMAGE_COST_FALLBACK_CHF = readBoundedNumber("OPENAI_GPT_IMAGE_MEDIUM_COST_CHF", 0.05, 0, 100);
const IMAGE_TEXT_INPUT_USD_PER_MILLION = readBoundedNumber(
  "OPENAI_GPT_IMAGE_TEXT_INPUT_USD_PER_MILLION",
  5,
  0,
  10_000,
);
const IMAGE_INPUT_USD_PER_MILLION = readBoundedNumber(
  "OPENAI_GPT_IMAGE_INPUT_USD_PER_MILLION",
  8,
  0,
  10_000,
);
const IMAGE_OUTPUT_USD_PER_MILLION = readBoundedNumber(
  "OPENAI_GPT_IMAGE_OUTPUT_USD_PER_MILLION",
  30,
  0,
  10_000,
);
const USD_TO_CHF_RATE = readBoundedNumber("TOK_OPENAI_USD_TO_CHF_RATE", 0.81, 0, 10);
const IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")?.trim() || OPENAI_API_KEY;

let activeProviderCalls = 0;

type JsonRecord = Record<string, unknown>;
type ReferenceImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  sha256: string;
};

function readBoundedInteger(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function readBoundedNumber(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonBody(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "request_too_large");
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "request_too_large");
  }

  try {
    const parsed = JSON.parse(text || "{}");
    if (!isRecord(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function normalizeAction(raw: unknown) {
  if (
    raw === "chat"
    || raw === "visual_generate"
    || raw === "visual_history"
    || raw === "maintenance_cleanup"
  ) return raw;
  throw new HttpError(400, "action_invalid");
}

function normalizeChatTool(raw: unknown): CommercialDemoChatTool {
  if (raw === "assistant" || raw === "support_chat") return raw;
  throw new HttpError(400, "chat_tool_invalid");
}

function normalizeVisualTool(raw: unknown, allowNull = false): CommercialDemoVisualTool | null {
  if (raw === "marketing_studio" || raw === "photo_studio" || raw === "advisor_visual") return raw;
  if ((raw === null || raw === undefined || raw === "") && allowNull) return null;
  if (raw === null || raw === undefined || raw === "") return "marketing_studio";
  throw new HttpError(400, "visual_tool_invalid");
}

function normalizeSurface(raw: unknown): CommercialDemoSurface {
  if (raw === "client" || raw === "restaurant" || raw === "courier") return raw;
  return "restaurant";
}

function normalizeFormat(raw: unknown) {
  if (raw === "portrait") return { label: "portrait" as const, size: "1024x1536", width: 1024, height: 1536 };
  if (raw === "square") return { label: "square" as const, size: "1024x1024", width: 1024, height: 1024 };
  return { label: "landscape" as const, size: "1536x1024", width: 1536, height: 1024 };
}

function normalizeClientContext(raw: unknown) {
  const context = { ...sanitizeObject(raw, 24_000) };
  // Identity and authorization always come from the verified session mapping.
  for (const key of [
    "restaurant_id",
    "restaurantId",
    "demo_restaurant_id",
    "commercial_user_id",
    "user_id",
    "role",
    "roles",
    "is_admin",
  ]) {
    delete context[key];
  }
  return context;
}

async function withProviderSlot<T>(callback: () => Promise<T>) {
  if (activeProviderCalls >= MAX_CONCURRENT) {
    throw new HttpError(503, "commercial_demo_ai_busy");
  }
  activeProviderCalls += 1;
  try {
    return await callback();
  } finally {
    activeProviderCalls = Math.max(0, activeProviderCalls - 1);
  }
}

function claimReplayOrThrow(claim: CommercialDemoAiClaim) {
  if (claim.state === "claimed") return null;
  if (claim.state === "replay" && claim.response) return claim.response;
  if (claim.state === "mismatch") throw new HttpError(409, "request_id_payload_mismatch");
  if (claim.state === "in_progress") throw new HttpError(409, "request_in_progress");
  if (claim.state === "failed") throw new HttpError(409, claim.error_code || "request_previously_failed");
  if (claim.state === "busy") throw new HttpError(503, "commercial_demo_ai_busy");
  if (claim.state === "circuit_open") throw new HttpError(503, "commercial_demo_ai_circuit_open");
  throw new HttpError(503, "commercial_demo_ai_claim_unavailable");
}

function providerFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout")) return "provider_timeout";
  if (message.includes("rate_limited") || message.includes("rate limit")) return "provider_rate_limited";
  if (message.includes("billing") || message.includes("quota")) return "provider_billing_unavailable";
  if (message.includes("fetch") || message.includes("network") || message.includes("connection")) {
    return "provider_network_error";
  }
  if (message.includes("empty_response") || message.includes("invalid_response") || message.includes("invalid_payload")) {
    return "provider_invalid_response";
  }
  if (message.startsWith("provider_")) return sanitizeText(message, 160);
  if (message.includes("ai_service") || message.includes("image_generation")) return "provider_service_error";
  return "request_failed";
}

function responseModel(data: unknown, fallback: string) {
  if (!isRecord(data)) return fallback;
  return sanitizeText(data.model, 120) || fallback;
}

function responseId(data: unknown) {
  if (!isRecord(data)) return null;
  return sanitizeText(data.id, 200) || null;
}

function clampUsage(data: unknown) {
  const usage = extractUsage(data);
  const inputTokens = Math.max(0, Math.trunc(Number(usage.input_tokens || 0)));
  const outputTokens = Math.max(0, Math.trunc(Number(usage.output_tokens || 0)));
  const totalTokens = Math.max(
    inputTokens,
    outputTokens,
    Math.trunc(Number(usage.total_tokens || inputTokens + outputTokens)),
  );
  return { inputTokens, outputTokens, totalTokens };
}

async function recoverCompletedResponse(context: CommercialDemoAiContext, requestId: string) {
  return await readCompletedCommercialDemoAiRequest(context, requestId).catch(() => null);
}

async function handleChat(body: JsonRecord, context: CommercialDemoAiContext) {
  const tool = normalizeChatTool(body.tool);
  await requireCommercialDemoAiFeature(context, "chat", tool);

  const requestId = requireUuid(body.request_id ?? body.requestId, "request_id_invalid");
  const message = sanitizeText(body.message, 4000);
  if (!message) throw new HttpError(400, "message_required");
  const conversationId = body.conversation_id || body.conversationId
    ? requireUuid(body.conversation_id ?? body.conversationId, "conversation_id_invalid")
    : null;
  const surface = normalizeSurface(body.surface);
  const clientContext = normalizeClientContext(body.context);

  const payloadHash = await sha256Hex({
    action: "chat",
    session_id: context.sessionId,
    tool,
    message,
    conversation_id: conversationId,
    surface,
    context: clientContext,
  });
  const lockToken = crypto.randomUUID();
  const claim = await claimCommercialDemoAiRequest({
    context,
    requestId,
    action: "chat",
    tool,
    payloadHash,
    lockToken,
  });
  const replay = claimReplayOrThrow(claim);
  if (replay) return { ...replay, replayed: true };

  const requestedModel = selectTokAiModel(tool === "support_chat" ? "support" : "strategy");
  try {
    const [demoContext, history] = await Promise.all([
      loadCommercialDemoPromptContext(context),
      loadCommercialDemoConversationMessages(context, conversationId, tool),
    ]);

    const systemPrompt = tool === "support_chat"
      ? `Tu es le Chat IA de démonstration TOK pour un commercial qui présente la plateforme à un restaurateur.
Réponds en français, de manière concrète, chaleureuse et immédiatement exploitable.
Utilise exclusivement le contexte de démonstration fourni. Ne prétends jamais lire ou modifier des données de production.
Si une information manque, dis-le et propose une étape de démonstration sûre. Ne mentionne ni crédits TOK ni limites d'usage.`
      : `Tu es l'assistant stratégique TOK d'un restaurant de démonstration.
Réponds en français avec une analyse courte, des recommandations priorisées et des actions mesurables.
Utilise exclusivement le restaurant, la commande et les réservations simulés fournis. N'invente aucune donnée de production.
La réponse doit aider un commercial à montrer la valeur du produit à un restaurateur, sans mentionner OpenAI ni des quotas.`;

    const providerResponse = await withProviderSlot(() => createOpenAIResponse({
      model: requestedModel,
      maxOutputTokens: tool === "support_chat" ? 900 : 1500,
      timeoutMs: TEXT_TIMEOUT_MS,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Contexte serveur de démonstration (source fiable):\n${JSON.stringify(demoContext)}`,
        },
        ...history,
        {
          role: "user",
          content: [
            message,
            Object.keys(clientContext).length
              ? `Contexte d'interface non fiable, uniquement indicatif: ${JSON.stringify(clientContext)}`
              : "",
          ].filter(Boolean).join("\n\n"),
        },
      ],
    }));

    const reply = extractOutputText(providerResponse);
    if (!reply) throw new HttpError(502, "ai_empty_response");
    const model = responseModel(providerResponse, requestedModel);
    const usage = clampUsage(providerResponse);
    const estimatedCostChf = estimateOpenAITextCostChf(
      model,
      usage.inputTokens,
      usage.outputTokens,
    );

    try {
      return await completeCommercialDemoChat({
        context,
        requestId,
        lockToken,
        message,
        clientContext,
        conversationId,
        surface,
        reply,
        model,
        providerResponseId: responseId(providerResponse),
        ...usage,
        estimatedCostChf,
      });
    } catch (completionError) {
      const recovered = await recoverCompletedResponse(context, requestId);
      if (recovered) return { ...recovered, replayed: true };
      throw completionError;
    }
  } catch (error) {
    await failCommercialDemoAiRequest({
      context,
      requestId,
      lockToken,
      errorCode: providerFailureCode(error),
      model: requestedModel,
    }).catch(() => {});
    throw error;
  }
}

function imageUsage(data: unknown, hasReferences: boolean) {
  if (!isRecord(data) || !isRecord(data.usage)) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostChf: IMAGE_COST_FALLBACK_CHF,
    };
  }
  const usage = data.usage;
  const inputTokens = Math.max(0, Math.trunc(Number(usage.input_tokens || 0)));
  const outputTokens = Math.max(0, Math.trunc(Number(usage.output_tokens || 0)));
  const totalTokens = Math.max(
    inputTokens,
    outputTokens,
    Math.trunc(Number(usage.total_tokens || inputTokens + outputTokens)),
  );
  const details = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {};
  let imageInputTokens = Math.max(0, Math.trunc(Number(details.image_tokens || 0)));
  let textInputTokens = Math.max(0, Math.trunc(Number(details.text_tokens || 0)));
  const unclassifiedInputTokens = Math.max(0, inputTokens - imageInputTokens - textInputTokens);
  if (hasReferences) imageInputTokens += unclassifiedInputTokens;
  else textInputTokens += unclassifiedInputTokens;

  const estimatedCostUsd =
    (textInputTokens * IMAGE_TEXT_INPUT_USD_PER_MILLION / 1_000_000)
    + (imageInputTokens * IMAGE_INPUT_USD_PER_MILLION / 1_000_000)
    + (outputTokens * IMAGE_OUTPUT_USD_PER_MILLION / 1_000_000);
  const measuredCostChf = Number((estimatedCostUsd * USD_TO_CHF_RATE).toFixed(6));
  const estimatedCostChf = inputTokens > 0 || outputTokens > 0
    ? measuredCostChf
    : IMAGE_COST_FALLBACK_CHF;

  return { inputTokens, outputTokens, totalTokens, estimatedCostChf };
}

function bytesFromBase64(base64: string, errorCode: string) {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new HttpError(400, errorCode);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hasReferenceMagicBytes(bytes: Uint8Array, mimeType: ReferenceImage["mimeType"]) {
  if (mimeType === "image/png") {
    return bytes.length >= 8
      && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        .every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function normalizeReferenceImages(raw: unknown): Promise<ReferenceImage[]> {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "reference_images_invalid");
  if (raw.length > MAX_REFERENCE_IMAGES) throw new HttpError(400, "reference_images_limit_exceeded");

  const references: ReferenceImage[] = [];
  for (const item of raw) {
    if (typeof item !== "string") throw new HttpError(400, "reference_image_invalid");
    const match = item.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\r\n]+)$/i);
    if (!match) throw new HttpError(400, "reference_image_data_url_required");
    const mimeType = match[1].toLowerCase() as ReferenceImage["mimeType"];
    const encoded = match[2].replace(/[\r\n]/g, "");
    if (encoded.length > Math.ceil(MAX_REFERENCE_IMAGE_BYTES * 4 / 3) + 4) {
      throw new HttpError(413, "reference_image_too_large");
    }
    const bytes = bytesFromBase64(encoded, "reference_image_invalid_base64");
    if (!bytes.length || bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
      throw new HttpError(413, "reference_image_too_large");
    }
    if (!hasReferenceMagicBytes(bytes, mimeType)) {
      throw new HttpError(400, "reference_image_mime_mismatch");
    }
    references.push({
      bytes,
      mimeType,
      extension: mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png",
      sha256: await sha256Bytes(bytes),
    });
  }
  return references;
}

function decodeBase64Image(data: unknown) {
  const items = isRecord(data) && Array.isArray(data.data) ? data.data : [];
  const first = items[0];
  if (!isRecord(first) || typeof first.b64_json !== "string") {
    throw new HttpError(502, "image_missing_payload");
  }

  let binary: string;
  try {
    binary = atob(first.b64_json);
  } catch {
    throw new HttpError(502, "image_invalid_payload");
  }
  if (binary.length < 8 || binary.length > 20 * 1024 * 1024) {
    throw new HttpError(502, "image_invalid_size");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) {
    throw new HttpError(502, "image_invalid_magic_bytes");
  }
  return bytes;
}

async function callOpenAIImage(prompt: string, size: string, references: ReferenceImage[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    let response: Response;
    if (references.length) {
      const form = new FormData();
      form.append("model", IMAGE_MODEL);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", "medium");
      form.append("n", "1");
      form.append("output_format", "png");
      form.append("moderation", "auto");
      references.forEach((reference, index) => {
        form.append(
          "image[]",
          new Blob([reference.bytes], { type: reference.mimeType }),
          `reference-${index + 1}.${reference.extension}`,
        );
      });
      response = await fetch(IMAGE_EDITS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
        signal: controller.signal,
      });
    } else {
      response = await fetch(IMAGE_GENERATIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt,
          size,
          quality: "medium",
          n: 1,
          output_format: "png",
          moderation: "auto",
        }),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      if (response.status === 429) throw new HttpError(429, "provider_rate_limited");
      if (response.status === 402) throw new HttpError(503, "provider_billing_unavailable");
      if (response.status === 400) throw new HttpError(400, "image_request_rejected");
      if (response.status === 401 || response.status === 403) {
        throw new HttpError(502, "provider_auth_error");
      }
      throw new HttpError(502, "provider_service_error");
    }
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(503, "provider_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleVisualGenerate(body: JsonRecord, context: CommercialDemoAiContext) {
  const tool = normalizeVisualTool(body.tool) || "marketing_studio";
  await requireCommercialDemoAiFeature(context, "visual_generate", tool);

  const requestId = requireUuid(body.request_id ?? body.requestId, "request_id_invalid");
  const prompt = sanitizeText(body.prompt, 6000);
  if (!prompt) throw new HttpError(400, "prompt_required");
  const format = normalizeFormat(body.format);
  const style = sanitizeText(body.style, 80) || "premium";
  const clientContext = normalizeClientContext(body.context);
  const referenceImages = await normalizeReferenceImages(body.reference_images ?? body.referenceImages);
  const payloadHash = await sha256Hex({
    action: "visual_generate",
    session_id: context.sessionId,
    tool,
    prompt,
    format: format.label,
    style,
    context: clientContext,
    reference_images: referenceImages.map((reference) => ({
      mime_type: reference.mimeType,
      byte_length: reference.bytes.byteLength,
      sha256: reference.sha256,
    })),
  });
  const lockToken = crypto.randomUUID();
  const claim = await claimCommercialDemoAiRequest({
    context,
    requestId,
    action: "visual_generate",
    tool,
    payloadHash,
    lockToken,
  });
  const replay = claimReplayOrThrow(claim);
  if (replay) {
    return { ...(await addCommercialDemoSignedUrl(context, replay)), replayed: true };
  }

  let storagePath: string | null = null;
  try {
    const finalPrompt = [
      `Crée un visuel professionnel pour le restaurant de démonstration ${context.restaurant.name}.`,
      context.restaurant.cuisine_type ? `Cuisine: ${context.restaurant.cuisine_type}.` : "",
      context.restaurant.city ? `Ville: ${context.restaurant.city}.` : "",
      `Brief commercial: ${prompt}`,
      `Style demandé: ${style}. Format: ${format.label}.`,
      referenceImages.length
        ? `Retouche fidèlement les ${referenceImages.length} image(s) de référence: conserve le même plat, les ingrédients principaux et l'identité visuelle reconnaissable, puis améliore cadrage, lumière, netteté et mise en scène.`
        : "",
      "Rendu premium, crédible et prêt à présenter à un restaurateur. Texte lisible uniquement s'il est explicitement demandé dans le brief.",
      "Ne montre aucune donnée privée, aucun faux label officiel et aucun logo de plateforme inventé.",
      Object.keys(clientContext).length
        ? `Contexte visuel indicatif: ${JSON.stringify(clientContext)}`
        : "",
    ].filter(Boolean).join("\n").slice(0, 7000);

    const providerResponse = await withProviderSlot(() => callOpenAIImage(finalPrompt, format.size, referenceImages));
    const bytes = decodeBase64Image(providerResponse);
    const outputSha256 = await sha256Bytes(bytes);
    storagePath = await uploadCommercialDemoVisual(context, requestId, bytes);
    const model = responseModel(providerResponse, IMAGE_MODEL);
    const usage = imageUsage(providerResponse, referenceImages.length > 0);
    const altText = `Visuel IA ${format.label} pour ${context.restaurant.name} : ${prompt.slice(0, 180)}`;

    try {
      const completed = await completeCommercialDemoVisual({
        context,
        requestId,
        lockToken,
        prompt,
        format: format.label,
        style,
        clientContext,
        storagePath,
        outputSha256,
        model,
        providerResponseId: responseId(providerResponse),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostChf: usage.estimatedCostChf,
        width: format.width,
        height: format.height,
        altText,
      });
      return await addCommercialDemoSignedUrl(context, completed);
    } catch (completionError) {
      const recovered = await recoverCompletedResponse(context, requestId);
      if (recovered) return { ...(await addCommercialDemoSignedUrl(context, recovered)), replayed: true };
      throw completionError;
    }
  } catch (error) {
    if (storagePath) {
      const recovered = await recoverCompletedResponse(context, requestId);
      if (recovered) return { ...(await addCommercialDemoSignedUrl(context, recovered)), replayed: true };
      await removeCommercialDemoVisual(context, storagePath).catch(() => {});
    }
    await failCommercialDemoAiRequest({
      context,
      requestId,
      lockToken,
      errorCode: providerFailureCode(error),
      model: IMAGE_MODEL,
    }).catch(() => {});
    throw error;
  }
}

async function handleVisualHistory(body: JsonRecord, context: CommercialDemoAiContext) {
  const tool = normalizeVisualTool(body.tool, true);
  await requireCommercialDemoAiFeature(context, "visual_history", tool);
  const requestedLimit = Math.trunc(Number(body.limit || 30));
  const generations = await getCommercialDemoVisualHistory({
    context,
    tool,
    limit: Number.isFinite(requestedLimit) ? requestedLimit : 30,
  });
  return { generations };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");

    // authenticateRequest calls Supabase Auth getUser() with the presented JWT;
    // no role, restaurant or user claim from the JSON body is ever trusted.
    const actor = await authenticateRequest(req, {
      allowServiceRole: false,
      allowSchedulerSecret: true,
    });
    const body = await readJsonBody(req);
    const action = normalizeAction(body.action);

    // Supabase Cron can drain archive/delete outbox rows even when no later
    // commercial session is opened. Five batches bound each worker run.
    if (action === "maintenance_cleanup") {
      if (actor.authMode !== "scheduler_secret") {
        throw new HttpError(403, "commercial_demo_ai_maintenance_forbidden");
      }
      let removed = 0;
      for (let batch = 0; batch < 5; batch += 1) {
        const count = await drainCommercialDemoAiStorageCleanup(actor);
        removed += count;
        if (count < 20) break;
      }
      return jsonResponse({ ok: true, removed }, 200, cors);
    }

    const sessionId = requireUuid(body.session_id ?? body.sessionId, "session_id_invalid");
    const context = await resolveCommercialDemoAiContext(actor, sessionId);

    // Retention is a storage-safety mechanism, never a request or credit quota.
    // Failures are non-blocking so provider demonstrations remain available.
    await applyCommercialDemoAiRetention(context).catch((error) => {
      console.warn(`[${FUNCTION_NAME}] retention_deferred`, error);
    });
    await drainCommercialDemoAiStorageCleanup(context).catch((error) => {
      console.warn(`[${FUNCTION_NAME}] cleanup_deferred`, error);
    });

    // History only signs existing private objects and must remain available if
    // the provider key is temporarily absent.
    if (action !== "visual_history" && !OPENAI_KEY) {
      throw new HttpError(503, "ai_service_unavailable");
    }

    const result = action === "chat"
      ? await handleChat(body, context)
      : action === "visual_generate"
      ? await handleVisualGenerate(body, context)
      : await handleVisualHistory(body, context);

    // A visual generated by this call may have crossed the retention boundary.
    if (action === "visual_generate") {
      await applyCommercialDemoAiRetention(context).catch(() => {});
      await drainCommercialDemoAiStorageCleanup(context).catch(() => {});
    }

    return jsonResponse(result, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "internal_error";
    console.error(`[${FUNCTION_NAME}] request_failed`, { status, message });
    return jsonResponse({ error: message }, status, cors);
  }
});
