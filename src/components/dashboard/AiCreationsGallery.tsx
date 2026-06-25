import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  getAiCreationImageUrl,
  getAiCreationRecords,
  markAiCreationAddedToGallery,
  subscribeAiCreationRecords,
  type AiCreationRecord,
} from "@/lib/ai/aiCreationJobs";
import { CheckCircle2, ImagePlus, Loader2, Sparkles, TriangleAlert } from "lucide-react";

const supabase = getSupabase();

type Props = {
  restaurantId: string | null | undefined;
  userId?: string | null;
  currentPhotoCount: number;
  onGalleryUpdated: () => void;
};

const TOOL_LABELS: Record<AiCreationRecord["tool"], string> = {
  marketing_studio: "Marketing Studio",
  photopro: "Photopro",
  menu_photo: "Menu",
  advisor_photo: "Assistant IA",
  unknown: "IA TOK",
};

function formatCreationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusBadge(record: AiCreationRecord) {
  if (record.status === "running") {
    return <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700"><Loader2 className="h-3 w-3 animate-spin" /> En cours</Badge>;
  }

  if (record.status === "failed") {
    return <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700"><TriangleAlert className="h-3 w-3" /> Échec</Badge>;
  }

  return <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Terminée</Badge>;
}

export default function AiCreationsGallery({ restaurantId, userId, currentPhotoCount, onGalleryUpdated }: Props) {
  const { toast } = useToast();
  const [records, setRecords] = useState<AiCreationRecord[]>(() => getAiCreationRecords());
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => subscribeAiCreationRecords(setRecords), []);

  const restaurantRecords = useMemo(() => {
    if (!restaurantId) return [];
    return records.filter((record) => record.restaurantId === restaurantId);
  }, [records, restaurantId]);

  const addCreationToGallery = async (record: AiCreationRecord) => {
    if (!restaurantId || record.status !== "completed") return;
    const imageUrl = record.result?.gallery_image_url;
    if (!imageUrl) {
      toast({
        title: "Galerie indisponible",
        description: "Cette création n'a pas d'URL publique stable. Relancez la génération avant de l'ajouter.",
        variant: "destructive",
      });
      return;
    }

    setAddingId(record.id);
    const { error } = await supabase.from("restaurant_media").insert({
      restaurant_id: restaurantId,
      media_url: imageUrl,
      alt_text: record.result?.alt_text || record.result?.title || record.title || "Création TOK",
      media_type: "photo_ai_tok",
      uploaded_by: userId || null,
      position: currentPhotoCount,
      storage_bucket: record.result?.gallery_storage_bucket,
      storage_path: record.result?.gallery_storage_path,
    });
    setAddingId(null);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    markAiCreationAddedToGallery(record.id);
    onGalleryUpdated();
    toast({ title: "Création ajoutée à la galerie" });
  };

  if (!restaurantId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sélectionnez un restaurant pour afficher ses créations IA.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="border-orange-100 bg-white shadow-sm dark:bg-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-orange-600" />
            Mes créations
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          Retrouvez ici les générations lancées depuis les outils IA. Une fois terminée, une image peut être ajoutée à la galerie publique du restaurant.
        </CardContent>
      </Card>

      {!restaurantRecords.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucune création IA pour ce restaurant.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {restaurantRecords.map((record) => {
          const imageUrl = getAiCreationImageUrl(record);
          const canAddToGallery = record.status === "completed" && Boolean(record.result?.gallery_image_url) && !record.galleryAdded;

          return (
            <Card key={record.id} className="min-w-0 overflow-hidden">
              <div className="relative aspect-[4/3] bg-muted">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={record.result?.alt_text || record.title}
                    className="h-full w-full object-contain"
                  />
                ) : record.sourceImageUrl ? (
                  <img
                    src={record.sourceImageUrl}
                    alt="Photo source"
                    className="h-full w-full object-contain opacity-60"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Sparkles className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute left-3 top-3">{getStatusBadge(record)}</div>
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{TOOL_LABELS[record.tool] || "IA TOK"}</span>
                    <span>•</span>
                    <span>{formatCreationDate(record.createdAt)}</span>
                    {record.result?.model ? (
                      <>
                        <span>•</span>
                        <span>{record.result.model}</span>
                      </>
                    ) : null}
                  </div>
                  <h3 className="mt-1 break-words text-base font-semibold text-foreground">{record.title}</h3>
                  <p className="mt-1 line-clamp-3 break-words text-sm leading-6 text-muted-foreground">{record.prompt}</p>
                </div>

                {record.errorMessage ? (
                  <p className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{record.errorMessage}</p>
                ) : null}

                {record.galleryAdded ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Déjà en galerie</Badge>
                ) : (
                  <Button
                    type="button"
                    onClick={() => addCreationToGallery(record)}
                    disabled={!canAddToGallery || addingId === record.id}
                    className="w-full gap-2"
                  >
                    {addingId === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Ajouter à la galerie
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
