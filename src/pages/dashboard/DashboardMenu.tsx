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
import { BookOpen, CheckCircle2, Image as ImageIcon, Images, Loader2, Pencil, Plus, ScanLine, Sparkles, Trash2, Upload } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import type { TokImageGenerationResult } from "@/lib/ai/tokAiClient";
import {
  requestAiCreationNotificationPermission,
  setActiveAiCreationContext,
  startTokImageCreationJob,
} from "@/lib/ai/aiCreationJobs";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
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

type ImportedMenuItem = {
  name: string;
  description: string;
  price: number;
  category: string;
  selected: boolean;
};

type MenuImportResponse = {
  items: Array<Omit<ImportedMenuItem, "selected">>;
  warnings: string[];
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
  if (message.includes("ai_credits_exhausted")) return "Solde de crédits TOK insuffisant. Rechargez vos crédits ou attendez le prochain renouvellement de votre abonnement.";
  return message || "Génération impossible";
}

export default function DashboardMenu() {
  const { selectedId } = useDashboardRestaurant();
  const commercialDemoFrame = useCommercialDemoFrame();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyItem);
  const [categoryMode, setCategoryMode] = useState<"preset" | "custom">("preset");
  const [generatingPhoto, setGeneratingPhoto] = useState(false);
  const [photoStudioResult, setPhotoStudioResult] = useState<TokImageGenerationResult | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [menuImportFiles, setMenuImportFiles] = useState<File[]>([]);
  const [importedMenuItems, setImportedMenuItems] = useState<ImportedMenuItem[]>([]);
  const [menuImportWarnings, setMenuImportWarnings] = useState<string[]>([]);
  const [analyzingMenu, setAnalyzingMenu] = useState(false);
  const [savingImportedMenu, setSavingImportedMenu] = useState(false);
  const menuImportInputRef = useRef<HTMLInputElement | null>(null);
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
    if (commercialDemoFrame?.surface === "restaurant") {
      toast({
        title: "Studio photo en mode démonstration",
        description: "La génération est simulée ici afin de ne consommer aucun crédit ni API payante.",
      });
      return;
    }
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

  const openMenuImport = () => {
    setMenuImportFiles([]);
    setImportedMenuItems([]);
    setMenuImportWarnings([]);
    setImportDialogOpen(true);
  };

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("image_read_failed"));
    reader.onerror = () => reject(new Error("image_read_failed"));
    reader.readAsDataURL(file);
  });

  const handleMenuImportFiles = (files: FileList | null) => {
    const selected = Array.from(files || []).filter((file) => /^image\/(jpeg|png|webp)$/i.test(file.type)).slice(0, 3);
    if (!selected.length) {
      toast({ title: "Photos requises", description: "Utilisez jusqu'à 3 images JPG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    setMenuImportFiles(selected);
    setImportedMenuItems([]);
    setMenuImportWarnings([]);
  };

  const analyzeMenuPhotos = async () => {
    if (!restaurant || !menuImportFiles.length) return;
    if (commercialDemoFrame?.surface === "restaurant") {
      toast({
        title: "Analyse de menu en mode démonstration",
        description: "L’analyse IA est simulée ici afin de ne consommer aucun crédit ni API payante.",
      });
      return;
    }
    setAnalyzingMenu(true);
    setImportedMenuItems([]);
    setMenuImportWarnings([]);

    try {
      const images = await Promise.all(menuImportFiles.map(async (file) => {
        const optimized = await optimizeImageUpload(file);
        return fileToDataUrl(optimized);
      }));
      const { data, error } = await supabase.functions.invoke<MenuImportResponse>("menu-image-import", {
        body: { restaurantId: restaurant.id, images },
      });
      if (error) throw error;
      if (!data?.items?.length) throw new Error("Aucun plat détecté sur les photos.");

      setImportedMenuItems(data.items.map((item) => ({
        name: item.name,
        description: item.description || "",
        price: Number(item.price) || 0,
        category: item.category || "Autres",
        selected: true,
      })));
      setMenuImportWarnings(data.warnings || []);
      toast({ title: "Menu analysé", description: `${data.items.length} élément(s) détecté(s). Vérifiez-les avant l'import.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analyse impossible";
      toast({ title: "Analyse impossible", description: message, variant: "destructive" });
    } finally {
      setAnalyzingMenu(false);
    }
  };

  const updateImportedMenuItem = (index: number, patch: Partial<ImportedMenuItem>) => {
    setImportedMenuItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const saveImportedMenu = async () => {
    if (!restaurant) return;
    const selectedItems = importedMenuItems
      .filter((item) => item.selected && item.name.trim() && Number.isFinite(item.price) && item.price >= 0)
      .map((item) => ({
        restaurant_id: restaurant.id,
        name: item.name.trim(),
        description: item.description.trim(),
        price: Math.round(item.price * 100) / 100,
        category: item.category.trim() || "Autres",
        image_url: "",
        is_available: true,
      }));

    if (!selectedItems.length) {
      toast({ title: "Aucun plat sélectionné", description: "Sélectionnez au moins un élément valide.", variant: "destructive" });
      return;
    }

    setSavingImportedMenu(true);
    const { error } = await supabase.from("menu_items").insert(selectedItems);
    setSavingImportedMenu(false);
    if (error) {
      toast({ title: "Import impossible", description: error.message, variant: "destructive" });
      return;
    }

    refreshMenu();
    setImportDialogOpen(false);
    toast({ title: "Menu créé", description: `${selectedItems.length} élément(s) ajouté(s) au menu.` });
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={openMenuImport} disabled={!restaurant}>
                <ScanLine className="mr-2 h-4 w-4" />
                Importer une photo du menu
              </Button>
              <Button onClick={openNew} disabled={!restaurant}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un plat
              </Button>
            </div>
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

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Créer le menu depuis des photos</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-2xl border border-dashed bg-muted/30 p-5 text-center">
                <input
                  ref={menuImportInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event) => handleMenuImportFiles(event.target.files)}
                />
                <Upload className="mx-auto mb-3 h-9 w-9 text-primary" />
                <p className="font-semibold">Photographiez chaque page bien à plat et sans reflet</p>
                <p className="mt-1 text-sm text-muted-foreground">Jusqu'à 3 photos JPG, PNG ou WebP. Les plats ne sont créés qu'après votre validation.</p>
                <Button className="mt-4" variant="outline" onClick={() => menuImportInputRef.current?.click()}>
                  Choisir les photos
                </Button>
                {menuImportFiles.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {menuImportFiles.map((file) => (
                      <span key={file.name} className="max-w-full truncate rounded-full bg-background px-3 py-1 text-xs">
                        {file.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={analyzeMenuPhotos} disabled={!menuImportFiles.length || analyzingMenu}>
                {analyzingMenu ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
                {analyzingMenu ? "Lecture du menu en cours…" : "Analyser les photos"}
              </Button>

              {menuImportWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-semibold">Points à vérifier</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {menuImportWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}

              {importedMenuItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <p className="font-semibold">{importedMenuItems.length} élément(s) détecté(s) — corrigez avant d'enregistrer</p>
                  </div>
                  {importedMenuItems.map((item, index) => (
                    <div key={`${index}-${item.name}`} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[auto_1.4fr_0.8fr_0.55fr] ${item.selected ? "bg-card" : "opacity-55"}`}>
                      <input
                        type="checkbox"
                        aria-label={`Importer ${item.name}`}
                        checked={item.selected}
                        onChange={(event) => updateImportedMenuItem(index, { selected: event.target.checked })}
                        className="mt-3 h-4 w-4"
                      />
                      <div className="space-y-2">
                        <Input value={item.name} onChange={(event) => updateImportedMenuItem(index, { name: event.target.value })} placeholder="Nom du plat" />
                        <Textarea value={item.description} onChange={(event) => updateImportedMenuItem(index, { description: event.target.value })} placeholder="Description (facultative)" rows={2} />
                      </div>
                      <Input value={item.category} onChange={(event) => updateImportedMenuItem(index, { category: event.target.value })} placeholder="Catégorie" />
                      <Input type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateImportedMenuItem(index, { price: Number(event.target.value) })} aria-label={`Prix de ${item.name}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Annuler</Button>
              <Button onClick={saveImportedMenu} disabled={!importedMenuItems.some((item) => item.selected) || savingImportedMenu}>
                {savingImportedMenu && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ajouter les plats sélectionnés
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectDishImage(item.media_url)}
                              className={`group relative overflow-hidden rounded-lg border bg-background text-left transition ${selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/60"}`}
                              aria-pressed={selected}
                            >
                              <img src={item.media_url} alt={item.alt_text || "Photo de galerie"} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
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
