import type { Json } from "@/integrations/supabase/types";
import type { TokImageGenerationResult } from "@/lib/ai/tokAiClient";

export type RestaurantMediaAiTool = "photopro" | "marketing_studio" | "menu_photo" | "advisor_photo" | "unknown";

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

export function buildRestaurantMediaAiMetadata(input: {
  result?: TokImageGenerationResult | null;
  dishName?: string | null;
  tool: RestaurantMediaAiTool;
  createdAt?: string | null;
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
    generated_at: input.createdAt || new Date().toISOString(),
    added_to_gallery_at: new Date().toISOString(),
  };
}
