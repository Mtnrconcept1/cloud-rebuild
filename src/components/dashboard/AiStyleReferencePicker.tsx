import { ChangeEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, Loader2, Palette, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import { assertSafeFileUpload, getSafeUploadExtension } from "@/lib/uploadSecurity";

const supabase = getSupabase();

const STYLE_REFERENCE_BUCKET = "images";
const STYLE_REFERENCE_MEDIA_TYPE = "marketing_brand_visual";
const STYLE_REFERENCE_ACCEPT = "image/png,image/jpeg,image/webp";
const STYLE_REFERENCE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const STYLE_REFERENCE_MAX_BYTES = 15 * 1024 * 1024;
const STYLE_REFERENCE_GALLERY_TYPES = [
  "photo",
  "photo_ai_tok",
  "menu_visual",
  "marketing_logo",
  "marketing_business_card",
  "marketing_menu",
  "marketing_brand_visual",
];

export type AiStyleReferenceValue = {
  mediaId?: string | null;
  mediaUrl: string;
  fileName: string;
  source: "gallery" | "upload";
};

export type AiStyleReferenceUploadedResource = {
  mediaId: string;
  mediaUrl: string;
  fileName: string;
  storageBucket: string | null;
  storagePath: string | null;
  mediaType: string;
};

type StyleReferenceRow = {
  id: string;
  media_url: string;
  alt_text: string | null;
  media_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string | null;
};

type Props = {
  restaurantId?: string | null;
  userId?: string | null;
  value: AiStyleReferenceValue | null;
  onChange: (value: AiStyleReferenceValue | null) => void;
  onUploaded?: (resource: AiStyleReferenceUploadedResource) => void;
  galleryMediaTypes?: string[];
  disabled?: boolean;
  className?: string;
};

function createStyleReferencePath(userId: string, restaurantId: string, file: File) {
  const extension = getSafeUploadExtension(file, STYLE_REFERENCE_MIME_EXTENSIONS);
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${userId}/marketing-assets/${restaurantId}/${id}.${extension}`;
}

function getStyleReferenceFileName(row: StyleReferenceRow) {
  return row.alt_text || row.storage_path?.split("/").pop() || "Image de style";
}

async function fetchStyleReferenceGallery(restaurantId: string, mediaTypes: string[]) {
  const { data, error } = await supabase
    .from("restaurant_media")
    .select("id, media_url, alt_text, media_type, storage_bucket, storage_path, created_at")
    .eq("restaurant_id", restaurantId)
    .in("media_type", mediaTypes)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) throw error;

  return (data || [])
    .filter((row): row is StyleReferenceRow => Boolean(row.id && row.media_url));
}

async function uploadStyleReference(input: {
  restaurantId: string;
  userId?: string | null;
  file: File;
}) {
  const { data: userData, error: userError } = input.userId
    ? { data: { user: { id: input.userId } }, error: null }
    : await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    throw new Error("Reconnectez-vous avant d'ajouter une image de style.");
  }

  const optimizedFile = await optimizeImageUpload(input.file);
  assertSafeFileUpload(optimizedFile, {
    allowedMimeTypes: STYLE_REFERENCE_MIME_EXTENSIONS,
    maxBytes: STYLE_REFERENCE_MAX_BYTES,
    label: "Image de style",
  });

  const storagePath = createStyleReferencePath(userData.user.id, input.restaurantId, optimizedFile);
  const { error: uploadError } = await supabase.storage.from(STYLE_REFERENCE_BUCKET).upload(storagePath, optimizedFile, {
    contentType: optimizedFile.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(STYLE_REFERENCE_BUCKET).getPublicUrl(storagePath);
  const mediaUrl = publicData.publicUrl;

  const { data: media, error: insertError } = await supabase
    .from("restaurant_media")
    .insert({
      restaurant_id: input.restaurantId,
      media_url: mediaUrl,
      alt_text: input.file.name,
      media_type: STYLE_REFERENCE_MEDIA_TYPE,
      storage_bucket: STYLE_REFERENCE_BUCKET,
      storage_path: storagePath,
      uploaded_by: userData.user.id,
      position: 0,
      is_cover: false,
    })
    .select("id, media_url, alt_text, media_type, storage_bucket, storage_path")
    .single();

  if (insertError) throw insertError;

  return {
    mediaId: media.id,
    mediaUrl: media.media_url,
    fileName: media.alt_text || input.file.name,
    storageBucket: media.storage_bucket,
    storagePath: media.storage_path,
    mediaType: media.media_type || STYLE_REFERENCE_MEDIA_TYPE,
  } satisfies AiStyleReferenceUploadedResource;
}

export default function AiStyleReferencePicker({
  restaurantId,
  userId,
  value,
  onChange,
  onUploaded,
  galleryMediaTypes,
  disabled,
  className,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const isDisabled = disabled || !restaurantId;
  const activeGalleryMediaTypes = galleryMediaTypes?.length ? galleryMediaTypes : STYLE_REFERENCE_GALLERY_TYPES;

  const galleryQuery = useQuery({
    queryKey: ["ai-style-reference-gallery", restaurantId, activeGalleryMediaTypes, refreshIndex],
    queryFn: () => fetchStyleReferenceGallery(restaurantId!, activeGalleryMediaTypes),
    enabled: Boolean(restaurantId) && open,
  });

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file || !restaurantId) return;

    try {
      assertSafeFileUpload(file, {
        allowedMimeTypes: STYLE_REFERENCE_MIME_EXTENSIONS,
        maxBytes: STYLE_REFERENCE_MAX_BYTES,
        label: "Image de style",
      });
    } catch (error) {
      toast({
        title: "Format refusé",
        description: error instanceof Error ? error.message : "Ajoutez une image PNG, JPG ou WebP.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadStyleReference({ restaurantId, userId, file });
      onUploaded?.(uploaded);
      onChange({
        mediaId: uploaded.mediaId,
        mediaUrl: uploaded.mediaUrl,
        fileName: uploaded.fileName,
        source: "upload",
      });
      setRefreshIndex((current) => current + 1);
      toast({
        title: "Style prêt",
        description: "Cette image guidera la prochaine génération IA.",
      });
    } catch (error) {
      toast({
        title: "Image de style impossible",
        description: error instanceof Error ? error.message : "Le fichier n'a pas pu être ajouté.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant={value ? "secondary" : "outline"}
          onClick={() => setOpen((current) => !current)}
          disabled={isDisabled}
          className="justify-start gap-2 rounded-2xl"
        >
          <Palette className="h-4 w-4 text-orange-600" />
          Réutiliser le style d'une image
        </Button>
        {value ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate">{value.fileName}</span>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} className="h-7 w-7 shrink-0">
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Retirer l'image de style</span>
            </Button>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-orange-100 bg-white/90 p-3 shadow-sm dark:bg-background/80">
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-orange-200 bg-orange-50/60 p-3">
            <Label htmlFor="ai-style-reference-upload" className="flex items-center gap-2 text-sm font-semibold">
              <Upload className="h-4 w-4 text-orange-600" />
              Uploader une image de style
            </Label>
            <Input
              id="ai-style-reference-upload"
              type="file"
              accept={STYLE_REFERENCE_ACCEPT}
              onChange={handleUpload}
              disabled={isDisabled || uploading}
            />
            <p className="text-xs text-muted-foreground">
              TOK reprend l'ambiance, la lumière, les couleurs et le cadrage, sans copier le contenu de cette image.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Ou choisir dans la galerie</p>
              {galleryQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-orange-600" /> : null}
            </div>
            {galleryQuery.isError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Impossible de charger la galerie pour le moment.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {(galleryQuery.data || []).map((row) => {
                const selected = value?.mediaId === row.id || value?.mediaUrl === row.media_url;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onChange({
                      mediaId: row.id,
                      mediaUrl: row.media_url,
                      fileName: getStyleReferenceFileName(row),
                      source: "gallery",
                    })}
                    className={`group min-w-0 overflow-hidden rounded-xl border text-left transition hover:border-orange-400 hover:shadow-md ${selected ? "border-orange-500 ring-2 ring-orange-200" : "border-border"}`}
                  >
                    <img src={row.media_url} alt={getStyleReferenceFileName(row)} className="aspect-square w-full object-cover" loading="lazy" />
                    <span className="block truncate px-2 py-1.5 text-xs font-medium">{getStyleReferenceFileName(row)}</span>
                  </button>
                );
              })}
            </div>
            {!galleryQuery.isLoading && !(galleryQuery.data || []).length ? (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                <ImagePlus className="h-4 w-4" />
                Aucune image disponible. Uploadez une référence pour commencer.
              </div>
            ) : null}
          </div>

          {value ? (
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
              Style actif: {value.source === "upload" ? "image uploadée" : "galerie"}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
