import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import AiGenerationProgressDialog from "@/components/ui/ai-generation-progress-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Image as ImageIcon, Images, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import type { TokImageGenerationResult } from "@/lib/ai/tokAiClient";
import {
  requestAiCreationNotificationPermission,
  setActiveAiCreationContext,
  startTokImageCreationJob,
} from "@/lib/ai/aiCreationJobs";
import { toTokPublicAssetUrl } from "@/lib/securityUrls";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

type MenuItemForm = {
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  is_available: boolean;
};

type MenuItemRecord = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  image_url: string | null;
  is_available: boolean | null;
};

type RestaurantMediaRecord = {
  id: string;
  media_url: string;
  alt_text: string | null;
  media_type: string;
  is_cover: boolean | null;
  position: number | null;
  created_at: string;
};

const emptyItem = {
  name: "",
  description: "",
  price: 0,
  category: "",
  image_url: "",
  is_available: true,
} satisfies MenuItemForm;

const CUSTOM_CATEGORY_VALUE = "__custom__";
const MENU_PHOTO_STUDIO_PROMPT =
  "Crée une photo culinaire premium pour une fiche menu TOK. Le rendu doit rester appétissant, naturel, sans texte incrusté, sans logo ajouté par le modèle, avec une lumière studio propre et un cadrage centré sur le plat.";

const MENU_CATEGORY_PRESETS = [
  "Entrées",
  "Plats",
  "Plats végétariens",
  "Plats vegan",
  "Pâtes",
  "Pizzas",
  "Burgers",
  "Sandwichs",
  "Salades",
  "Soupes",
  "Accompagnements",
  "Menus enfants",
  "Formules midi",
  "Menus dégustation",
  "Desserts",
  "Glaces et sorbets",
  "Pâtisseries",
  "Boissons soft",
  "Eaux",
  "Jus et smoothies",
  "Cafés et thés",
  "Apéritifs",
  "Cocktails",
  "Mocktails",
  "Bières",
  "Vins rouges",
  "Vins blancs",
  "Vins rosés",
  "Champagnes et mousseux",
  "Spiritueux",
  "Digestifs",
  "Anti-gaspi",
  "Ventes flash",
  "Table du chef",
  "Autres",
];

function isPresetCategory(category: string) {
  return MENU_CATEGORY_PRESETS.includes(category);
}

function buildMenuPhotoStudioPrompt(form: MenuItemForm) {
  return [
    MENU_PHOTO_STUDIO_PROMPT,
    form.name.trim() ? `Plat: ${form.name.trim()}` : "",
    form.category.trim() ? `Catégorie: ${form.category.trim()}` : "",
    form.description.trim() ? `Description: ${form.description.trim()}` : "",
  ].filter(Boolean).join("\n");
}

function getPhotoGenerationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("rate_limited")) return "Trop de générations lancées. Patientez quelques minutes avant de relancer.";
  if (message.includes("Unauthorized") || message.includes("Session expir")) return "Session expirée. Reconnectez-vous puis relancez la génération.";
  if (message.includes("source_image_unsupported_type")) return "Format non pris en charge. Utilisez une photo JPG, PNG ou WebP.";
  if (message.includes("source_image_too_large")) return "Photo trop lourde pour la retouche IA. Utilisez une image plus légère.";
  if (message.includes("ai_credits_exhausted")) return "Crédit IA indisponible pour le moment.";
  return message || "Génération impossible";
}

