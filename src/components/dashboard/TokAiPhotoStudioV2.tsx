import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AiGenerationProgressDialog from "@/components/ui/ai-generation-progress-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/ImageUpload";
import AiStyleReferencePicker, { type AiStyleReferenceValue } from "@/components/dashboard/AiStyleReferencePicker";
import { useToast } from "@/hooks/use-toast";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { getSupabase } from "@/integrations/supabase/client";
import type { TokImageFormat, TokImageGenerationResult } from "@/lib/ai/tokAiClient";
import {
  requestAiCreationNotificationPermission,
  setActiveAiCreationContext,
  startTokImageCreationJob,
} from "@/lib/ai/aiCreationJobs";
import {
  getTokImageOutputPricing,
  type TokImageOutputResolution,
} from "@/lib/ai/imagePricing";
import { createTokGenerationSeed, sanitizeTokGenerationSeed } from "@/lib/ai/generationSeed";
import {
  buildRestaurantMediaAiMetadata,
  isTokProOrHigherRestaurantSubscription,
  type RestaurantMediaWatermarkSubscription,
} from "@/lib/ai/restaurantMediaMetadata";
import { downloadImageWithWatermark } from "@/lib/media/downloadImageWithWatermark";
import { formatAiImageGenerationError, isTokCreditError, toPublicErrorMessage } from "@/lib/publicErrorMessages";
import { AlertCircle, CheckCircle2, Download, Loader2, Maximize2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { Link } from "react-router-dom";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { readCommercialDemoToolState, writeCommercialDemoToolState } from "@/lib/commercialDemoRestaurantTools";

const supabase = getSupabase();
const STUDIO_BRIEF =
  "Génère une image de qualité photographique professionnelle studio, digne des meilleurs food photographe. Au besoin, change l’angle de vue mais préserve les ingrédients du plat tout en améliorant la fraîcheur, l’éclairage, la profondeur de champ. Si le produit est coupé, tronqué, partiellement hors cadre ou sort de l'image, génère la partie manquante en élargissant l'angle ou en modifiant l'angle de vue, sans changer le produit, ses ingrédients, ses logos, ses textes ou son packaging. Le produit doit être parfaitement mis en valeur.";
const PHOTO_PRO_CREATIVE_DIRECTION =
  "Priorité haute: si le restaurateur demande une modification créative visible, applique-la franchement dans l'image finale au lieu d'une retouche subtile. Les ajouts explicitement demandés comme fromage, cheddar, sauce, ingrédient complémentaire, effet de mouvement, produit séparé, suspendu ou en lévitation sont autorisés s'ils valorisent le produit source sans le remplacer.";
const MAX_COMMERCIAL_DEMO_REFERENCE_BYTES = 4 * 1024 * 1024;
const COMMERCIAL_DEMO_REFERENCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function buildPhotoProPrompt(userInstructions: string, hasStyleReference: boolean) {
  const trimmedInstructions = userInstructions.trim();

  return [
    STUDIO_BRIEF,
    PHOTO_PRO_CREATIVE_DIRECTION,
    "Si le produit est mal mis en scène ou n'a pas l'air appétissant, améliore sa présentation, son volume visuel, la gourmandise, les textures et la lumière tout en préservant le produit, les ingrédients, le packaging, les logos et les textes présents.",
    hasStyleReference
      ? "Référence de style active: reprendre l'ambiance, la lumière, la palette, la profondeur de champ, le cadrage et le traitement visuel de l'image de style fournie, sans copier son contenu ni remplacer le produit source."
      : "",
    trimmedInstructions ? `Consignes du restaurateur à appliquer visiblement: ${trimmedInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

type Props = {
  restaurantId: string | null | undefined;
  userId?: string | null;
  currentPhotoCount: number;
  watermarkSubscription?: RestaurantMediaWatermarkSubscription;
  onGalleryUpdated: () => void;
};

type PhotoStudioDraft = {
  sourceImageUrl: string;
  styleReference: AiStyleReferenceValue | null;
  dishName: string;
  userInstructions: string;
  generationSeed: string;
  format: TokImageFormat;
  outputResolution: TokImageOutputResolution;
  result: TokImageGenerationResult | null;
};

const DEFAULT_DRAFT: PhotoStudioDraft = {
  sourceImageUrl: "",
  styleReference: null,
  dishName: "",
  userInstructions: "",
  generationSeed: "",
  format: "landscape",
  outputResolution: "studio",
  result: null,
};

function formatPhotoGenerationError(error: unknown) {
  return formatAiImageGenerationError(error);
}

function buildTokPhotoDownloadFileName(dishName: string) {
  const normalized = dishName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${normalized || "visuel-tok"}-tok.png`;
}

function buildCommercialDemoPhotoPalette(source: string, instructions: string) {
  const seed = `${source}|${instructions}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const palettes = [
    ["#f97316", "#fed7aa", "#431407"],
    ["#16a34a", "#bbf7d0", "#052e16"],
    ["#2563eb", "#bfdbfe", "#172554"],
    ["#a855f7", "#e9d5ff", "#3b0764"],
  ] as const;
  const palette = palettes[Math.abs(hash) % palettes.length];
  return {
    primaryColor: palette[0],
    secondaryColor: palette[1],
    backgroundColor: palette[2],
    fingerprint: `photo-${Math.abs(hash).toString(36)}`,
    label: "photo source Démo",
  };
}

function TokLogoWatermark({ logoSrc, className = "", sizeClassName = "h-[180px] w-[180px]" }: { logoSrc: string; className?: string; sizeClassName?: string }) {
  return (
    <div
      className={`pointer-events-none absolute left-3 top-3 z-10 drop-shadow-[0_10px_24px_rgba(0,0,0,0.30)] ${className}`}
      aria-hidden="true"
      data-testid="tok-logo-watermark-layer"
    >
      <img src={logoSrc} alt="" className={`${sizeClassName} object-contain`} draggable={false} />
    </div>
  );
}

export default function TokAiPhotoStudioV2({ restaurantId, userId, currentPhotoCount, watermarkSubscription, onGalleryUpdated }: Props) {
  const { toast } = useToast();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const logoSrc = useTokLogoSrc();
  const mountedRef = useRef(true);
  const storageKey = isCommercialDemo && commercialDemoFrame
    ? `tok-ai-photo-studio-v2:commercial-demo:${commercialDemoFrame.config.sessionId}:restaurant`
    : `tok-ai-photo-studio-v2:${restaurantId || "pending"}`;
  const [draft, setDraft, clearDraft] = useSessionStorageState<PhotoStudioDraft>(storageKey, DEFAULT_DRAFT);
  const [demoSourceImageUrl, setDemoSourceImageUrl] = useState("");
  const [demoResult, setDemoResult] = useState<TokImageGenerationResult | null>(null);
  const demoSourceObjectUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const sourceImageUrl = isCommercialDemo ? demoSourceImageUrl : draft.sourceImageUrl;
  const result = isCommercialDemo ? demoResult : draft.result;
  const generatedImageUrl = result?.gallery_image_url || result?.generated_image_url || "";
  const downloadFileName = buildTokPhotoDownloadFileName(draft.dishName || result?.title || "visuel-tok");
  const selectedOutputResolution: TokImageOutputResolution = "studio";
  const outputPricing = getTokImageOutputPricing(draft.format, selectedOutputResolution);
  const shouldApplyTokWatermark = !isTokProOrHigherRestaurantSubscription(watermarkSubscription);
  const normalizedGenerationSeed = sanitizeTokGenerationSeed(draft.generationSeed);

  const updateDraft = (nextDraft: Partial<PhotoStudioDraft>) => {
    setDraft((previous) => ({ ...previous, ...nextDraft }));
  };

  const generateNewSeed = () => {
    if (isCommercialDemo) setDemoResult(null);
    updateDraft({ generationSeed: createTokGenerationSeed("photopro"), result: null });
  };

  const resetStudio = () => {
    if (demoSourceObjectUrlRef.current) {
      URL.revokeObjectURL(demoSourceObjectUrlRef.current);
      demoSourceObjectUrlRef.current = null;
    }
    setDemoSourceImageUrl("");
    setDemoResult(null);
    clearDraft();
  };

  useEffect(() => {
    setActiveAiCreationContext("dashboard-photos:photopro");
    return () => setActiveAiCreationContext(null);
  }, []);

  useEffect(() => {
    // React StrictMode runs an extra setup/cleanup cycle in development.
    // Reset the guard on every setup so completed generations are not ignored.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (demoSourceObjectUrlRef.current) URL.revokeObjectURL(demoSourceObjectUrlRef.current);
    };
  }, []);

  const generate = async () => {
    if (!restaurantId) return;
    if (!sourceImageUrl.trim()) {
      toast({ title: "Photo requise", description: "Ajoutez la photo brute du produit ou du plat.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setPreviewOpen(false);
    setCreditError(null);
    if (isCommercialDemo) setDemoResult(null);
    updateDraft({ result: null });
    try {
      const generationSeed = sanitizeTokGenerationSeed(draft.generationSeed);
      const styleReferenceImageUrl = draft.styleReference?.mediaUrl || "";
      const styleReferenceMediaId = draft.styleReference?.mediaId || "";
      void requestAiCreationNotificationPermission();
      const request = {
        restaurantId,
        sourceImageUrl,
        dishName: draft.dishName || null,
        prompt: buildPhotoProPrompt(draft.userInstructions || "", Boolean(styleReferenceImageUrl)),
        referenceImageUrls: styleReferenceImageUrl ? [styleReferenceImageUrl] : [],
        referenceMediaIds: styleReferenceMediaId ? [styleReferenceMediaId] : [],
        assetType: "menu_visual",
        format: draft.format,
        outputResolution: selectedOutputResolution,
        variantCount: 1,
        generationSeed: generationSeed || null,
        generateImage: true,
        imageOnly: true,
        styleMode: isCommercialDemo ? "photo premium" : undefined,
        demoReferencePalette: isCommercialDemo
          ? buildCommercialDemoPhotoPalette(sourceImageUrl, draft.userInstructions || "")
          : undefined,
      } as const;
      const { promise } = startTokImageCreationJob({
        restaurantId,
        userId,
        tool: "photopro",
        title: draft.dishName || "Retouche PhotoPro",
        request,
      });
      const data = await promise;
      if (!mountedRef.current) return;
      if (isCommercialDemo) {
        setDemoResult(data);
        updateDraft({ result: null, generationSeed: data.generation_seed || generationSeed });
      } else {
        updateDraft({ result: data, generationSeed: data.generation_seed || generationSeed });
      }
      setCreditError(null);
      toast({ title: "Visuel TOK prêt", description: "Contrôlez que le produit source est toujours reconnaissable avant publication." });
    } catch (error) {
      if (!mountedRef.current) return;
      const message = formatPhotoGenerationError(error);
      if (isTokCreditError(error)) setCreditError(message);
      toast({ title: "Erreur IA", description: message, variant: "destructive" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const addToGallery = async () => {
    if (!restaurantId) return;
    if (!result?.gallery_image_url) {
      toast({
        title: "Galerie indisponible",
        description: "Le visuel TOK n'a pas encore d'URL publique stable. Relancez la génération avant l'ajout.",
        variant: "destructive",
      });
      return;
    }
    if (isCommercialDemo && commercialDemoFrame) {
      const sessionId = commercialDemoFrame.config.sessionId;
      const current = readCommercialDemoToolState<Array<Record<string, unknown>>>(sessionId, "photos-gallery", []);
      const id = `demo-generation-${result.created_at || result.generation_seed || Date.now()}`;
      const next = current.some((item) => item.id === id) ? current : [{
        id,
        restaurant_id: restaurantId,
        // The gallery reload resolves this generation id to a fresh signed URL;
        // never persist the short-lived token itself in browser storage.
        media_url: "",
        alt_text: result.alt_text || result.title || draft.dishName || "Visuel PhotoPro Démo",
        media_type: "photo_ai_tok",
        uploaded_by: null,
        position: currentPhotoCount,
        is_cover: current.length === 0,
        storage_bucket: null,
        storage_path: null,
        metadata: {
          commercial_demo: true,
          tool: "photopro",
          generation_id: result.assetId,
          ai_model: result.model || "openai",
          credit_units: 0,
        },
        created_at: result.created_at || new Date().toISOString(),
      }, ...current];
      writeCommercialDemoToolState(sessionId, "photos-gallery", next);
      toast({ title: "Ajouté à la galerie Démo", description: "Aucun média de production n'a été modifié." });
      onGalleryUpdated();
      return;
    }
    const { error } = await supabase.from("restaurant_media").insert({
      restaurant_id: restaurantId,
      media_url: result.gallery_image_url,
      alt_text: result.alt_text || result.title || draft.dishName || "Visuel TOK",
      media_type: "photo_ai_tok",
      uploaded_by: userId || null,
      position: currentPhotoCount,
      storage_bucket: result.gallery_storage_bucket,
      storage_path: result.gallery_storage_path,
      metadata: buildRestaurantMediaAiMetadata({
        result,
        dishName: draft.dishName,
        tool: "photopro",
        tokWatermarkRequired: shouldApplyTokWatermark,
      }),
    });
    if (error) {
      return toast({
        title: "Erreur",
        description: toPublicErrorMessage(error, "Ajout à la galerie impossible. Réessayez dans quelques instants."),
        variant: "destructive",
      });
    }
    toast({ title: "Ajouté à la galerie" });
    onGalleryUpdated();
  };

  const downloadGeneratedPhoto = async () => {
    if (!generatedImageUrl) return;

    try {
      await downloadImageWithWatermark({
        imageUrl: generatedImageUrl,
        fileName: downloadFileName,
        watermarkUrl: shouldApplyTokWatermark ? logoSrc : null,
        watermarkSize: 180,
        watermarkMargin: 24,
      });
    } catch (error) {
      const message = toPublicErrorMessage(error, "Le visuel TOK n'a pas pu être préparé au téléchargement.");
      toast({
        title: "Téléchargement impossible",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="overflow-hidden border-orange-200 bg-gradient-to-br from-orange-50 via-background to-background dark:border-orange-900/50 dark:from-orange-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge className="bg-orange-600 text-white hover:bg-orange-600">Studio IA</Badge>
          <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-orange-600" /> Retouche photo TOK</CardTitle>
        </div>
        <CardDescription>
          Créez une version premium sans changer le sujet source : même produit, même plat, même packaging et même identité visuelle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {isCommercialDemo ? (
              <div className="space-y-2 rounded-2xl border border-dashed border-orange-200 bg-white p-4">
                <Label htmlFor="commercial-demo-photopro-source">Photo brute Démo</Label>
                <Input
                  id="commercial-demo-photopro-source"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    if (!COMMERCIAL_DEMO_REFERENCE_MIME_TYPES.has(file.type) || file.size > MAX_COMMERCIAL_DEMO_REFERENCE_BYTES) {
                      toast({
                        title: "Photo non prise en charge",
                        description: "Choisissez une image JPEG, PNG ou WebP de 4 Mo maximum.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (demoSourceObjectUrlRef.current) URL.revokeObjectURL(demoSourceObjectUrlRef.current);
                    const nextUrl = URL.createObjectURL(file);
                    demoSourceObjectUrlRef.current = nextUrl;
                    setDemoSourceImageUrl(nextUrl);
                    setDemoResult(null);
                    updateDraft({ sourceImageUrl: "", result: null, styleReference: null });
                  }}
                />
                <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP · 4 Mo maximum. La photo reste hors du Storage de production et est transmise temporairement à OpenAI uniquement lors de la retouche.</p>
              </div>
            ) : (
              <>
                <ImageUpload
                  label="Photo brute du produit ou plat"
                  value={sourceImageUrl}
                  onChange={(sourceImageUrl) => updateDraft({ sourceImageUrl, result: null })}
                  showUrlInput={false}
                />
                <AiStyleReferencePicker
                  restaurantId={restaurantId}
                  userId={userId}
                  value={draft.styleReference}
                  onChange={(styleReference) => updateDraft({ styleReference, result: null })}
                />
              </>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom du produit ou plat</Label>
                <Input value={draft.dishName} onChange={(event) => updateDraft({ dishName: event.target.value })} placeholder="Ex. produit emballé, assiette kebab" />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.format}
                  onChange={(event) => updateDraft({ format: event.target.value as TokImageFormat, result: null })}
                >
                  <option value="landscape">16:9 campagne</option>
                  <option value="square">Carré fiche produit</option>
                  <option value="portrait">Portrait story</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Consignes PhotoPro</Label>
              <Textarea
                value={draft.userInstructions || ""}
                onChange={(event) => updateDraft({ userInstructions: event.target.value, result: null })}
                placeholder="Ex. rendre le produit plus gourmand, corriger la mise en scène, ajouter une lumière plus chaude..."
                className="min-h-[110px]"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Optionnel. PhotoPro garde le produit source mais peut corriger une mise en scène faible ou rendre le rendu plus appétissant.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="photopro-generation-seed">Seed de generation</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="photopro-generation-seed"
                  value={draft.generationSeed}
                  onChange={(event) => updateDraft({ generationSeed: sanitizeTokGenerationSeed(event.target.value), result: null })}
                  placeholder="Ex. photopro-burger-cheddar-01"
                  className="min-w-0"
                />
                <Button type="button" variant="outline" onClick={generateNewSeed} className="shrink-0">
                  Nouvelle seed
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Reutilisez la meme seed pour rapprocher le style, la lumiere et la composition d'une generation qui vous plait.
              </p>
              {result?.generation_seed ? (
                <Badge variant="outline" className="border-orange-200 bg-white text-orange-700">
                  Seed utilisee: {result.generation_seed}
                </Badge>
              ) : normalizedGenerationSeed ? (
                <Badge variant="outline" className="border-orange-200 bg-white text-orange-700">
                  Seed prete: {normalizedGenerationSeed}
                </Badge>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Configuration image</Label>
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
                <span className="block font-semibold">{isCommercialDemo ? "PhotoPro Démo · OpenAI réel" : outputPricing.modelLabel}</span>
                <span className="mt-1 block text-xs leading-5">
                  {isCommercialDemo ? "Image OpenAI isolée et persistante · coût fournisseur suivi en interne" : `${outputPricing.size} - qualité ${outputPricing.quality} - coût base ${outputPricing.outputCostChf.toFixed(2)} CHF`}
                </span>
                <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-xs font-bold text-orange-700">
                  {isCommercialDemo ? "Crédits Démo illimités" : `${outputPricing.photoCredits} crédit${outputPricing.photoCredits > 1 ? "s" : ""}`}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {isCommercialDemo ? "La clé OpenAI reste côté serveur ; les résultats utilisent exclusivement l'espace Démo isolé." : "TOK utilise uniquement GPT Image 2 en qualité medium pour les images."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={!restaurantId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isCommercialDemo ? "Générer avec OpenAI · crédits Démo illimités" : `Générer la version TOK (${outputPricing.photoCredits} cr.)`}
              </Button>
              {result?.gallery_image_url ? <Button type="button" variant="outline" onClick={addToGallery}>Ajouter à la galerie</Button> : null}
              {sourceImageUrl || draft.styleReference || result ? (
                <Button type="button" variant="ghost" onClick={resetStudio} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Nouveau
                </Button>
              ) : null}
            </div>
            {creditError ? (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Credits TOK insuffisants</p>
                    <p className="mt-1 text-xs leading-5">{creditError}</p>
                  </div>
                </div>
                <Button asChild type="button" variant="outline" className="mt-3 h-9 rounded-xl border-destructive/30 bg-background text-destructive hover:bg-destructive/10">
                  <Link to="/dashboard/mon-compte-facturation">Recharger mes credits</Link>
                </Button>
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground shadow-sm">
            <>
                <p className="mb-2 font-semibold text-foreground">Rendu attendu</p>
                <ul className="space-y-2">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Même produit ou plat que la source, immédiatement reconnaissable.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Packaging, contenant, marque, textes et couleurs préservés si présents.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Éclairage studio, fond nettoyé, profondeur de champ douce, textures renforcées{shouldApplyTokWatermark ? " et logo TOK ajouté en calque transparent séparé." : ", sans logo TOK avec Tok Pro ou plus."}</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Mise en scène et aspect appétissant améliorés si la photo source ne valorise pas assez le produit.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Un emballage ne doit jamais devenir une assiette servie.</li>
                </ul>
            </>
          </div>
        </div>

        <AiGenerationProgressDialog
          open={loading}
          title="Retouche PhotoPro en cours"
          description="TOK conserve le plat source, nettoie le rendu et prepare la version finale pour votre galerie."
          status="PhotoPro travaille le visuel"
          steps={["Analyse photo", "Retouche fidele", "Export galerie"]}
        />

        {result ? (
          <Card>
            <CardHeader><CardTitle>Version TOK prête</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <div><p className="mb-2 text-sm font-semibold">Avant</p><img src={sourceImageUrl} alt="Photo source" className="aspect-video w-full rounded-xl border object-cover" /></div>
                {generatedImageUrl ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Après TOK</p>
                      <Button type="button" variant="outline" size="sm" onClick={downloadGeneratedPhoto} className="gap-2">
                        <Download className="h-4 w-4" />
                        Télécharger
                      </Button>
                    </div>
                    <button
                      type="button"
                      aria-label="Agrandir le visuel TOK généré"
                      onClick={() => setPreviewOpen(true)}
                      className="group relative block aspect-video w-full overflow-hidden rounded-xl border bg-muted text-left"
                    >
                      {shouldApplyTokWatermark ? <TokLogoWatermark logoSrc={logoSrc} sizeClassName="h-16 w-16" /> : null}
                      <img
                        src={generatedImageUrl}
                        alt={result.alt_text || "Visuel TOK"}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                      />
                      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                        <Maximize2 className="h-3.5 w-3.5" />
                        Agrandir
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Dialog open={previewOpen && Boolean(generatedImageUrl)} onOpenChange={setPreviewOpen}>
          <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[92vh] sm:max-h-[92vh]">
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <DialogTitle>Visuel TOK généré</DialogTitle>
                  <DialogDescription>Prévisualisation grand format du visuel avant publication.</DialogDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result?.gallery_image_url ? (
                    <Button type="button" variant="outline" onClick={addToGallery}>
                      Ajouter à la galerie
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" onClick={downloadGeneratedPhoto} className="gap-2">
                    <Download className="h-4 w-4" />
                    Télécharger
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 bg-black p-3 sm:p-5">
              {generatedImageUrl ? (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="relative inline-flex max-h-full max-w-full items-center justify-center">
                    {shouldApplyTokWatermark ? <TokLogoWatermark logoSrc={logoSrc} className="left-4 top-4" sizeClassName="h-16 w-16" /> : null}
                    <img
                      src={generatedImageUrl}
                      alt={result?.alt_text || "Visuel TOK"}
                      className="block max-h-full max-w-full rounded-lg object-contain"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
