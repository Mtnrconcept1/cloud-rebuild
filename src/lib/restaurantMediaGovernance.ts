import { invokeSupabaseFunction, invokeSupabaseRpc } from "@/lib/session";

export type RestaurantCoverUpdateResult = {
  media_id: string;
  restaurant_id: string;
  image_url: string | null;
};

export type RestaurantMediaDeleteResult = {
  ok: boolean;
  media_id: string;
  restaurant_id: string;
  media_url: string;
  media_type: string;
  uploaded_by: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  was_cover: boolean;
  next_cover_id: string | null;
  image_url: string | null;
  storage_deleted: boolean;
  storage_cleanup_allowed: boolean;
};

export function setRestaurantCoverMedia(mediaId: string) {
  return invokeSupabaseRpc<RestaurantCoverUpdateResult>("restaurant_set_cover_media", {
    body: { p_media_id: mediaId },
  });
}

export async function deleteRestaurantMedia(mediaId: string) {
  const { data, error } = await invokeSupabaseFunction<RestaurantMediaDeleteResult>("restaurant-media-governance", {
    body: { action: "delete_media", mediaId },
  });

  if (error) throw error;
  return data as RestaurantMediaDeleteResult;
}
