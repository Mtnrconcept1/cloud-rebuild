import { type CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import IllustratedActionCard from "@/components/dashboard/IllustratedActionCard";
import { DASHBOARD_ILLUSTRATIONS, type DashboardIllustration } from "@/lib/dashboardIllustrations";
import AiCreationsGallery from "@/components/dashboard/AiCreationsGallery";
import TokAiMarketingStudio from "@/components/dashboard/TokAiMarketingStudio";
import TokAiPhotoStudio from "@/components/dashboard/TokAiPhotoStudio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import {
  getRestaurantMediaAiToolLabel,
  isTokProOrHigherRestaurantSubscription,
  normalizeTokImageQuality,
  shouldApplyTokWatermarkToRestaurantMedia,
  type RestaurantMediaWatermarkSubscription,
} from "@/lib/ai/restaurantMediaMetadata";
import { downloadImageWithWatermark } from "@/lib/media/downloadImageWithWatermark";
import { deleteRestaurantMedia, setRestaurantCoverMedia } from "@/lib/restaurantMediaGovernance";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import ImageUpload from "@/components/ImageUpload";
import {
  ArrowLeft,
  Camera,
  History,
  Images,
  ImagePlus,
  Star,
  Trash2,
  Pencil,
  Image as ImageIcon,
  Sparkles,
  Download,
  Maximize2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  getCommercialDemoVisualHistory,
  type CommercialDemoAiRuntime,
  type CommercialDemoVisualHistoryItem,
} from "@/lib/commercialDemoAi";
import { readCommercialDemoToolState, writeCommercialDemoToolState } from "@/lib/commercialDemoRestaurantTools";

const supabase = getSupabase();

type MediaItem = {
  id: string;
  restaurant_id: string;
  media_url: string;
  alt_text: string | null;
  media_type: string;
  is_cover: boolean;
  position: number;
  storage_bucket: string | null;
  storage_path: string | null;
  metadata: Json | null;
  created_at: string;
};

type MediaFormState = {
  media_url: string;
  alt_text: string;
  media_type: string;
  storage_bucket: string | null;
  storage_path: string | null;
};

const EMPTY_MEDIA_FORM: MediaFormState = {
  media_url: "",
  alt_text: "",
  media_type: "photo",
  storage_bucket: null,
  storage_path: null,
};

const GALLERY_MEDIA_TYPES = ["photo", "photo_ai_tok"];
const TOK_GALLERY_WATERMARK_SIZE = 180;
const TOK_GALLERY_WATERMARK_MARGIN = 24;
const COMMERCIAL_DEMO_SIGNED_IMAGE_PATH = "/storage/v1/object/sign/commercial-demo-ai/";

function getCommercialDemoGenerationId(item: MediaItem) {
  if (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)) return null;
  const generationId = (item.metadata as Record<string, Json | undefined>).generation_id;
  return typeof generationId === "string" ? generationId : null;
}

function sanitizeCommercialDemoGalleryForStorage(items: MediaItem[]) {
  return items
    .filter((item) => !item.media_url.startsWith("blob:"))
    .map((item) => (
      item.media_url.includes(COMMERCIAL_DEMO_SIGNED_IMAGE_PATH)
        ? { ...item, media_url: "" }
        : item
    ));
}

type PhotoWorkspaceTool = "marketing" | "photopro" | "add_photo" | "gallery" | "creations";

