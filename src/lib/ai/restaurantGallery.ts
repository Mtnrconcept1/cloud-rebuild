import { invokeSupabaseFunction } from "@/lib/session";
import type { RestaurantMediaAiTool } from "@/lib/ai/restaurantMediaMetadata";

export type AddAiCreationToGalleryInput = {
  restaurantId: string;
  assetId: string;
  altText?: string | null;
  dishName?: string | null;
  tool?: RestaurantMediaAiTool;
  tokWatermarkRequired?: boolean | null;
  positionHint?: number | null;
};

export type AddAiCreationToGalleryResult = {
  ok: boolean;
  adopted?: boolean;
  already_exists?: boolean;
  gallery_storage_bucket?: string;
  gallery_storage_path?: string;
  gallery_image_url?: string;
  media?: {
    id: string;
    restaurant_id?: string;
    media_url?: string;
    storage_bucket?: string;
    storage_path?: string;
  };
};

export async function addAiCreationToRestaurantGallery(input: AddAiCreationToGalleryInput) {
  const { data, error } = await invokeSupabaseFunction<AddAiCreationToGalleryResult>("restaurant-media-governance", {
    body: {
      action: "add_ai_creation_to_gallery",
      restaurantId: input.restaurantId,
      assetId: input.assetId,
      altText: input.altText || null,
      dishName: input.dishName || null,
      tool: input.tool || "unknown",
      tokWatermarkRequired: input.tokWatermarkRequired ?? null,
      positionHint: input.positionHint ?? null,
    },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error("Ajout à la galerie impossible.");
  return data;
}