export default function DashboardMenu() {
  const { selectedId } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyItem);
  const [categoryMode, setCategoryMode] = useState<"preset" | "custom">("preset");
  const [generatingPhoto, setGeneratingPhoto] = useState(false);
  const [photoStudioResult, setPhotoStudioResult] = useState<TokImageGenerationResult | null>(null);
  const mountedRef = useRef(true);

  const restaurant = selectedId ? { id: selectedId } : null;

  useEffect(() => {
    setActiveAiCreationContext("dashboard-menu:photo-studio");
    return () => setActiveAiCreationContext(null);
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const { data: items } = useQuery<MenuItemRecord[]>({
    queryKey: ["my-menu-items", restaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .order("category")
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: galleryItems = [], isLoading: galleryLoading } = useQuery<RestaurantMediaRecord[]>({
    queryKey: ["restaurant-media-picker", restaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_media")
        .select("id, media_url, alt_text, media_type, is_cover, position, created_at")
        .eq("restaurant_id", restaurant!.id)
        .in("media_type", ["photo", "photo_ai_tok"])
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(24);

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurant && dialogOpen,
  });

  const openNew = () => {
    setEditingId(null);
    setForm(emptyItem);
    setCategoryMode("preset");
    setPhotoStudioResult(null);
    setGeneratingPhoto(false);
    setDialogOpen(true);
  };

  const openEdit = (item: MenuItemRecord) => {
    setEditingId(item.id);
    const category = item.category || "";
    setForm({
      name: item.name,
      description: item.description || "",
      price: Number(item.price),
      category,
      image_url: item.image_url || "",
      is_available: item.is_available,
    });
    setCategoryMode(category && !isPresetCategory(category) ? "custom" : "preset");
    setPhotoStudioResult(null);
    setGeneratingPhoto(false);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setPhotoStudioResult(null);
      setGeneratingPhoto(false);
    }
  };

  const refreshMenu = () => {
    if (!restaurant) return;
    queryClient.invalidateQueries({ queryKey: ["my-menu-items", restaurant.id] });
  };

  const handleSave = async () => {
    if (!restaurant) return;

    if (editingId) {
      const { error } = await supabase
        .from("menu_items")
        .update(form)
        .eq("id", editingId)
        .eq("restaurant_id", restaurant.id);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase.from("menu_items").insert({ ...form, restaurant_id: restaurant.id });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
    }

    toast({ title: editingId ? "Plat mis à jour" : "Plat ajoute" });
    setDialogOpen(false);
    refreshMenu();
  };

  const handleDelete = async (id: string) => {
    if (!restaurant) return;

    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurant.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    refreshMenu();
    toast({ title: "Plat supprime" });
  };

  const toggleAvailability = async (id: string, current: boolean) => {
    if (!restaurant) return;

    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: !current })
      .eq("id", id)
      .eq("restaurant_id", restaurant.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    refreshMenu();
  };

  const selectDishImage = (imageUrl: string) => {
    setForm((previous) => ({ ...previous, image_url: imageUrl }));
    setPhotoStudioResult(null);
  };

  const generateMenuPhoto = async () => {
    if (!restaurant) return;
    if (!form.name.trim() && !form.image_url.trim()) {
      toast({
        title: "Nom ou photo requis",
        description: "Ajoutez un nom de plat ou une photo source avant de lancer le studio.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingPhoto(true);
    setPhotoStudioResult(null);
    try {
      void requestAiCreationNotificationPermission();
      const { promise } = startTokImageCreationJob({
        restaurantId: restaurant.id,
        tool: "menu_photo",
        title: form.name.trim() || "Photo de plat",
        request: {
          restaurantId: restaurant.id,
          sourceImageUrl: form.image_url.trim() || null,
          dishName: form.name.trim() || null,
          prompt: buildMenuPhotoStudioPrompt(form),
          assetType: "menu_visual",
          format: "square",
          variantCount: 1,
          generateImage: true,
          imageOnly: true,
        },
      });
      const result = await promise;
      const generatedImageUrl = result.gallery_image_url || result.generated_image_url;
      if (!generatedImageUrl) throw new Error("Aucune image générée par le studio.");
      if (!mountedRef.current) return;
      setPhotoStudioResult(result);
      setForm((previous) => ({ ...previous, image_url: generatedImageUrl }));
      toast({ title: "Image générée", description: "Le visuel du studio est appliqué au plat." });
    } catch (error) {
      if (!mountedRef.current) return;
      toast({ title: "Erreur IA", description: getPhotoGenerationErrorMessage(error), variant: "destructive" });
    } finally {
      if (mountedRef.current) setGeneratingPhoto(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Carte restaurant"
          title="Menu"
          description="Organisez les plats, les prix, les photos et la disponibilité avant qu'ils apparaissent dans les parcours client."
          icon={BookOpen}
          tone="emerald"
          visualLabel="Catalogue"
          stats={[
            { label: "Plats", value: items?.length || 0, icon: BookOpen },
            { label: "Disponibles", value: items?.filter((item) => item.is_available).length || 0, icon: Plus },
            { label: "Restaurant", value: restaurant ? "Selectionne" : "Aucun", icon: BookOpen },
          ]}
          actions={(
          <Button onClick={openNew} disabled={!restaurant}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un plat
          </Button>
          )}
        />

        {!restaurant ? (
          <p className="py-8 text-center text-muted-foreground">Sélectionnez un restaurant pour gérer ses produits.</p>
        ) : (
          <div className="space-y-3">
            {items?.map((item) => (
              <div key={item.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
                {item.image_url && (
                  <img src={item.image_url} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">{item.name}</h4>
                    {item.category && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p>
                </div>
                <Switch
                  checked={item.is_available ?? true}
                  onCheckedChange={() => toggleAvailability(item.id, item.is_available ?? true)}
                />
                <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {(!items || items.length === 0) && (
              <p className="py-8 text-center text-muted-foreground">Aucun plat dans le menu</p>
            )}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-h-[min(92vh,900px)] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier le plat" : "Nouveau plat"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Prix (CHF)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select
                  value={categoryMode === "custom" ? CUSTOM_CATEGORY_VALUE : form.category}
                  onValueChange={(value) => {
                    if (value === CUSTOM_CATEGORY_VALUE) {
                      setCategoryMode("custom");
                      if (isPresetCategory(form.category)) setForm({ ...form, category: "" });
                      return;
                    }
                    setCategoryMode("preset");
                    setForm({ ...form, category: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {MENU_CATEGORY_PRESETS.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CATEGORY_VALUE}>Catégorie personnalisée</SelectItem>
                  </SelectContent>
                </Select>
                {categoryMode === "custom" ? (
                  <Input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Ex: brunch, tapas, spécialités maison..."
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-3">
                <ImageUpload
                  label="Photo du plat"
                  value={form.image_url}
                  onChange={(url) => {
                    setForm((previous) => ({ ...previous, image_url: url }));
                    setPhotoStudioResult(null);
                  }}
                  showUrlInput={false}
                />
                <Tabs defaultValue="studio" className="rounded-lg border bg-muted/30 p-3">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="studio" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Studio photo
                    </TabsTrigger>
                    <TabsTrigger value="gallery" className="gap-2">
                      <Images className="h-4 w-4" />
                      Galerie
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="studio" className="mt-3 space-y-3">
                    <div className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Studio photo TOK</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.image_url ? "La photo actuelle sert de source." : "Le nom et la description guident la génération."}
                        </p>
                      </div>
                      <Button type="button" onClick={generateMenuPhoto} disabled={!restaurant || generatingPhoto} className="shrink-0 gap-2">
                        {generatingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Générer
                      </Button>
                    </div>
                    {photoStudioResult ? (
                      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                        Image du studio appliquée au plat. Sauvegardez le produit pour la publier dans le menu.
                      </p>
                    ) : null}
                  </TabsContent>
                  <TabsContent value="gallery" className="mt-3">
                    {galleryLoading ? (
                      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Chargement de la galerie...
                      </div>
                    ) : galleryItems.length ? (
                      <div className="grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                        {galleryItems.map((item) => {
                          const selected = item.media_url === form.image_url;
                          const imageDisplayUrl = toTokPublicAssetUrl(item.media_url, item.media_url);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectDishImage(item.media_url)}
                              className={`group relative overflow-hidden rounded-lg border bg-background text-left transition ${selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/60"}`}
                              aria-pressed={selected}
                            >
                              <img src={imageDisplayUrl} alt={item.alt_text || "Photo de galerie"} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
                                <span className="line-clamp-1">{item.alt_text || (item.is_cover ? "Couverture" : "Photo galerie")}</span>
                              </div>
                              {selected ? (
                                <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                                  Choisie
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
                        <ImageIcon className="h-4 w-4" />
                        Aucune image dans la galerie du restaurant.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!restaurant}>
                Sauvegarder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AiGenerationProgressDialog
          open={generatingPhoto}
          title="Photo du plat en creation"
          description="TOK prepare une photo culinaire exploitable pour votre menu a partir du plat, de la description et de votre image source."
          status="Studio menu en cours"
          steps={["Contexte plat", "Photo culinaire", "Application au menu"]}
        />
      </div>
    </DashboardLayout>
  );
}