const PHOTO_WORKSPACE_TOOLS: Array<{
  id: PhotoWorkspaceTool;
  title: string;
  description: string;
  icon: LucideIcon;
  illustration: DashboardIllustration;
}> = [
  {
    id: "marketing",
    title: "Marketing Studio",
    description: "Créer des visuels marketing cohérents avec vos ressources de marque.",
    icon: Sparkles,
    illustration: DASHBOARD_ILLUSTRATIONS.photoMarketing,
  },
  {
    id: "photopro",
    title: "Photopro",
    description: "Retoucher une photo culinaire et l'ajouter à la galerie.",
    icon: Camera,
    illustration: DASHBOARD_ILLUSTRATIONS.photoPro,
  },
  {
    id: "add_photo",
    title: "Ajouter une photo à la galerie",
    description: "Importer directement une image depuis votre appareil.",
    icon: ImagePlus,
    illustration: DASHBOARD_ILLUSTRATIONS.photoAdd,
  },
  {
    id: "gallery",
    title: "Galerie",
    description: "Gérer les photos visibles sur la fiche restaurant.",
    icon: Images,
    illustration: DASHBOARD_ILLUSTRATIONS.photoGallery,
  },
  {
    id: "creations",
    title: "Mes créations",
    description: "Retrouver les générations IA et les ajouter à la galerie.",
    icon: History,
    illustration: DASHBOARD_ILLUSTRATIONS.photoCreations,
  },
];

const PHOTO_TOOL_HEADINGS: Record<PhotoWorkspaceTool, { title: string; description: string }> = {
  marketing: {
    title: "Marketing Studio",
    description: "Générez un visuel marketing final depuis vos supports, ressources de marque et brief.",
  },
  photopro: {
    title: "Photopro",
    description: "Améliorez une photo culinaire puis publiez-la dans la galerie du restaurant.",
  },
  add_photo: {
    title: "Ajouter une photo à la galerie",
    description: "Ajoutez une photo existante sans passer par les outils IA.",
  },
  gallery: {
    title: "Galerie",
    description: "Organisez les photos, choisissez la couverture et prévisualisez les visuels.",
  },
  creations: {
    title: "Mes créations",
    description: "Suivez les générations IA terminées ou en cours, puis publiez les meilleurs visuels dans la galerie.",
  },
};

