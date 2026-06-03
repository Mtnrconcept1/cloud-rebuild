import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import TokAiPhotoStudio from "@/components/dashboard/TokAiPhotoStudio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { downloadImageWithWatermark } from "@/lib/media/downloadImageWithWatermark";
import { deleteRestaurantMedia, setRestaurantCoverMedia } from "@/lib/restaurantMediaGovernance";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import ImageUpload from "@/components/ImageUpload";
import { Star, Trash2, Pencil, Image as ImageIcon, Sparkles, Download, Maximize2 } from "lucide-react";

const supabase = getSupabase();
const TOK_LOGO_SRC = "/logo-watermark.png";

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

function TokGalleryWatermark({ className = "", sizeClassName = "h-[180px] w-[180px]" }: { className?: string; sizeClassName?: string }) {
  return (
    <div
      className={`pointer-events-none absolute left-3 top-3 z-10 drop-shadow-[0_10px_24px_rgba(0,0,0,0.30)] ${className}`}
      aria-hidden="true"
      data-testid="tok-gallery-watermark-layer"
    >
      <img src={TOK_LOGO_SRC} alt="" className={`${sizeClassName} object-contain`} draggable={false} />
    </div>
  );
}

function TokGalleryImageFrame({ item }: { item: MediaItem }) {
  return (
    <div
      className="relative inline-flex max-h-full max-w-full items-center justify-center"
      data-testid="tok-gallery-image-frame"
    >
      <TokGalleryWatermark className="left-4 top-4" />
      <img
        src={item.media_url}
        alt={item.alt_text || "Photo restaurant"}
        className="block max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  );
}

export default function DashboardPhotos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedId, loading: loadingRestaurant } = useDashboardRestaurant();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [form, setForm] = useState<MediaFormState>(EMPTY_MEDIA_FORM);

  const load = async () => {
    if (!selectedId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurant_media")
      .select("id, restaurant_id, media_url, alt_text, media_type, is_cover, position, storage_bucket, storage_path, created_at")
      .eq("restaurant_id", selectedId)
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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !form.media_url.trim()) {
      return toast({ title: "Validation", description: "L'URL de l'image est requise.", variant: "destructive" });
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
    const { error } = editingId
      ? await supabase.from("restaurant_media").update(payload).eq("id", editingId)
      : await supabase.from("restaurant_media").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Photo mise à jour" : "Photo ajoutée" });
    setEditingId(null);
    setForm(EMPTY_MEDIA_FORM);
    load();
  };

  const setCover = async (id: string) => {
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
        watermarkUrl: TOK_LOGO_SRC,
        watermarkSize: 180,
        watermarkMargin: 24,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Le logo TOK n'a pas pu être appliqué au téléchargement.";
      toast({
        title: "Téléchargement impossible",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Media restaurant"
          title="Galerie photos"
          description="Préparez la couverture, les photos de plats et les visuels marketing TOK du restaurant. Le Studio IA transforme une photo simple en image premium cohérente avec la ligne graphique TOK."
          icon={ImageIcon}
          tone="sky"
          visualLabel="Galerie"
          stats={[
            { label: "Photos", value: items.length, icon: ImageIcon },
            { label: "Couverture", value: items.some((item) => item.is_cover) ? "Définie" : "À choisir", icon: Star },
            { label: "Studio IA", value: "TOK", icon: Sparkles },
          ]}
        />

        <TokAiPhotoStudio
          restaurantId={selectedId}
          userId={user?.id || null}
          currentPhotoCount={items.length}
          onGalleryUpdated={load}
        />

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
                <ImageUpload
                  label="Image"
                  value={form.media_url}
                  onChange={(url, metadata) => setForm((v) => ({
                    ...v,
                    media_url: url,
                    storage_bucket: metadata?.storageBucket ?? null,
                    storage_path: metadata?.storagePath ?? null,
                  }))}
                  showUrlInput={false}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Enregistrer</Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_MEDIA_FORM); }}>
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {loadingRestaurant || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {error ? <p className="text-destructive">Erreur: {error}</p> : null}
        {!loading && !error && !items.length ? (
          <div className="text-center py-12 space-y-2">
            <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Aucune photo dans la galerie</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="relative">
                <TokGalleryWatermark sizeClassName="h-14 w-14" />
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
                  <div className="absolute left-14 top-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
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
                {item.alt_text && <p className="text-sm text-muted-foreground">{item.alt_text}</p>}
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
          ))}
        </div>

        <Dialog open={Boolean(previewItem)} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
          <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[92vh] sm:max-h-[92vh]">
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <DialogTitle>{previewItem?.alt_text || "Photo de galerie"}</DialogTitle>
                  <DialogDescription>Prévisualisation grand format de l'image ajoutée à la galerie.</DialogDescription>
                </div>
                {previewItem ? (
                  <Button type="button" variant="outline" onClick={() => downloadPhoto(previewItem)} className="gap-2">
                    <Download className="h-4 w-4" />
                    Télécharger
                  </Button>
                ) : null}
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 bg-black p-3 sm:p-5">
              {previewItem ? (
                <div className="flex h-full w-full items-center justify-center">
                  <TokGalleryImageFrame item={previewItem} />
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
