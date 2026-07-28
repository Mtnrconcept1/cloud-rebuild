import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  deleteAiCreationRecord,
  getAiCreationImageUrl,
  getAiCreationRecords,
  markAiCreationAddedToGallery,
  subscribeAiCreationRecords,
  useAiCreationRecovery,
  type AiCreationRecord,
} from "@/lib/ai/aiCréationJobs";
import {
  buildRestaurantMediaAiMetadata,
  shouldApplyTokWatermarkToRestaurantMedia,
  type RestaurantMediaWatermarkSubscription,
} from "@/lib/ai/restaurantMediaMetadata";
import { formatAiImageGenerationError, toPublicErrorMessage } from "@/lib/publicErrorMessages";
import { CheckCircle2, ImagePlus, Loader2, Maximize2, Sparkles, Trash2, TriangleAlert } from "lucide-react";

const supabase = getSupabase();

type Props = {
  restaurantId: string | null | undefined;
  userId?: string | null;
  currentPhotoCount: number;
  watermarkSubscription?: RestaurantMediaWatermarkSubscription;
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

export default function AiCreationsGallery({ restaurantId, userId, currentPhotoCount, watermarkSubscription, onGalleryUpdated }: Props) {
  const { toast } = useToast();
  const [records, setRecords] = useState<AiCreationRecord[]>(() => getAiCréationRecords());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<AiCreationRecord | null>(null);

  useEffect(() => subscribeAiCreationRecords(setRecords), []);

  // Leaving the app aborts an in-flight generation, but the Edge Function still
  // stores the visual and charges the credits. Re-attach those so a paid image is
  // never silently lost.
  useAiCreationRecovery(restaurantId, userId);

  const restaurantRecords = useMemo(() => {
    if (!restaurantId) return [];
    return records.filter((record) => record.restaurantId === restaurantId);
  }, [records, restaurantId]);
  const previewImageUrl = previewRecord ? getAiCreationImageUrl(previewRecord) : "";

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
      metadata: buildRestaurantMediaAiMetadata({
        result: record.result,
        dishName: record.title,
        tool: record.tool,
        createdAt: record.completedAt || record.updatedAt || record.createdAt,
        tokWatermarkRequired: shouldApplyTokWatermarkToRestaurantMedia({
          mediaType: "photo_ai_tok",
          metadata: { tool: record.tool },
          subscription: watermarkSubscription,
        }),
      }),
    });
    setAddingId(null);

    if (error) {
      toast({ title: "Erreur", description: toPublicErrorMessage(error, "Ajout à la galerie impossible. Réessayez dans quelques instants."), variant: "destructive" });
      return;
    }

    markAiCreationAddedToGallery(record.id);
    onGalleryUpdated();
    toast({ title: "Création ajoutée à la galerie" });
  };

  const deleteCreation = (record: AiCreationRecord) => {
    const deleted = deleteAiCreationRecord(record.id);
    if (!deleted) return;

    toast({
      title: "Création supprimee",
      description: record.galleryAdded
        ? "La creation est retiree de Mes creations. La photo deja ajoutee reste dans la galerie."
        : "La creation est retiree de Mes creations.",
    });
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
          const generationSeed = record.generationSeed || record.result?.generation_seed || "";

          return (
            <Card key={record.id} className="min-w-0 overflow-hidden">
              <div className="relative aspect-[4/3] bg-muted">
                {imageUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewRecord(record)}
                    className="group block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                    aria-label={`Agrandir ${record.title || "la création IA"} dans Mes créations`}
                  >
                    <img
                      src={imageUrl}
                      alt={record.result?.alt_text || record.title}
                      className="h-full w-full object-contain"
                    />
                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                      <Maximize2 className="h-3.5 w-3.5" />
                      Agrandir
                    </span>
                  </button>
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
                    {generationSeed ? (
                      <>
                        <span>&middot;</span>
                        <span>Seed {generationSeed}</span>
                      </>
                    ) : null}
                  </div>
                  <h3 className="mt-1 break-words text-base font-semibold text-foreground">{record.title}</h3>
                  <p className="mt-1 line-clamp-3 break-words text-sm leading-6 text-muted-foreground">{record.prompt}</p>
                </div>

                {record.errorMessage ? (
                  <p className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{formatAiImageGenerationError(record.errorMessage)}</p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  {record.galleryAdded ? (
                    <Badge variant="outline" className="inline-flex min-h-10 items-center justify-center border-emerald-200 bg-emerald-50 px-3 text-emerald-700">
                      Déjà en galerie
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => addCreationToGallery(record)}
                      disabled={!canAddToGallery || addingId === record.id}
                      className="min-h-10 flex-1 gap-2"
                    >
                      {addingId === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      Ajouter à la galerie
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => deleteCreation(record)}
                    disabled={addingId === record.id}
                    className="min-h-10 gap-2 border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                    aria-label={`Supprimer ${record.title} de Mes creations`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={Boolean(previewRecord && previewImageUrl)} onOpenChange={(open) => { if (!open) setPreviewRecord(null); }}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[92vh] sm:max-h-[92vh]">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
            <DialogTitle>{previewRecord?.title || "Création IA"}</DialogTitle>
            <DialogDescription>Prévisualisation grand format de la création générée depuis Mes créations.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-black p-3 sm:p-5">
            {previewRecord && previewImageUrl ? (
              <div className="flex h-full w-full items-center justify-center">
                <img
                  src={previewImageUrl}
                  alt={previewRecord.result?.alt_text || previewRecord.title || "Création IA TOK"}
                  className="block max-h-full max-w-full rounded-lg object-contain"
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