function buildGalleryPhotoDownloadFileName(item: MediaItem) {
  const label = item.alt_text || item.media_type || "photo-restaurant";
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${normalized || "photo-restaurant"}-${item.id.slice(0, 8)}.png`;
}

function readMediaMetadata(item: MediaItem) {
  return item.metadata && !Array.isArray(item.metadata) && typeof item.metadata === "object"
    ? item.metadata as Record<string, Json | undefined>
    : {};
}

function readMetadataString(item: MediaItem, key: string) {
  const value = readMediaMetadata(item)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatGalleryDateTime(value: string | null | undefined) {
  if (!value) return "Non renseignée";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non renseignée";

  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getGalleryAiDescription(item: MediaItem) {
  const metadata = readMediaMetadata(item);
  const metadataToolLabel = typeof metadata.tool_label === "string" && metadata.tool_label.trim() ? metadata.tool_label.trim() : null;
  const model = readMetadataString(item, "ai_model") || readMetadataString(item, "model");
  const quality =
    normalizeTokImageQuality(readMetadataString(item, "output_quality")) ||
    normalizeTokImageQuality(readMetadataString(item, "requested_output_quality")) ||
    normalizeTokImageQuality(readMetadataString(item, "image_quality"));
  const dishName =
    readMetadataString(item, "dish_name") ||
    readMetadataString(item, "dishName") ||
    item.alt_text ||
    "Non renseigné";
  const createdAt = readMetadataString(item, "generated_at") || item.created_at;
  const tool = readMetadataString(item, "tool");

  return {
    dishName,
    model: model || (item.media_type === "photo_ai_tok" ? "Non renseigné" : null),
    quality: quality || (item.media_type === "photo_ai_tok" ? "Non renseignée" : null),
    createdAt: formatGalleryDateTime(createdAt),
    tool: tool ? getRestaurantMediaAiToolLabel(tool) : metadataToolLabel || getRestaurantMediaAiToolLabel(null),
  };
}

function getPreviewWatermarkStyle(imageSize: { width: number; height: number } | null): CSSProperties | undefined {
  if (!imageSize?.width || !imageSize.height) return undefined;

  const minSide = Math.min(imageSize.width, imageSize.height);
  const size = Math.min(TOK_GALLERY_WATERMARK_SIZE, Math.max(56, Math.round(minSide * 0.26)));
  const margin = Math.min(TOK_GALLERY_WATERMARK_MARGIN, Math.max(12, Math.round(minSide * 0.04)));

  return {
    left: `${(margin / imageSize.width) * 100}%`,
    top: `${(margin / imageSize.height) * 100}%`,
    width: `${(size / imageSize.width) * 100}%`,
  };
}

function TokGalleryWatermark({
  className = "",
  sizeClassName = "h-[180px] w-[180px]",
  style,
}: {
  className?: string;
  sizeClassName?: string;
  style?: CSSProperties;
}) {
  const logoSrc = useTokLogoSrc();

  return (
    <div
      className={`pointer-events-none absolute left-3 top-3 z-10 drop-shadow-[0_10px_24px_rgba(0,0,0,0.30)] ${className}`}
      style={style}
      aria-hidden="true"
      data-testid="tok-gallery-watermark-layer"
    >
      <img src={logoSrc} alt="" className={style ? "h-auto w-full object-contain" : `${sizeClassName} object-contain`} draggable={false} />
    </div>
  );
}

function TokGalleryImageFrame({
  item,
  watermarkSubscription,
}: {
  item: MediaItem;
  watermarkSubscription?: RestaurantMediaWatermarkSubscription;
}) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const watermarkStyle = getPreviewWatermarkStyle(imageSize);
  const showWatermark = shouldApplyTokWatermarkToRestaurantMedia({
    mediaType: item.media_type,
    metadata: item.metadata,
    subscription: watermarkSubscription,
  });

  return (
    <div
      className="flex min-h-0 w-full items-center justify-center overflow-visible"
      data-testid="tok-gallery-image-frame"
    >
      <div
        className="relative inline-flex max-h-[calc(100dvh-12rem)] max-w-full items-center justify-center"
        data-testid="tok-gallery-image-bounds"
      >
        {showWatermark ? <TokGalleryWatermark style={watermarkStyle} /> : null}
        <img
          src={item.media_url}
          alt={item.alt_text || "Photo restaurant"}
          className="block h-auto max-h-[calc(100dvh-12rem)] w-auto max-w-full rounded-lg object-contain"
          onLoad={(event) => {
            const image = event.currentTarget;
            setImageSize({
              width: image.naturalWidth || image.width,
              height: image.naturalHeight || image.height,
            });
          }}
        />
      </div>
    </div>
  );
}

function CommercialDemoVisualGallery({
  runtime,
  onAddToGallery,
}: {
  runtime: CommercialDemoAiRuntime;
  onAddToGallery: (creation: CommercialDemoVisualHistoryItem) => void;
}) {
  const [creations, setCreations] = useState<CommercialDemoVisualHistoryItem[]>([]);
  const [loadingCreations, setLoadingCreations] = useState(true);
  const [creationError, setCreationError] = useState<string | null>(null);

  const loadCreations = useCallback(async () => {
    setLoadingCreations(true);
    setCreationError(null);
    try {
      setCreations(await getCommercialDemoVisualHistory(runtime, undefined, 60));
    } catch (loadError) {
      setCreationError(loadError instanceof Error ? loadError.message : "Historique Démo indisponible.");
    } finally {
      setLoadingCreations(false);
    }
  }, [runtime]);

  useEffect(() => {
    void loadCreations();
    const refresh = window.setInterval(() => void loadCreations(), 45 * 60 * 1000);
    return () => window.clearInterval(refresh);
  }, [loadCreations]);

  return (
    <Card className="rounded-3xl">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Créations IA Démo</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Historique OpenAI persistant de cette session · crédits Démo illimités · aucun stockage de production.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadCreations()} disabled={loadingCreations}>Actualiser</Button>
      </CardHeader>
      <CardContent>
        {loadingCreations ? (
          <p className="text-sm text-muted-foreground">Chargement des créations Démo…</p>
        ) : creationError ? (
          <p className="text-sm text-destructive">{creationError}</p>
        ) : creations.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Générez un visuel dans Marketing Studio ou Photopro pour le retrouver ici.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {creations.map((creation) => (
              <div key={creation.assetId} className="overflow-hidden rounded-2xl border bg-card">
                <img
                  src={creation.generated_image_url || creation.gallery_image_url || ""}
                  alt={creation.alt_text || "Visuel IA de démonstration"}
                  className="aspect-square w-full bg-muted object-contain"
                />
                <div className="space-y-3 p-4">
                  <div>
                    <p className="truncate text-sm font-semibold">{creation.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{creation.prompt}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-emerald-700">OpenAI réel · coût suivi en interne</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => onAddToGallery(creation)}>
                      Ajouter à la galerie Démo
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPhotos() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const { user } = useAuth();
  const { toast } = useToast();
  const logoSrc = useTokLogoSrc();
  const { restaurants, selectedId, loading: loadingRestaurant } = useDashboardRestaurant();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [form, setForm] = useState<MediaFormState>(EMPTY_MEDIA_FORM);
  const [activeTool, setActiveTool] = useState<PhotoWorkspaceTool | null>(null);
  const demoGalleryObjectUrlsRef = useRef(new Set<string>());
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const watermarkSubscription = selectedRestaurant?.restaurant_subscription
    ? {
        plan: selectedRestaurant.restaurant_subscription.plan,
        slug: selectedRestaurant.restaurant_subscription.plan_record?.slug,
        status: selectedRestaurant.restaurant_subscription.status,
      }
    : null;
  const hasWatermarkFreePlan = isTokProOrHigherRestaurantSubscription(watermarkSubscription);

  const updateCommercialDemoItems = (updater: (current: MediaItem[]) => MediaItem[]) => {
    setItems((current) => {
      const next = updater(current);
      if (isCommercialDemo && commercialDemoFrame) {
        writeCommercialDemoToolState(
          commercialDemoFrame.config.sessionId,
          "photos-gallery",
          sanitizeCommercialDemoGalleryForStorage(next),
        );
      }
      return next;
    });
  };

  const shouldShowTokWatermark = (item: MediaItem) => shouldApplyTokWatermarkToRestaurantMedia({
    mediaType: item.media_type,
    metadata: item.metadata,
    subscription: watermarkSubscription,
  });

  const load = async () => {
    if (!selectedId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    if (isCommercialDemo && commercialDemoFrame) {
      const snapshot = commercialDemoFrame.snapshot;
      const candidates = [
        snapshot.demo_restaurant.image_url ? {
          id: `restaurant-${snapshot.demo_restaurant.id}`,
          url: snapshot.demo_restaurant.image_url,
          alt: `${snapshot.demo_restaurant.name} — photo de couverture Démo`,
        } : null,
        ...snapshot.catalog_items.map((item) => item.image_url ? {
          id: `catalog-${item.id}`,
          url: item.image_url,
          alt: `${item.name} — menu du restaurant Démo`,
        } : null),
      ].filter((candidate): candidate is { id: string; url: string; alt: string } => Boolean(candidate?.url));
      const seenUrls = new Set<string>();
      const seeded = candidates.flatMap((candidate, index): MediaItem[] => {
        if (seenUrls.has(candidate.url)) return [];
        seenUrls.add(candidate.url);
        return [{
          id: `demo-media-${snapshot.session.id}-${candidate.id}`,
          restaurant_id: selectedId,
          media_url: candidate.url,
          alt_text: candidate.alt,
          media_type: "photo",
          is_cover: index === 0,
          position: index,
          storage_bucket: null,
          storage_path: null,
          metadata: { commercial_demo: true, source: "isolated_snapshot" },
          created_at: snapshot.session.created_at || new Date().toISOString(),
        }];
      });
      let demoItems = readCommercialDemoToolState<MediaItem[]>(snapshot.session.id, "photos-gallery", seeded)
        .filter((item) => !item.media_url.startsWith("blob:"));
      try {
        const creations = await getCommercialDemoVisualHistory({
          sessionId: snapshot.session.id,
          surface: "restaurant",
        }, undefined, 60);
        const byId = new Map(creations.map((creation) => [creation.assetId, creation]));
        const byCreatedAt = new Map(creations.map((creation) => [creation.created_at, creation]));
        demoItems = demoItems.flatMap((item) => {
          if (item.media_type !== "photo_ai_tok") return [item];
          const creation = (getCommercialDemoGenerationId(item) && byId.get(getCommercialDemoGenerationId(item)!))
            || byCreatedAt.get(item.created_at);
          if (!creation) {
            return item.media_url.includes(COMMERCIAL_DEMO_SIGNED_IMAGE_PATH) ? [] : [item];
          }
          const mediaUrl = creation.gallery_image_url || creation.generated_image_url;
          if (!mediaUrl) return [];
          const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
            ? item.metadata as Record<string, Json | undefined>
            : {};
          return [{
            ...item,
            media_url: mediaUrl,
            metadata: { ...metadata, generation_id: creation.assetId } as Json,
          }];
        });
        writeCommercialDemoToolState(
          snapshot.session.id,
          "photos-gallery",
          sanitizeCommercialDemoGalleryForStorage(demoItems),
        );
      } catch {
        // The dedicated creation history card exposes the retry action. Keep
        // regular local entries visible, but never render an empty signed-URL
        // placeholder when signature refresh is offline.
        demoItems = demoItems.filter((item) => item.media_url.length > 0);
      }
      setItems(demoItems);
      setError(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("restaurant_media")
      .select("id, restaurant_id, media_url, alt_text, media_type, is_cover, position, storage_bucket, storage_path, metadata, created_at")
      .eq("restaurant_id", selectedId)
      .in("media_type", GALLERY_MEDIA_TYPES)
      .order("created_at", { ascending: false })
      .order("position", { ascending: true });
    setError(error?.message || null);
    setItems((data || []) as MediaItem[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurant && selectedId) {
      setEditingId(null);
      setForm(EMPTY_MEDIA_FORM);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurant, selectedId]);

  useEffect(() => () => {
    demoGalleryObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    demoGalleryObjectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop = 0;
        document.scrollingElement.scrollLeft = 0;
      }
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);

    return () => window.cancelAnimationFrame(frame);
  }, [activeTool]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !form.media_url.trim()) {
      return toast({ title: "Validation", description: "La photo est requise.", variant: "destructive" });
    }
    const payload = {
      restaurant_id: selectedId,
      media_url: form.media_url.trim(),
      alt_text: form.alt_text.trim() || null,
      media_type: form.media_type,
      uploaded_by: user?.id || null,
      position: items.length,
      storage_bucket: form.storage_bucket,
      storage_path: form.storage_path,
    };
    if (isCommercialDemo) {
      const now = new Date().toISOString();
      updateCommercialDemoItems((current) => editingId
        ? current.map((item) => (item.id === editingId ? { ...item, ...payload } as MediaItem : item))
        : [{
            ...payload,
            id: globalThis.crypto?.randomUUID?.() || `demo-photo-${Date.now()}`,
            is_cover: current.length === 0,
            metadata: null,
            created_at: now,
          } as MediaItem, ...current]);
      toast({ title: editingId ? "Photo mise à jour dans la démonstration" : "Photo ajoutée à la galerie de démonstration" });
      setEditingId(null);
      setForm(EMPTY_MEDIA_FORM);
      setActiveTool("gallery");
      return;
    }
    const { error } = editingId
      ? await supabase.from("restaurant_media").update(payload).eq("id", editingId)
      : await supabase.from("restaurant_media").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Photo mise à jour" : "Photo ajoutée" });
    setEditingId(null);
    setForm(EMPTY_MEDIA_FORM);
    setActiveTool("gallery");
    load();
  };

  const setCover = async (id: string) => {
    if (isCommercialDemo) {
      updateCommercialDemoItems((current) => current.map((item) => ({ ...item, is_cover: item.id === id })));
      toast({ title: "Photo de couverture définie dans la démonstration" });
      return;
    }
    try {
      await setRestaurantCoverMedia(id);
      toast({ title: "Photo de couverture définie" });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de définir la couverture.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    if (isCommercialDemo) {
      const removedItem = items.find((item) => item.id === id);
      if (removedItem?.media_url.startsWith("blob:")) {
        URL.revokeObjectURL(removedItem.media_url);
        demoGalleryObjectUrlsRef.current.delete(removedItem.media_url);
      }
      updateCommercialDemoItems((current) => current.filter((item) => item.id !== id));
      if (previewItem?.id === id) setPreviewItem(null);
      toast({ title: "Photo supprimée de la démonstration" });
      return;
    }
    try {
      await deleteRestaurantMedia(id);
      if (previewItem?.id === id) setPreviewItem(null);
      toast({ title: "Photo supprimée" });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de supprimer la photo.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const downloadPhoto = async (item: MediaItem) => {
    try {
      await downloadImageWithWatermark({
        imageUrl: item.media_url,
        fileName: buildGalleryPhotoDownloadFileName(item),
        watermarkUrl: shouldShowTokWatermark(item) ? logoSrc : null,
        watermarkSize: TOK_GALLERY_WATERMARK_SIZE,
        watermarkMargin: TOK_GALLERY_WATERMARK_MARGIN,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "La photo n'a pas pu être préparée au téléchargement.";
      toast({
        title: "Téléchargement impossible",
        description: message,
        variant: "destructive",
      });
    }
  };

  const selectWorkspaceTool = (tool: PhotoWorkspaceTool) => {
    if (tool === "add_photo") {
      setEditingId(null);
      setForm(EMPTY_MEDIA_FORM);
    }
    setActiveTool(tool);
  };

  const addCommercialDemoCreationToGallery = (creation: CommercialDemoVisualHistoryItem) => {
    if (!isCommercialDemo || !commercialDemoFrame || !selectedId) return;
    const mediaUrl = creation.gallery_image_url || creation.generated_image_url;
    if (!mediaUrl) return;
    updateCommercialDemoItems((current) => {
      if (current.some((item) => item.id === `demo-generation-${creation.assetId}`)) return current;
      return [{
        id: `demo-generation-${creation.assetId}`,
        restaurant_id: selectedId,
        media_url: mediaUrl,
        alt_text: creation.alt_text || "Création IA du restaurant Démo",
        media_type: "photo_ai_tok",
        is_cover: current.length === 0,
        position: current.length,
        storage_bucket: null,
        storage_path: null,
        metadata: {
          commercial_demo: true,
          ai_model: creation.model || "openai",
          generated_at: creation.created_at,
          generation_id: creation.assetId,
          tool: creation.tool,
          credit_units: 0,
        },
        created_at: creation.created_at,
      }, ...current];
    });
    toast({ title: "Création ajoutée à la galerie Démo", description: "Aucun média de production n'a été modifié." });
  };

  const activeHeading = activeTool ? PHOTO_TOOL_HEADINGS[activeTool] : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!activeTool ? (
          <>
            <h1 className="sr-only">Photos et créations</h1>
            <section className="flex min-h-[calc(100dvh-9rem)] items-center justify-center py-8 sm:py-10">
            <div
              className="grid w-full max-w-6xl gap-4 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Outils photos du dashboard restaurateur"
            >
              {PHOTO_WORKSPACE_TOOLS.map((tool) => (
                <IllustratedActionCard
                  key={tool.id}
                  title={tool.title}
                  description={tool.description}
                  icon={tool.icon}
                  illustration={tool.illustration}
                  onClick={() => selectWorkspaceTool(tool.id)}
                  meta={tool.id === "gallery" ? (
                    <span className="inline-flex w-fit rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-200">
                      {items.length} photo{items.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                />
              ))}
            </div>
            </section>
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-3xl border border-orange-100 bg-white p-4 shadow-sm dark:bg-background sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTool(null)}
                className="mb-3 gap-2 rounded-2xl"
              >
                <ArrowLeft className="h-4 w-4" />
                Photos
              </Button>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">{activeHeading?.title}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{activeHeading?.description}</p>
            </div>
          </div>
        )}

        {activeTool === "marketing" ? <TokAiMarketingStudio restaurantId={selectedId} /> : null}

        {activeTool === "photopro" ? (
          <TokAiPhotoStudio
            restaurantId={selectedId}
            userId={user?.id || null}
            currentPhotoCount={items.length}
            watermarkSubscription={watermarkSubscription}
            onGalleryUpdated={load}
          />
        ) : null}

        {activeTool === "creations" ? (
          isCommercialDemo && commercialDemoFrame ? (
            <CommercialDemoVisualGallery
              runtime={{ sessionId: commercialDemoFrame.config.sessionId, surface: "restaurant" }}
              onAddToGallery={addCommercialDemoCreationToGallery}
            />
          ) : (
            <AiCreationsGallery
              restaurantId={selectedId}
              userId={user?.id || null}
              currentPhotoCount={items.length}
              watermarkSubscription={watermarkSubscription}
              onGalleryUpdated={load}
            />
          )
        ) : null}

        {activeTool === "add_photo" ? (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Modifier" : "Ajouter"} une photo</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
              <div className="space-y-2">
                <Label>Texte alternatif</Label>
                <Input
                  value={form.alt_text}
                  onChange={(e) => setForm((v) => ({ ...v, alt_text: e.target.value }))}
                  placeholder="Description de l'image"
                />
              </div>
              <div className="md:col-span-2">
                {isCommercialDemo ? (
                  <div className="space-y-2 rounded-2xl border border-dashed p-4">
                    <Label htmlFor="commercial-demo-gallery-file">Image Démo</Label>
                    <Input
                      id="commercial-demo-gallery-file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const url = URL.createObjectURL(file);
                        demoGalleryObjectUrlsRef.current.add(url);
                        setForm((current) => ({
                          ...current,
                          media_url: url,
                          storage_bucket: null,
                          storage_path: null,
                        }));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Le fichier reste dans cette fenêtre Démo et n'est jamais envoyé au Storage de production.</p>
                  </div>
                ) : (
                  <ImageUpload
                    label="Image"
                    value={form.media_url}
                    bucket="restaurant-images"
                    pathPrefix={selectedId}
                    onChange={(url, metadata) => setForm((v) => ({
                      ...v,
                      media_url: url,
                      storage_bucket: metadata?.storageBucket ?? null,
                      storage_path: metadata?.storagePath ?? null,
                    }))}
                    showUrlInput={false}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit">Enregistrer</Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_MEDIA_FORM); setActiveTool("gallery"); }}>
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
        ) : null}

        {activeTool === "gallery" ? (
          <div className="space-y-5">
        {loadingRestaurant || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {error ? <p className="text-destructive">Erreur: {error}</p> : null}
        {!loading && !error && !items.length ? (
          <div className="text-center py-12 space-y-2">
            <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Aucune photo dans la galerie</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const aiDescription = getGalleryAiDescription(item);
            const showWatermark = shouldShowTokWatermark(item);
            return (
            <Card key={item.id} className="overflow-hidden">
              <div className="relative">
                {showWatermark ? <TokGalleryWatermark sizeClassName="h-14 w-14" /> : null}
                <button
                  type="button"
                  onClick={() => setPreviewItem(item)}
                  aria-label="Agrandir la photo de galerie"
                  className="group block h-48 w-full overflow-hidden bg-muted text-left"
                >
                  <img src={item.media_url} alt={item.alt_text || "Photo restaurant"} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
                  <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Maximize2 className="h-3.5 w-3.5" />
                    Agrandir
                  </span>
                </button>
                {item.is_cover && (
                  <div className={`absolute top-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${showWatermark ? "left-14" : "left-2"}`}>
                    <Star className="h-3 w-3" /> Couverture
                  </div>
                )}
                {item.media_type === "photo_ai_tok" ? (
                  <div className="absolute top-2 right-2 bg-orange-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> IA TOK
                  </div>
                ) : null}
              </div>
              <CardContent className="pt-3 space-y-2">
                {item.media_type === "photo_ai_tok" ? (
                  <div className="space-y-1 rounded-2xl border border-orange-100 bg-orange-50/60 p-3 text-xs leading-5 text-orange-950">
                    <p className="text-sm font-semibold text-foreground">{aiDescription.dishName}</p>
                    <p><span className="font-medium">Logo TOK:</span> {showWatermark ? "appliqué au téléchargement" : hasWatermarkFreePlan ? "retiré avec Tok Pro ou plus" : "non appliqué"}</p>
                    <p><span className="font-medium">Modèle IA:</span> {aiDescription.model}</p>
                    <p><span className="font-medium">Résolution:</span> {aiDescription.quality}</p>
                    <p><span className="font-medium">Créée le:</span> {aiDescription.createdAt}</p>
                    <p><span className="font-medium">Outil:</span> {aiDescription.tool}</p>
                  </div>
                ) : item.alt_text ? (
                  <p className="text-sm text-muted-foreground">{item.alt_text}</p>
                ) : null}
                <div className="flex gap-2 flex-wrap">
                  {!item.is_cover && (
                    <Button size="sm" variant="outline" onClick={() => setCover(item.id)}>
                      <Star className="h-3 w-3 mr-1" /> Couverture
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingId(item.id);
                    setForm({
                      media_url: item.media_url,
                      alt_text: item.alt_text || "",
                      media_type: item.media_type,
                      storage_bucket: item.storage_bucket,
                      storage_path: item.storage_path,
                    });
                    setActiveTool("add_photo");
                  }}>
                    <Pencil className="h-3 w-3 mr-1" /> Éditer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPhoto(item)}>
                    <Download className="h-3 w-3 mr-1" /> Télécharger
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(item.id)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
          </div>
        ) : null}

        <Dialog open={Boolean(previewItem)} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
          <DialogContent className="!flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[min(96rem,calc(100vw-1rem))] flex-col gap-0 !overflow-hidden !p-0 sm:h-[92vh] sm:max-h-[92vh]">
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <DialogTitle>{previewItem?.alt_text || "Photo de galerie"}</DialogTitle>
                  <DialogDescription>
                    {previewItem?.media_type === "photo_ai_tok"
                      ? `${getGalleryAiDescription(previewItem).dishName} - ${getGalleryAiDescription(previewItem).tool}, ${getGalleryAiDescription(previewItem).model || "modèle non renseigné"}, résolution ${getGalleryAiDescription(previewItem).quality || "non renseignée"}, créée le ${getGalleryAiDescription(previewItem).createdAt}.`
                      : "Prévisualisation grand format de l'image ajoutée à la galerie."}
                  </DialogDescription>
                </div>
                {previewItem ? (
                  <Button type="button" variant="outline" onClick={() => downloadPhoto(previewItem)} className="gap-2">
                    <Download className="h-4 w-4" />
                    Télécharger
                  </Button>
                ) : null}
              </div>
            </DialogHeader>
            <div data-dialog-scroll-area className="min-h-0 flex-1 overflow-auto bg-black p-2 sm:p-3">
              {previewItem ? (
                <div className="flex min-h-full w-full items-center justify-center">
                  <TokGalleryImageFrame item={previewItem} watermarkSubscription={watermarkSubscription} />
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
