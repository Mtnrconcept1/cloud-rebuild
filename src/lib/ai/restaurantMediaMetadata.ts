import type { Json } from "@/integrations/supabase/types";
import type { TokImageGenerationResult } from "@/lib/ai/tokAiClient";

export type RestaurantMediaAiTool = "photopro" | "marketing_studio" | "menu_photo" | "advisor_photo" | "unknown";

export type RestaurantMediaWatermarkSubscription = {
  plan?: string | null;
  slug?: string | null;
  status?: string | null;
} | null | undefined;

export const RESTAURANT_MEDIA_AI_TOOL_LABELS: Record<RestaurantMediaAiTool, string> = {
  photopro: "Photopro",
  marketing_studio: "Marketing Studio",
  menu_photo: "Menu",
  advisor_photo: "Assistant IA",
  unknown: "IA TOK",
};

export function normalizeTokImageQuality(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "medium") return "med";
  if (normalized === "low" || normalized === "med" || normalized === "high") return normalized;
  return normalized || null;
}

export function getRestaurantMediaAiToolLabel(value: unknown) {
  if (typeof value !== "string") return RESTAURANT_MEDIA_AI_TOOL_LABELS.unknown;
  return RESTAURANT_MEDIA_AI_TOOL_LABELS[value as RestaurantMediaAiTool] || RESTAURANT_MEDIA_AI_TOOL_LABELS.unknown;
}

function readMetadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

export function getRestaurantMediaAiToolFromMetadata(metadata: unknown): RestaurantMediaAiTool {
  const tool = readMetadataRecord(metadata).tool;
  return typeof tool === "string" && tool in RESTAURANT_MEDIA_AI_TOOL_LABELS
    ? tool as RestaurantMediaAiTool
    : "unknown";
}

function normalizePlanSlug(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isTokProOrHigherRestaurantSubscription(subscription: RestaurantMediaWatermarkSubscription) {
  const status = normalizePlanSlug(subscription?.status);
  const plan = normalizePlanSlug(subscription?.slug || subscription?.plan);
  return ["active", "trialing"].includes(status) && ["pro", "premium", "elite", "custom"].includes(plan);
}

export function shouldApplyTokWatermarkToRestaurantMedia(input: {
  mediaType?: string | null;
  metadata?: unknown;
  subscription?: RestaurantMediaWatermarkSubscription;
}) {
  if (input.mediaType !== "photo_ai_tok") return false;
  if (isTokProOrHigherRestaurantSubscription(input.subscription)) return false;

  const metadata = readMetadataRecord(input.metadata);
  if (metadata.tok_watermark_required === false) return false;
  if (metadata.tok_watermark_required === true) return true;

  return getRestaurantMediaAiToolFromMetadata(metadata) === "photopro";
}

export function buildRestaurantMediaAiMetadata(input: {
  result?: TokImageGenerationResult | null;
  dishName?: string | null;
  tool: RestaurantMediaAiTool;
  createdAt?: string | null;
  tokWatermarkRequired?: boolean | null;
}): Json {
  const result = input.result;
  const dishName = (input.dishName || result?.title || result?.alt_text || "").trim();
  const outputQuality = normalizeTokImageQuality(result?.output_quality);

  return {
    source: "tok_ai_generation",
    dish_name: dishName || null,
    tool: input.tool,
    tool_label: getRestaurantMediaAiToolLabel(input.tool),
    ai_model: result?.model || null,
    output_resolution: result?.output_resolution || null,
    output_quality: outputQuality,
    output_size: result?.output_size || null,
    generated_asset_id: result?.assetId || null,
    tok_watermark_required: input.tokWatermarkRequired ?? null,
    generated_at: input.createdAt || new Date().toISOString(),
    added_to_gallery_at: new Date().toISOString(),
  };
}
