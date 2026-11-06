import { getSupabase } from "@/integrations/supabase/client";
import type { TokVideoImageReference } from "./tokVideoImageUpload";

export const VIDEO_GALLERY_PAGE_SIZE = 24;
const fields = "id, media_url, alt_text, media_type";

function images(value: unknown): TokVideoImageReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row.id === "string" && typeof row.media_url === "string"
    && row.media_url.startsWith("https://") && !/video|pdf|menu|business_card/i.test(String(row.media_type || "")));
}

export async function loadTokVideoBrandMedia(restaurantId: string, page: number, selectedIds: string[] = []) {
  const client = getSupabase();
  const start = Math.max(0, page) * VIDEO_GALLERY_PAGE_SIZE;
  const galleryQuery = client.from("restaurant_media").select(fields)
    .eq("restaurant_id", restaurantId).order("created_at", { ascending: false })
    .range(start, start + VIDEO_GALLERY_PAGE_SIZE - 1);
  const logoQuery = page === 0 ? client.from("restaurant_media").select(fields)
    .eq("restaurant_id", restaurantId).eq("media_type", "marketing_logo")
    .order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [], error: null });
  const selectedQuery = page === 0 && selectedIds.length ? client.from("restaurant_media").select(fields)
    .eq("restaurant_id", restaurantId).in("id", selectedIds.slice(0, 7)).limit(7)
    : Promise.resolve({ data: [], error: null });
  const [gallery, logos, selected] = await Promise.all([galleryQuery, logoQuery, selectedQuery]);
  if (gallery.error || logos.error || selected.error) throw new Error("Votre galerie n'a pas pu être chargée. Réessayez avant de créer la vidéo.");
  const rows = [...images(logos.data), ...images(selected.data), ...images(gallery.data)];
  return {
    media: [...new Map(rows.map((row) => [row.id, row])).values()],
    hasMore: (gallery.data?.length || 0) === VIDEO_GALLERY_PAGE_SIZE,
  };
}
