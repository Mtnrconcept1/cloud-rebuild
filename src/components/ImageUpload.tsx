import { useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizePublicImageUrl } from "@/lib/securityUrls";
import { getOptimizedImageUrl, optimizeImageUpload } from "@/lib/optimizedImages";
import {
  IMAGE_MIME_EXTENSIONS,
  MAX_IMAGE_UPLOAD_BYTES,
  assertSafeFileUpload,
  getSafeUploadExtension,
} from "@/lib/uploadSecurity";

const supabase = getSupabase();
const UUID_NAMESPACE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ImageUploadMetadata = {
  storageBucket: string;
  storagePath: string;
};

interface ImageUploadProps {
  value: string;
  onChange: (url: string, metadata?: ImageUploadMetadata) => void;
  label?: string;
  bucket?: string;
  pathPrefix?: string;
  className?: string;
  showUrlInput?: boolean;
}

function createImagePath(namespace: string, file: File) {
  assertSafeFileUpload(file, {
    allowedMimeTypes: IMAGE_MIME_EXTENSIONS,
    maxBytes: MAX_IMAGE_UPLOAD_BYTES,
    label: "Image",
  });
  if (!UUID_NAMESPACE_PATTERN.test(namespace)) {
    throw new Error("L’espace de stockage de l’image est invalide.");
  }
  const ext = getSafeUploadExtension(file, IMAGE_MIME_EXTENSIONS);
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${namespace}/${id}.${ext}`;
}

export default function ImageUpload({
  value,
  onChange,
  label = "Image",
  bucket = "images",
  pathPrefix,
  className = "",
  showUrlInput = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error("Vous devez sélectionner une image.");
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error("Connexion requise pour uploader une image.");
      }

      const sourceFile = event.target.files[0];
      const file = await optimizeImageUpload(sourceFile);
      assertSafeFileUpload(file, {
        allowedMimeTypes: IMAGE_MIME_EXTENSIONS,
        maxBytes: MAX_IMAGE_UPLOAD_BYTES,
        label: "Image optimisée",
      });
      const filePath = createImagePath(pathPrefix || userData.user.id, file);
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      onChange(data.publicUrl, { storageBucket: bucket, storagePath: filePath });
      toast({ title: "Succès", description: "Image uploadée avec succès !" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur d'upload";
      toast({ title: "Erreur d'upload", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleManualUrlBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const rawValue = event.target.value.trim();
    if (!rawValue) {
      onChange("");
      return;
    }

    const normalized = normalizePublicImageUrl(rawValue, "");
    if (!normalized) {
      toast({
        title: "URL invalide",
        description: "Utilisez une URL HTTPS ou une image locale de l'application.",
        variant: "destructive",
      });
      onChange("");
      return;
    }

    onChange(normalized);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <Label>{label}</Label>
      <div className="flex flex-col gap-4">
        {value ? (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border bg-muted">
            <img
              src={getOptimizedImageUrl(normalizePublicImageUrl(value), "card")}
              alt={`Aperçu — ${label}`}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={() => onChange("")}
              aria-label="Supprimer l’image sélectionnée"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full aspect-video border-2 border-dashed rounded-lg bg-muted/50 transition-colors hover:bg-muted">
            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground font-medium">Cliquez pour uploader</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP ou GIF</p>
                  </>
                )}
              </div>
              <Input
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        )}
        {showUrlInput ? (
          <Input
            placeholder="Ou collez l'URL HTTPS d'une image ici..."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={handleManualUrlBlur}
            disabled={uploading}
          />
        ) : null}
      </div>
    </div>
  );
}
