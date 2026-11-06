import { getSupabase } from "@/integrations/supabase/client";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import { assertSafeFileUpload } from "@/lib/uploadSecurity";

export type TokVideoImageReference = {
  id: string;
  media_url: string;
  alt_text: string | null;
  media_type?: string;
};

export const VIDEO_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const VIDEO_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateTokVideoImage(file: File) {
  assertSafeFileUpload(file, {
    allowedMimeTypes: VIDEO_IMAGE_MIME_EXTENSIONS,
    maxBytes: VIDEO_IMAGE_MAX_BYTES,
    label: "Image de référence",
  });
}

export function getTokVideoImagePath(
  restaurantId: string,
  userId: string,
  id: string,
  mimeType: string,
) {
  const extension = VIDEO_IMAGE_MIME_EXTENSIONS[mimeType];
  if (!extension || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Chemin d'image invalide.");
  return `${restaurantId}/marketing-assets/${userId}/${id}.${extension}`;
}

/**
 * Existing restaurant-images bucket uses RLS based on the first path segment
 * (restaurant UUID). Persisting to restaurant_media keeps the upload available
 * when the user switches tabs or devices, without bypassing tenant policies.
 */
export async function uploadTokVideoImage(
  restaurantId: string,
  file: File,
  kind: "photo" | "logo" = "photo",
): Promise<TokVideoImageReference> {
  validateTokVideoImage(file);
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Reconnectez-vous avant d'importer une image.");

  // Keep the uploaded logo file intact; never redraw or recolor the identity.
  const optimized = kind === "logo" ? file : await optimizeImageUpload(file);
  validateTokVideoImage(optimized);
  const storageBucket = "restaurant-images";
  const path = getTokVideoImagePath(
    restaurantId,
    userData.user.id,
    crypto.randomUUID(),
    optimized.type,
  );
  const { error: uploadError } = await supabase.storage.from(storageBucket).upload(path, optimized, {
    contentType: optimized.type,
    upsert: false,
  });
  if (uploadError) throw new Error("Import de l'image impossible : " + uploadError.message);

  const publicUrl = supabase.storage.from(storageBucket).getPublicUrl(path).data.publicUrl;
  const { data: media, error: dbError } = await supabase.from("restaurant_media")
    .insert({
      restaurant_id: restaurantId,
      media_url: publicUrl,
      alt_text: file.name,
      media_type: kind === "logo" ? "marketing_logo" : "marketing_brand_visual",
      storage_bucket: storageBucket,
      storage_path: path,
      uploaded_by: userData.user.id,
      position: 0,
      is_cover: false,
    })
    .select("id, media_url, alt_text, media_type")
    .single();

  if (dbError || !media) {
    // No visible orphan image when the metadata insert fails.
    await supabase.storage.from(storageBucket).remove([path]).catch(() => {});
    throw new Error("L'image n'a pas pu être associée au restaurant. Réessayez.");
  }
  return {
    id: media.id,
    media_url: media.media_url,
    alt_text: media.alt_text,
    media_type: media.media_type,
  };
}
