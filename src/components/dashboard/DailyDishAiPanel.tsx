import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChefHat,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  PackageSearch,
  Plus,
  RefreshCw,
  Send,
  ShoppingBasket,
  Sparkles,
  Store,
  WandSparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  formatDailyDishError,
  generateDailyDishProposals,
  getDailyDishStatus,
  publishDailyDishProposal,
  refineDailyDishProposal,
  regenerateDailyDishProposals,
  selectDailyDishProposal,
  setDailyDishEnabled,
  type DailyDishRun,
  type DailyDishSettings,
  type DailyDishVariant,
} from "@/lib/ai/dailyDishAi";
import {
  requestAiCreationNotificationPermission,
  startTokImageCreationJob,
} from "@/lib/ai/aiCreationJobs";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";

const supabase = getSupabase();
const DEMO_STORAGE_KEY = "daily-dish-ai";
const DEMO_MENU_STORAGE_KEY = "menu-items";
const ENABLED_PLANS = new Set(["premium", "elite", "custom"]);
const MANUAL_DAILY_DISH_CATEGORY = "Plat du jour";
const PHOTOPRO_DAILY_DISH_PROMPT = `Crée une photographie culinaire premium dans l'esthétique PhotoPro TOK : lumière naturelle de studio, textures réalistes, dressage élégant mais crédible, couleurs fidèles, profondeur de champ douce et cadrage éditorial centré sur le plat. Aucun texte, aucun logo, aucune personne, aucune vaisselle incohérente et aucun ingrédient absent de la recette.`;

type MenuContextItem = {
  id?: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: number | string;
  image_url?: string | null;
  is_available?: boolean | null;
};

type MenuCacheItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  image_url: string | null;
  is_available: boolean | null;
};

type ManualDailyDishForm = {
  name: string;
  description: string;
  price: string;
  image_url: string;
};

type DemoPublishedDish = {
  name: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  service_date: string;
  actualite_body: string | null;
  published_at: string;
};

type DemoDailyDishState = {
  settings: DailyDishSettings;
  run: DailyDishRun | null;
  variants: DailyDishVariant[];
  published_dish?: DemoPublishedDish | null;
};

type Props = {
  restaurantId: string;
  planSlug?: string | null;
  menuItems: MenuContextItem[];
};

