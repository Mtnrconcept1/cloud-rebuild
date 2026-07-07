import { getSupabase } from "@/integrations/supabase/client";
import {
  IMAGE_MIME_EXTENSIONS,
  MAX_IMAGE_UPLOAD_BYTES,
  assertSafeFileUpload,
  getSafeUploadExtension,
} from "@/lib/uploadSecurity";

export type RestaurantImageAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export type RestaurantImageAnalysisRow = {
  id: string;
  restaurant_id: string;
  uploaded_by: string | null;
  bucket: string;
  storage_path: string;
  public_url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  analysis_status: RestaurantImageAnalysisStatus;
  analysis_error: string | null;
  created_at: string;
};

export type UploadRestaurantImageParams = {
  file: File;
  restaurantId: string;
  userId?: string | null;
};

export type RegisterRestaurantImageForAnalysisParams = {
  restaurantId: string;
  userId?: string | null;
  bucket: string;
  storagePath: string;
  publicUrl?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  sourceType?: "restaurant_gallery" | "actualites" | "marketing" | "other";
  sourceTable?: string | null;
  sourceId?: string | null;
  sourceContext?: Record<string, unknown> | null;
};

const RESTAURANT_IMAGE_BUCKET = "restaurant-images";

function triggerRestaurantImageAnalysis(imageId: string) {
  if (!imageId) return;

  const supabase = getSupabase() as any;
  void supabase.functions
    .invoke("analyze-restaurant-image", { body: { imageId } })
    .then(({ error }: { error?: { message?: string } | null }) => {
      if (error) {
        console.warn("Analyse image TOK non demarree:", error.message || error);
      }
    })
    .catch((error: unknown) => {
      console.warn("Analyse image TOK non demarree:", error);
    });
}

function getImageDimensions(file: File) {
  if (typeof URL === "undefined" || typeof Image === "undefined") {
    return Promise.resolve({ width: null, height: null });
  }

  return new Promise<{ width: number | null; height: number | null }>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: null, height: null });
    };
    image.src = objectUrl;
  });
}

function buildRestaurantImageStoragePath(restaurantId: string, file: File) {
  const extension = getSafeUploadExtension(file, IMAGE_MIME_EXTENSIONS);
  return `${restaurantId}/${crypto.randomUUID()}.${extension}`;
}

export async function registerRestaurantImageForAnalysis({
  restaurantId,
  userId = null,
  bucket,
  storagePath,
  publicUrl = null,
  originalFilename = null,
  mimeType = null,
  sizeBytes = null,
  width = null,
  height = null,
  sourceType = "restaurant_gallery",
  sourceTable = null,
  sourceId = null,
  sourceContext = null,
}: RegisterRestaurantImageForAnalysisParams) {
  if (!restaurantId || !storagePath || !bucket) {
    throw new Error("Image restaurant invalide pour l'analyse.");
  }

  const supabase = getSupabase() as any;
  const { data, error } = await supabase
    .from("restaurant_images")
    .upsert(
      {
        restaurant_id: restaurantId,
        uploaded_by: userId,
        bucket,
        storage_path: storagePath,
        public_url: publicUrl,
        original_filename: originalFilename,
        mime_type: mimeType,
        width,
        height,
        size_bytes: sizeBytes,
        source_type: sourceType,
        source_table: sourceTable,
        source_id: sourceId,
        source_context: sourceContext || {},
        analysis_status: "pending",
        analysis_error: null,
      },
      { onConflict: "bucket,storage_path" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Analyse image non planifiée: ${error.message}`);
  }

  const row = data as RestaurantImageAnalysisRow;
  triggerRestaurantImageAnalysis(row.id);
  return row;
}

export async function uploadRestaurantImage({
  file,
  restaurantId,
  userId = null,
}: UploadRestaurantImageParams) {
  assertSafeFileUpload(file, {
    allowedMimeTypes: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    },
    maxBytes: MAX_IMAGE_UPLOAD_BYTES,
    label: "Image restaurant",
  });

  const storagePath = buildRestaurantImageStoragePath(restaurantId, file);
  const supabase = getSupabase() as any;
  const { error: uploadError } = await supabase.storage
    .from(RESTAURANT_IMAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(`Upload image impossible: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(RESTAURANT_IMAGE_BUCKET)
    .getPublicUrl(storagePath);
  const dimensions = await getImageDimensions(file);

  return registerRestaurantImageForAnalysis({
    restaurantId,
    userId,
    bucket: RESTAURANT_IMAGE_BUCKET,
    storagePath,
    publicUrl: publicUrlData?.publicUrl || null,
    originalFilename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
  });
}