function todayInZurich() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function money(value: number) {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function createDefaultSettings(): DailyDishSettings {
  return {
    is_enabled: false,
    timezone: "Europe/Zurich",
    target_food_cost_bps: 3000,
    preferred_supplier_domains: ["aligro.ch"],
    dietary_notes: "",
  };
}

function createEmptyManualDailyDishForm(): ManualDailyDishForm {
  return {
    name: "",
    description: "",
    price: "",
    image_url: "",
  };
}

function buildDemoSeed(): DemoDailyDishState {
  return { settings: createDefaultSettings(), run: null, variants: [], published_dish: null };
}

function latestDemoState(state: DemoDailyDishState) {
  if (!state.run || state.run.generation_date === todayInZurich()) return state;
  return { ...state, run: null, variants: [] };
}

function VariantDetails({ variant }: { variant: DailyDishVariant }) {
  const dish = variant.payload;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Coût total</p>
          <p className="font-semibold">{money(dish.estimated_total_cost_chf)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Coût/portion</p>
          <p className="font-semibold">{money(dish.cost_per_portion_chf)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Food cost</p>
          <p className="font-semibold">{dish.food_cost_percent.toFixed(1)} %</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Marge estimée</p>
          <p className="font-semibold text-emerald-700">{money(dish.estimated_margin_chf)}</p>
        </div>
      </div>

      <details className="rounded-xl border bg-background p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <ShoppingBasket className="h-4 w-4 text-primary" /> Panier comparé ({dish.basket.length})
        </summary>
        <div className="mt-3 space-y-2">
          {dish.basket.map((item, index) => (
            <div key={`${item.url}-${index}`} className="grid gap-1 rounded-lg bg-muted/40 p-2 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="font-medium">{item.ingredient} · {item.product}</p>
                <p className="text-xs text-muted-foreground">
                  {item.retailer} · {item.package_size} · {money(item.package_price_chf)} · coût recette {money(item.allocated_cost_chf)}
                </p>
                {(item.availability_note || item.distance_note) && (
                  <p className="mt-1 text-xs text-muted-foreground">{[item.availability_note, item.distance_note].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Source <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-xl border bg-background p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <ChefHat className="h-4 w-4 text-primary" /> Recette complète · {dish.servings} portions
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ingrédients</p>
            <ul className="space-y-1">
              {dish.ingredients.map((item, index) => (
                <li key={`${item.name}-${index}`}>• {item.quantity} {item.unit} {item.name}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Préparation</p>
            <ol className="space-y-2">
              {dish.recipe.map((step) => (
                <li key={step.step}><span className="font-semibold">{step.step}.</span> {step.instruction} {step.minutes > 0 ? `(${step.minutes} min)` : ""}</li>
              ))}
            </ol>
          </div>
        </div>
        {dish.allergens.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Allergènes à contrôler : {dish.allergens.join(", ")}</p>}
      </details>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {dish.price_caveat}
      </div>
    </div>
  );
}

export default function DailyDishAiPanel({ restaurantId, planSlug, menuItems }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isDemo = commercialDemoFrame?.surface === "restaurant";
  const sessionId = isDemo ? commercialDemoFrame.config.sessionId : null;
  const [loading, setLoading] = useState(true);
  const [accessEnabled, setAccessEnabled] = useState(isDemo || ENABLED_PLANS.has(String(planSlug || "").toLowerCase()));
  const [settings, setSettings] = useState<DailyDishSettings>(createDefaultSettings);
  const [run, setRun] = useState<DailyDishRun | null>(null);
  const [variants, setVariants] = useState<DailyDishVariant[]>([]);
  const [generating, setGenerating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [actualiteBody, setActualiteBody] = useState("");
  const [publishActualite, setPublishActualite] = useState(true);
  const [publishedImageUrl, setPublishedImageUrl] = useState<string | null>(null);
  const [manualDishDialogOpen, setManualDishDialogOpen] = useState(false);
  const [manualDishForm, setManualDishForm] = useState<ManualDailyDishForm>(createEmptyManualDailyDishForm);
  const [savingManualDish, setSavingManualDish] = useState(false);
  const autoAttemptRef = useRef<string | null>(null);

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedId) || null,
    [selectedId, variants],
  );

  const persistDemo = useCallback((next: Partial<DemoDailyDishState>) => {
    if (!sessionId) return;
    const current = latestDemoState(readCommercialDemoToolState<DemoDailyDishState>(sessionId, DEMO_STORAGE_KEY, buildDemoSeed()));
    writeCommercialDemoToolState(sessionId, DEMO_STORAGE_KEY, { ...current, ...next });
  }, [sessionId]);

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemo && sessionId) {
        const demoState = latestDemoState(readCommercialDemoToolState<DemoDailyDishState>(sessionId, DEMO_STORAGE_KEY, buildDemoSeed()));
        setAccessEnabled(true);
        setSettings(demoState.settings);
        setRun(demoState.run);
        setVariants(demoState.variants);
        const selected = demoState.variants.find((variant) => variant.status === "selected" || variant.status === "published");
        setSelectedId(selected?.id || null);
        return;
      }
      const status = await getDailyDishStatus({ restaurant_id: restaurantId });
      setAccessEnabled(status.access.enabled);
      setSettings(status.settings);
      setRun(status.run);
      setVariants(status.variants);
      const selected = status.variants.find((variant) => variant.status === "selected" || variant.status === "published");
      setSelectedId(selected?.id || null);
    } catch (error) {
      toast({ title: "Plat du jour IA indisponible", description: formatDailyDishError(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isDemo, restaurantId, sessionId, toast]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (!selectedVariant) return;
    setPrice(selectedVariant.payload.suggested_price_chf.toFixed(2));
    setDescription(selectedVariant.payload.description);
    setActualiteBody(selectedVariant.payload.actualite_copy);
  }, [selectedVariant]);

  const generate = useCallback(async (automatic = false) => {
    if (!settings.is_enabled || generating) return;
    setGenerating(true);
    try {
      const result = await generateDailyDishProposals({
        restaurant_id: restaurantId,
        session_id: sessionId,
        demo_context: isDemo ? {
          menu: menuItems.map((item) => ({
            name: item.name,
            description: item.description || "",
            category: item.category || "",
            price_chf: Number(item.price || 0),
          })),
        } : undefined,
      });
      setRun(result.run);
      setVariants(result.variants);
      setSelectedId(null);
      if (isDemo) persistDemo({ run: result.run, variants: result.variants });
      toast({
        title: "Trois plats du jour sont prêts",
        description: "Les prix fournisseurs, le panier et les recettes ont été comparés.",
      });
    } catch (error) {
      if (!automatic || !String(error).includes("generation_in_progress")) {
        toast({ title: "Recherche impossible", description: formatDailyDishError(error), variant: "destructive" });
      }
    } finally {
      setGenerating(false);
    }
  }, [generating, isDemo, menuItems, persistDemo, restaurantId, sessionId, settings.is_enabled, toast]);

  const regenerate = useCallback(async () => {
    if (!settings.is_enabled || generating) return;
    setGenerating(true);
    try {
      const result = await regenerateDailyDishProposals({
        restaurant_id: restaurantId,
        session_id: sessionId,
        demo_context: isDemo ? {
          menu: menuItems.map((item) => ({
            name: item.name,
            description: item.description || "",
            category: item.category || "",
            price_chf: Number(item.price || 0),
          })),
        } : undefined,
      });
      setRun(result.run);
      setVariants(result.variants);
      setSelectedId(null);
      if (isDemo) persistDemo({ run: result.run, variants: result.variants });
      toast({
        title: "Trois nouvelles variantes générées",
        description: "Les prix fournisseurs ont été comparés à nouveau avec de nouvelles propositions.",
      });
    } catch (error) {
      toast({ title: "Génération impossible", description: formatDailyDishError(error), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [generating, isDemo, menuItems, persistDemo, restaurantId, sessionId, settings.is_enabled, toast]);

  useEffect(() => {
    if (loading || !accessEnabled || !settings.is_enabled || run || generating) return;
    const key = `${restaurantId}:${todayInZurich()}`;
    if (autoAttemptRef.current === key) return;
    autoAttemptRef.current = key;
    void generate(true);
  }, [accessEnabled, generate, generating, loading, restaurantId, run, settings.is_enabled]);

  const toggleEnabled = async (enabled: boolean) => {
    setToggling(true);
    try {
      await setDailyDishEnabled({ restaurant_id: restaurantId, session_id: sessionId, is_enabled: enabled });
      const nextSettings = { ...settings, is_enabled: enabled };
      setSettings(nextSettings);
      if (isDemo) persistDemo({ settings: nextSettings });
      toast({
        title: enabled ? "Plat du jour IA activé" : "Plat du jour IA désactivé",
        description: enabled ? "Les trois propositions seront préparées à la première ouverture du Menu chaque jour." : "Aucune nouvelle recherche quotidienne ne sera lancée.",
      });
    } catch (error) {
      toast({ title: "Activation impossible", description: formatDailyDishError(error), variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const selectVariant = async (variant: DailyDishVariant) => {
    try {
      await selectDailyDishProposal({ restaurant_id: restaurantId, session_id: sessionId, variant_id: variant.id });
      const next = variants.map((item) => ({
        ...item,
        status: item.id === variant.id ? "selected" as const : item.status === "selected" ? "proposed" as const : item.status,
      }));
      setVariants(next);
      setSelectedId(variant.id);
      if (isDemo) persistDemo({ variants: next });
    } catch (error) {
      toast({ title: "Sélection impossible", description: formatDailyDishError(error), variant: "destructive" });
    }
  };

  const refineVariant = async (variant: DailyDishVariant) => {
    const instruction = (instructions[variant.id] || "").trim();
    if (instruction.length < 2) return;
    setRefiningId(variant.id);
    try {
      const result = await refineDailyDishProposal({
        restaurant_id: restaurantId,
        session_id: sessionId,
        variant_id: isDemo ? undefined : variant.id,
        variant: isDemo ? variant.payload : undefined,
        revision: variant.revision,
        instruction,
      });
      const refined: DailyDishVariant = {
        ...result.variant,
        run_id: result.variant.run_id || variant.run_id,
        restaurant_id: result.variant.restaurant_id || variant.restaurant_id,
        variant_number: result.variant.variant_number || variant.variant_number,
        status: "selected",
      };
      await selectDailyDishProposal({ restaurant_id: restaurantId, session_id: sessionId, variant_id: refined.id });
      const next = variants.map((item) => item.id === variant.id ? refined : item);
      setVariants(next);
      setSelectedId(refined.id);
      setInstructions((current) => ({ ...current, [variant.id]: "" }));
      if (isDemo) persistDemo({ variants: next });
      toast({ title: "Proposition ajustée", description: "Les coûts et quantités ont été recalculés avec les sources vérifiées." });
    } catch (error) {
      toast({ title: "Modification impossible", description: formatDailyDishError(error), variant: "destructive" });
    } finally {
      setRefiningId(null);
    }
  };

  const publish = async (withImage: boolean) => {
    if (!selectedVariant || !user?.id) return;
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 1 || description.trim().length < 2) {
      toast({ title: "Publication incomplète", description: "Vérifiez le prix et la description.", variant: "destructive" });
      return;
    }
    setPublishing(true);
    setPublishedImageUrl(null);
    try {
      let assetId: string | null = null;
      let imageUrl: string | null = null;

      if (withImage) {
        void requestAiCreationNotificationPermission();
        const imageJob = startTokImageCreationJob({
          restaurantId,
          userId: user.id,
          tool: "menu_photo",
          title: `PhotoPro · ${selectedVariant.payload.name}`,
          request: {
            restaurantId,
            dishName: selectedVariant.payload.name,
            prompt: [PHOTOPRO_DAILY_DISH_PROMPT, selectedVariant.payload.image_prompt, `Plat : ${selectedVariant.payload.name}`, `Description : ${description.trim()}`].join("\n"),
            assetType: "menu_visual",
            format: "landscape",
            outputResolution: "studio",
            imageModel: "gpt-image-2",
            variantCount: 1,
            generateImage: true,
            imageOnly: false,
            styleMode: "photopro-daily-dish",
          },
        });
        const image = await imageJob.promise;
        assetId = image.assetId;
        imageUrl = image.gallery_image_url || image.generated_image_url || null;
        setPublishedImageUrl(imageUrl);
      }

      const result = await publishDailyDishProposal({
        restaurant_id: restaurantId,
        session_id: sessionId,
        variant_id: selectedVariant.id,
        asset_id: assetId,
        price_cents: Math.round(numericPrice * 100),
        description: description.trim(),
        publish_actualite: publishActualite,
        actualite_body: actualiteBody.trim(),
      });
      const next = variants.map((variant) => ({
        ...variant,
        status: variant.id === selectedVariant.id ? "published" as const : "archived" as const,
      }));
      setVariants(next);
      if (isDemo) {
        persistDemo({
          variants: next,
          published_dish: {
            name: selectedVariant.payload.name,
            description: description.trim(),
            price_cents: Math.round(numericPrice * 100),
            image_url: null,
            service_date: todayInZurich(),
            actualite_body: publishActualite ? actualiteBody.trim() : null,
            published_at: new Date().toISOString(),
          },
        });
      }
      toast({
        title: "Plat du jour publié",
        description: withImage
          ? (publishActualite ? "La fiche restaurant et Actualités ont été mises à jour avec le visuel PhotoPro." : "La fiche restaurant a été mise à jour avec le visuel PhotoPro.")
          : (publishActualite ? "La fiche restaurant et Actualités ont été mises à jour." : "La fiche restaurant a été mise à jour."),
      });
      if (!isDemo && result.publication) await loadState();
    } catch (error) {
      toast({ title: "Publication impossible", description: formatDailyDishError(error), variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const openManualDailyDish = () => {
    setManualDishForm(createEmptyManualDailyDishForm());
    setManualDishDialogOpen(true);
  };

  const buildDemoMenuSeed = () => {
    if (!commercialDemoFrame || commercialDemoFrame.surface !== "restaurant") return [] as MenuCacheItem[];
    return commercialDemoFrame.snapshot.catalog_items.map((item) => ({
      id: item.id,
      restaurant_id: commercialDemoFrame.snapshot.demo_restaurant.id,
      name: item.name,
      description: item.description || null,
      price: item.price,
      category: item.category || null,
      image_url: item.image_url || null,
      is_available: item.is_available,
    }));
  };

  const saveManualDailyDish = async () => {
    if (savingManualDish) return;
    const trimmedName = manualDishForm.name.trim();
    const normalizedPrice = Math.round((Number(manualDishForm.price) || 0) * 100) / 100;
    const trimmedDescription = manualDishForm.description.trim();
    const trimmedImageUrl = manualDishForm.image_url.trim();

    if (!trimmedName) {
      toast({ title: "Nom requis", description: "Indiquez le nom du plat du jour.", variant: "destructive" });
      return;
    }
    if (!(normalizedPrice > 0)) {
      toast({ title: "Prix invalide", description: "Indiquez un prix supérieur à 0 CHF.", variant: "destructive" });
      return;
    }

    setSavingManualDish(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: trimmedName,
        description: trimmedDescription,
        price: normalizedPrice,
        category: MANUAL_DAILY_DISH_CATEGORY,
        image_url: trimmedImageUrl,
        is_available: true,
      };

      if (isDemo && sessionId) {
        const current = readCommercialDemoToolState<MenuCacheItem[]>(
          sessionId,
          DEMO_MENU_STORAGE_KEY,
          buildDemoMenuSeed(),
        );
        const next = [
          ...current,
          {
            ...payload,
            id: globalThis.crypto?.randomUUID?.() || `demo-daily-dish-${Date.now()}`,
          },
        ];
        writeCommercialDemoToolState(sessionId, DEMO_MENU_STORAGE_KEY, next);
        queryClient.setQueryData<MenuCacheItem[]>(["my-menu-items", restaurantId, sessionId], next);
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ["my-menu-items", restaurantId, "live"] });
      }

      setManualDishDialogOpen(false);
      setManualDishForm(createEmptyManualDailyDishForm());
      toast({
        title: "Plat du jour ajouté",
        description: "Il est disponible immédiatement dans la catégorie Plat du jour et sur la vue d’ensemble mobile.",
      });
    } catch (error) {
      toast({
        title: "Ajout impossible",
        description: error instanceof Error ? error.message : "Le plat du jour n'a pas pu être ajouté.",
        variant: "destructive",
      });
    } finally {
      setSavingManualDish(false);
    }
  };

  const manualDailyDishDialog = (
    <Dialog
      open={manualDishDialogOpen}
      onOpenChange={(open) => {
        setManualDishDialogOpen(open);
        if (!open && !savingManualDish) setManualDishForm(createEmptyManualDailyDishForm());
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajouter un plat du jour manuellement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-50">
            Ce plat est ajouté directement au menu avec la catégorie « Plat du jour », sans génération IA ni consommation de crédits.
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-daily-dish-name">Nom du plat</Label>
            <Input
              id="manual-daily-dish-name"
              value={manualDishForm.name}
              onChange={(event) => setManualDishForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex. Filet de bœuf Rossini"
              maxLength={140}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-daily-dish-price">Prix public (CHF)</Label>
            <Input
              id="manual-daily-dish-price"
              type="number"
              min="0.05"
              step="0.05"
              value={manualDishForm.price}
              onChange={(event) => setManualDishForm((current) => ({ ...current, price: event.target.value }))}
              placeholder="26.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-daily-dish-description">Description</Label>
            <Textarea
              id="manual-daily-dish-description"
              value={manualDishForm.description}
              onChange={(event) => setManualDishForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Décrivez le plat, les accompagnements et les allergènes à vérifier."
              rows={4}
              maxLength={600}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-daily-dish-image">Photo ou URL d’image (facultatif)</Label>
            <Input
              id="manual-daily-dish-image"
              value={manualDishForm.image_url}
              onChange={(event) => setManualDishForm((current) => ({ ...current, image_url: event.target.value }))}
              placeholder="https://…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setManualDishDialogOpen(false)} disabled={savingManualDish}>Annuler</Button>
          <Button type="button" onClick={saveManualDailyDish} disabled={savingManualDish} className="gap-2">
            {savingManualDish ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {savingManualDish ? "Ajout…" : "Ajouter le plat du jour"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <>
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Vérification du Plat du jour IA…</div>
        </section>
        {manualDailyDishDialog}
      </>
    );
  }

  if (!accessEnabled) {
    return (
      <>
        <section className="space-y-4 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-card to-emerald-50 p-5 dark:border-violet-900 dark:from-violet-950/30 dark:to-emerald-950/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><LockKeyhole className="h-5 w-5" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">Plat du jour IA</h2><Badge>Premium</Badge></div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Trois recettes saisonnières par jour, basées sur votre carte, vos ventes et vos avis, avec comparaison Aligro et fournisseurs proches, panier chiffré et photo PhotoPro.</p>
              </div>
            </div>
            <Button variant="outline" disabled>Dès TOK Premium</Button>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-background/85 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/30">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><ChefHat className="h-5 w-5" /></div>
              <div>
                <p className="font-semibold">Plat du jour manuel</p>
                <p className="text-sm text-muted-foreground">Ajoutez un plat du jour sans IA, même si l’outil Premium n’est pas activé.</p>
              </div>
            </div>
            <Button type="button" onClick={openManualDailyDish} className="gap-2 sm:shrink-0"><Plus className="h-4 w-4" /> Ajouter manuellement</Button>
          </div>
        </section>
        {manualDailyDishDialog}
      </>
    );
  }

  return (
    <>
      <section className="space-y-5 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-card to-emerald-50/70 p-5 dark:border-violet-900 dark:from-violet-950/20 dark:to-emerald-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-emerald-500 text-white"><Bot className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold">Plat du jour IA</h2>
                <Badge className="bg-violet-600 text-white">Premium</Badge>
                {isDemo && <Badge variant="outline">Démo isolée</Badge>}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">3 propositions quotidiennes · saison, meilleures ventes, avis, coûts et prix fournisseurs vérifiés en ligne.</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/80 px-3 py-2 lg:justify-start">
            <div><p className="text-sm font-semibold">Génération quotidienne</p><p className="text-xs text-muted-foreground">À la première ouverture du Menu</p></div>
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Switch checked={settings.is_enabled} onCheckedChange={toggleEnabled} aria-label="Activer le Plat du jour IA" />}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-background/85 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/30">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><ChefHat className="h-5 w-5" /></div>
            <div>
              <p className="font-semibold">Ajouter un plat du jour manuellement</p>
              <p className="text-sm text-muted-foreground">Création immédiate dans le menu, sans IA ni consommation de crédits.</p>
            </div>
          </div>
          <Button type="button" onClick={openManualDailyDish} className="gap-2 sm:shrink-0"><Plus className="h-4 w-4" /> Ajouter manuellement</Button>
        </div>

        {!settings.is_enabled ? (
          <div className="rounded-xl border border-dashed bg-background/70 p-5 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-violet-600" />
            <p className="mt-2 font-semibold">Activez l’outil pour préparer les trois propositions du jour</p>
            <p className="mt-1 text-sm text-muted-foreground">Aucune recherche fournisseur n’est lancée tant que l’outil reste désactivé.</p>
          </div>
        ) : generating ? (
          <div className="rounded-xl border bg-background/80 p-5">
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-violet-600" />
              <div><p className="font-semibold">Comparaison des fournisseurs en cours…</p><p className="mt-1 text-sm text-muted-foreground">Aligro est recherché en priorité, puis les prix publics des enseignes proches sont comparés avant le calcul du panier et des marges.</p></div>
            </div>
          </div>
        ) : variants.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed bg-background/70 p-5 text-center">
            <PackageSearch className="h-7 w-7 text-violet-600" />
            <p className="mt-2 font-semibold">Aucune proposition pour aujourd’hui</p>
            <Button className="mt-3 gap-2" onClick={() => void generate(false)}><WandSparkles className="h-4 w-4" /> Rechercher maintenant</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-emerald-600" /><span>Propositions du {run?.generation_date ? new Date(`${run.generation_date}T12:00:00`).toLocaleDateString("fr-CH", { day: "numeric", month: "long" }) : "jour"}</span></div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void regenerate()} disabled={generating}>{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 3 nouvelles variantes</Button>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {variants.map((variant, index) => {
                const dish = variant.payload;
                const isSelected = selectedId === variant.id;
                return (
                  <article key={variant.id} className={`space-y-4 rounded-2xl border-2 bg-card p-4 transition ${isSelected ? "border-violet-500 shadow-md" : "border-transparent shadow-sm"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div><Badge variant="outline">Variante {variant.variant_number || index + 1}</Badge><h3 className="mt-2 text-lg font-bold leading-tight">{dish.name}</h3></div>
                      <p className="shrink-0 text-lg font-black text-primary">{money(dish.suggested_price_chf)}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{dish.description}</p>
                    <p className="rounded-lg bg-violet-50 p-2 text-xs text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">{dish.why_it_fits}</p>
                    <VariantDetails variant={variant} />
                    <div className="space-y-2 border-t pt-3">
                      <Label htmlFor={`daily-dish-refine-${variant.id}`} className="text-xs">Demander une modification</Label>
                      <Textarea id={`daily-dish-refine-${variant.id}`} value={instructions[variant.id] || ""} onChange={(event) => setInstructions((current) => ({ ...current, [variant.id]: event.target.value }))} placeholder="Ex. sans lactose, 20 portions, remplacer le saumon…" rows={2} maxLength={1000} />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button variant="outline" className="flex-1 gap-2" disabled={refiningId === variant.id || !(instructions[variant.id] || "").trim()} onClick={() => void refineVariant(variant)}>
                          {refiningId === variant.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Ajuster
                        </Button>
                        <Button className="flex-1 gap-2" variant={isSelected ? "default" : "secondary"} onClick={() => void selectVariant(variant)}>
                          {isSelected ? <Check className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />} {isSelected ? "Sélectionné" : "Choisir"}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {selectedVariant && (
          <div className="rounded-2xl border-2 border-emerald-200 bg-background/90 p-4 dark:border-emerald-900">
            <div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white"><Send className="h-4 w-4" /></div><div><h3 className="font-bold">Publier « {selectedVariant.payload.name} »</h3><p className="text-sm text-muted-foreground">Le visuel PhotoPro est généré après votre validation, puis lié de façon sécurisée à la publication.</p></div></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[180px_1fr]">
              <div className="space-y-2"><Label htmlFor="daily-dish-price">Prix public (CHF)</Label><Input id="daily-dish-price" type="number" min="1" max="10000" step="0.05" value={price} onChange={(event) => setPrice(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="daily-dish-description">Description sur la fiche restaurant</Label><Textarea id="daily-dish-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={1200} /></div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border p-3"><div><p className="font-semibold">Publier aussi dans Actualités</p><p className="text-xs text-muted-foreground">Une version éditoriale avec la même image sera créée.</p></div><Switch checked={publishActualite} onCheckedChange={setPublishActualite} aria-label="Publier également le plat du jour dans Actualités" /></div>
            {publishActualite && <div className="mt-3 space-y-2"><Label htmlFor="daily-dish-actualite">Texte Actualités</Label><Textarea id="daily-dish-actualite" value={actualiteBody} onChange={(event) => setActualiteBody(event.target.value)} rows={4} maxLength={4000} /></div>}
            {publishedImageUrl && <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><img src={publishedImageUrl} alt={selectedVariant.payload.name} className="h-16 w-20 rounded-lg object-cover" /><div><p className="font-semibold">Visuel PhotoPro généré</p><p>Il accompagne la fiche et le post Actualités.</p></div></div>}
            <div className="mt-4 flex flex-col justify-end gap-2 sm:flex-row">
              <Button variant="outline" className="gap-2" disabled={publishing} onClick={() => void publish(false)}>{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publier sans image</Button>
              <Button className="gap-2" disabled={publishing} onClick={() => void publish(true)}>{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} {publishing ? "Publication en cours…" : "Générer l’image et publier"}</Button>
            </div>
          </div>
        )}


        <div className="flex items-start gap-2 text-xs text-muted-foreground"><Store className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>Les prix et stocks en ligne restent indicatifs et doivent être confirmés auprès du magasin. Les URL de sources sont conservées dans l’analyse privée, jamais exposées sur la fiche publique.</p></div>
      </section>
      {manualDailyDishDialog}
    </>
  );
}
