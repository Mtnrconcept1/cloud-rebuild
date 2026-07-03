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
import {
  buildRestaurantMediaAiMetadata,
  isTokProOrHigherRestaurantSubscription,
  type RestaurantMediaWatermarkSubscription,
} from "@/lib/ai/restaurantMediaMetadata";
import { downloadImageWithWatermark } from "@/lib/media/downloadImageWithWatermark";
import { formatAiImageGenerationError, toPublicErrorMessage } from "@/lib/publicErrorMessages";
import { CheckCircle2, Download, Loader2, Maximize2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useTokLogoSrc } from "@/hooks/useTokLogo";

const supabase = getSupabase();
const STUDIO_BRIEF =
  "Génère une image de qualité photographique professionnelle studio, digne des meilleurs food photographe. Respecte toujours l'angle de vue choisi par le restaurateur; si aucun changement d'angle n'est demandé, conserve l'angle source. Préserve les ingrédients du plat tout en améliorant la fraîcheur, l’éclairage, la profondeur de champ. Si le produit est coupé, tronqué, partiellement hors cadre ou sort de l'image, génère la partie manquante en élargissant le cadre, ou en modifiant l'angle de vue uniquement si le bouton d'angle choisi l'autorise, sans changer le produit, ses ingrédients, ses logos, ses textes ou son packaging. Le produit doit être parfaitement mis en valeur.";
const PHOTO_PRO_CREATIVE_DIRECTION =
  "Priorité haute: si le restaurateur demande une modification créative visible, applique-la franchement dans l'image finale au lieu d'une retouche subtile. Les ajouts explicitement demandés comme fromage, cheddar, sauce, ingrédient complémentaire, effet de mouvement, produit séparé, suspendu ou en lévitation sont autorisés s'ils valorisent le produit source sans le remplacer.";
const PHOTO_PRO_VARIANT_OPTIONS = [1, 2, 3, 4] as const;

type PhotoProVariantCount = typeof PHOTO_PRO_VARIANT_OPTIONS[number];
type PhotoProViewAngle = "same_angle" | "top" | "front" | "forty_five" | "profile" | "wide_angle" | "closeup";

const PHOTO_PRO_VIEW_ANGLES: Array<{ id: PhotoProViewAngle; label: string; promptInstruction: string }> = [
  {
    id: "same_angle",
    label: "Même angle de vue",
    promptInstruction: "conserver le même angle de vue et la même logique de cadrage que la photo source; améliorer uniquement la lumière, la mise en scène, les textures, le fond et la qualité studio.",
  },
  {
    id: "top",
    label: "Vue du dessus",
    promptInstruction: "composer la photo en vue du dessus, type flat lay culinaire premium, avec le produit entier visible.",
  },
  {
    id: "front",
    label: "Vue de face",
    promptInstruction: "composer la photo en vue de face, hauteur produit, lisible et appétissante.",
  },
  {
    id: "forty_five",
    label: "45 degrés",
    promptInstruction: "composer la photo en angle trois-quarts à 45 degrés, avec profondeur de champ et volume gourmand.",
  },
  {
    id: "profile",
    label: "Vue de profil",
    promptInstruction: "composer la photo en vue de profil, pour mettre en valeur les couches, la hauteur et les textures.",
  },
  {
    id: "wide_angle",
    label: "Grand-angle",
    promptInstruction: "élargir le cadre en grand-angle contrôlé pour montrer le produit entier, son décor et les parties manquantes si besoin.",
  },
  {
    id: "closeup",
    label: "Closeup",
    promptInstruction: "composer un closeup culinaire premium, très détaillé sur les textures, en gardant le produit reconnaissable et entier.",
  },
];

function getNormalizedPhotoProVariantCount(value: number | null | undefined): PhotoProVariantCount {
  return PHOTO_PRO_VARIANT_OPTIONS.includes(value as PhotoProVariantCount) ? value as PhotoProVariantCount : 1;
}

function getPhotoProViewAngleInstruction(viewAngle: PhotoProViewAngle | null | undefined) {
  return PHOTO_PRO_VIEW_ANGLES.find((option) => option.id === viewAngle)?.promptInstruction || "";
}

function buildPhotoProPrompt(userInstructions: string, viewAngle: PhotoProViewAngle | null | undefined) {
  const trimmedInstructions = userInstructions.trim();
  const viewAngleInstruction = getPhotoProViewAngleInstruction(viewAngle);

  return [
    STUDIO_BRIEF,
    PHOTO_PRO_CREATIVE_DIRECTION,
    "Si le produit est mal mis en scène ou n'a pas l'air appétissant, améliore sa présentation, son volume visuel, la gourmandise, les textures et la lumière tout en préservant le produit, les ingrédients, le packaging, les logos et les textes présents.",
    viewAngleInstruction ? `Angle de vue obligatoire sélectionné par le restaurateur: ${viewAngleInstruction}` : "",
    trimmedInstructions ? `Consignes du restaurateur à appliquer visiblement: ${trimmedInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildPhotoProVariantPrompt(basePrompt: string, index: number, total: number, viewAngle: PhotoProViewAngle | null | undefined) {
  if (total <= 1) return basePrompt;

  const variationInstruction = viewAngle === "same_angle"
    ? "produire une interprétation distincte avec une lumière, une mise en scène, un fond, une profondeur de champ ou un styling culinaire différent des autres variantes, sans changer l'angle de vue ni la logique de cadrage de la photo source"
    : "produire une interprétation distincte avec une mise en scène, une lumière, une profondeur de champ ou un cadrage différent des autres variantes";

  return [
    basePrompt,
    `Variante ${index + 1}/${total}: ${variationInstruction}, tout en gardant exactement le même produit source, les logos, les textes, le packaging et les ingrédients reconnaissables.`,
  ].join("\n\n");
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
  dishName: string;
  userInstructions: string;
  format: TokImageFormat;
  outputResolution: TokImageOutputResolution;
  viewAngle: PhotoProViewAngle | null;
  variantCount: PhotoProVariantCount;
  results: TokImageGenerationResult[];
  result: TokImageGenerationResult | null;
};

const DEFAULT_DRAFT: PhotoStudioDraft = {
  sourceImageUrl: "",
  dishName: "",
  userInstructions: "",
  format: "landscape",
  outputResolution: "studio",
  viewAngle: null,
  variantCount: 1,
  results: [],
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
  const logoSrc = useTokLogoSrc();
  const mountedRef = useRef(true);
  const storageKey = `tok-ai-photo-studio-v2:${restaurantId || "pending"}`;
  const [draft, setDraft, clearDraft] = useSessionStorageState<PhotoStudioDraft>(storageKey, DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<TokImageGenerationResult | null>(null);
  const selectedVariantCount = getNormalizedPhotoProVariantCount(draft.variantCount);
  const results = draft.results?.length ? draft.results : draft.result ? [draft.result] : [];
  const result = results[0] || null;
  const previewedResult = previewResult || result;
  const generatedImageUrl = previewedResult?.gallery_image_url || previewedResult?.generated_image_url || "";
  const downloadFileName = buildTokPhotoDownloadFileName(draft.dishName || previewedResult?.title || "visuel-tok");
  const selectedOutputResolution: TokImageOutputResolution = "studio";
  const outputPricing = getTokImageOutputPricing(draft.format, selectedOutputResolution);
  const totalPhotoCredits = outputPricing.photoCredits * selectedVariantCount;
  const shouldApplyTokWatermark = !isTokProOrHigherRestaurantSubscription(watermarkSubscription);

  const updateDraft = (nextDraft: Partial<PhotoStudioDraft>) => {
    setDraft((previous) => ({ ...previous, ...nextDraft }));
  };

  useEffect(() => {
    setActiveAiCreationContext("dashboard-photos:photopro");
    return () => setActiveAiCreationContext(null);
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const generate = async () => {
    if (!restaurantId) return;
    if (!draft.sourceImageUrl.trim()) {
      toast({ title: "Photo requise", description: "Ajoutez la photo brute du produit ou du plat.", variant: "destructive" });
      return;
    }
    if (!draft.viewAngle) {
      toast({ title: "Angle requis", description: "Cliquez sur un angle de vue PhotoPro avant de lancer la génération.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setPreviewOpen(false);
    setPreviewResult(null);
    updateDraft({ result: null, results: [] });
    try {
      void requestAiCreationNotificationPermission();
      const basePrompt = buildPhotoProPrompt(draft.userInstructions || "", draft.viewAngle);
      const jobs = Array.from({ length: selectedVariantCount }, (_, index) => {
        const request = {
          restaurantId,
          sourceImageUrl: draft.sourceImageUrl,
          dishName: draft.dishName || null,
          prompt: buildPhotoProVariantPrompt(basePrompt, index, selectedVariantCount, draft.viewAngle),
          assetType: "menu_visual",
          format: draft.format,
          outputResolution: selectedOutputResolution,
          variantCount: 1,
          generateImage: true,
          imageOnly: true,
        } as const;
        const { promise } = startTokImageCreationJob({
          restaurantId,
          userId,
          tool: "photopro",
          title: selectedVariantCount > 1
            ? `${draft.dishName || "Retouche PhotoPro"} - variante ${index + 1}/${selectedVariantCount}`
            : draft.dishName || "Retouche PhotoPro",
          request,
        });
        return promise;
      });
      const settledResults = await Promise.allSettled(jobs);
      const successfulResults = settledResults
        .filter((job): job is PromiseFulfilledResult<TokImageGenerationResult> => job.status === "fulfilled")
        .map((job) => job.value);
      const firstFailure = settledResults.find((job): job is PromiseRejectedResult => job.status === "rejected");

      if (!successfulResults.length) {
        throw firstFailure?.reason || new Error("PhotoPro n'a pas pu générer de variante.");
      }
      if (!mountedRef.current) return;
      updateDraft({ result: successfulResults[0] || null, results: successfulResults });
      toast({
        title: successfulResults.length > 1 ? "Variantes PhotoPro prêtes" : "Visuel TOK prêt",
        description: firstFailure
          ? `${successfulResults.length}/${selectedVariantCount} variante(s) générée(s). Contrôlez le produit source avant publication.`
          : "Contrôlez que le produit source est toujours reconnaissable avant publication.",
      });
    } catch (error) {
      if (!mountedRef.current) return;
      toast({ title: "Erreur IA", description: formatPhotoGenerationError(error), variant: "destructive" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const addToGallery = async (selectedResult = previewedResult) => {
    if (!restaurantId) return;
    if (!selectedResult?.gallery_image_url) {
      toast({
        title: "Galerie indisponible",
        description: "Le visuel TOK n'a pas encore d'URL publique stable. Relancez la génération avant l'ajout.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase.from("restaurant_media").insert({
      restaurant_id: restaurantId,
      media_url: selectedResult.gallery_image_url,
      alt_text: selectedResult.alt_text || selectedResult.title || draft.dishName || "Visuel TOK",
      media_type: "photo_ai_tok",
      uploaded_by: userId || null,
      position: currentPhotoCount,
      storage_bucket: selectedResult.gallery_storage_bucket,
      storage_path: selectedResult.gallery_storage_path,
      metadata: buildRestaurantMediaAiMetadata({
        result: selectedResult,
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

  const downloadGeneratedPhoto = async (selectedResult = previewedResult) => {
    const selectedImageUrl = selectedResult?.gallery_image_url || selectedResult?.generated_image_url || "";
    if (!selectedImageUrl) return;

    try {
      await downloadImageWithWatermark({
        imageUrl: selectedImageUrl,
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
            <ImageUpload
              label="Photo brute du produit ou plat"
              value={draft.sourceImageUrl}
              onChange={(sourceImageUrl) => updateDraft({ sourceImageUrl, result: null, results: [] })}
              showUrlInput={false}
            />
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
                  onChange={(event) => updateDraft({ format: event.target.value as TokImageFormat, result: null, results: [] })}
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
                onChange={(event) => updateDraft({ userInstructions: event.target.value, result: null, results: [] })}
                placeholder="Ex. rendre le produit plus gourmand, corriger la mise en scène, ajouter une lumière plus chaude..."
                className="min-h-[110px]"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Optionnel. PhotoPro garde le produit source mais peut corriger une mise en scène faible ou rendre le rendu plus appétissant.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Angle de vue PhotoPro</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PHOTO_PRO_VIEW_ANGLES.map((angle) => {
                  const selected = draft.viewAngle === angle.id;
                  return (
                    <Button
                      key={angle.id}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      onClick={() => updateDraft({ viewAngle: angle.id, result: null, results: [] })}
                      className={selected ? "justify-center bg-orange-600 text-white hover:bg-orange-700" : "justify-center border-orange-200 text-orange-800 hover:bg-orange-50"}
                    >
                      {angle.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Obligatoire. Cliquez sur un angle pour orienter clairement la génération PhotoPro.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nombre de variantes</Label>
              <div className="grid grid-cols-4 gap-2">
                {PHOTO_PRO_VARIANT_OPTIONS.map((count) => {
                  const selected = selectedVariantCount === count;
                  return (
                    <Button
                      key={count}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      onClick={() => updateDraft({ variantCount: count, result: null, results: [] })}
                      className={selected ? "bg-orange-600 text-white hover:bg-orange-700" : "border-orange-200 text-orange-800 hover:bg-orange-50"}
                    >
                      {count}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Chaque variante lance une génération indépendante. La génération peut durer jusqu'à plusieurs minutes.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Configuration image</Label>
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
                <span className="block font-semibold">{outputPricing.modelLabel}</span>
                <span className="mt-1 block text-xs leading-5">
                  {outputPricing.size} - qualité {outputPricing.quality}
                </span>
                <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-xs font-bold text-orange-700">
                  {totalPhotoCredits} crédit{totalPhotoCredits > 1 ? "s" : ""} pour {selectedVariantCount} variante{selectedVariantCount > 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                TOK utilise uniquement GPT Image 2 en qualité medium pour les images.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={!restaurantId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer {selectedVariantCount} version{selectedVariantCount > 1 ? "s" : ""} TOK ({totalPhotoCredits} cr.)
              </Button>
              {result?.gallery_image_url ? <Button type="button" variant="outline" onClick={() => void addToGallery(result)}>Ajouter à la galerie</Button> : null}
              {draft.sourceImageUrl || result ? (
                <Button type="button" variant="ghost" onClick={clearDraft} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Nouveau
                </Button>
              ) : null}
            </div>
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

        {results.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{results.length > 1 ? "Variantes TOK prêtes" : "Version TOK prête"}</CardTitle>
              <CardDescription>
                {results.length > 1
                  ? "Comparez les variantes, agrandissez-les et ajoutez la meilleure à la galerie."
                  : "Contrôlez le rendu avant de l'ajouter à la galerie."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div>
                  <p className="mb-2 text-sm font-semibold">Avant</p>
                  <img src={draft.sourceImageUrl} alt="Photo source" className="aspect-video w-full rounded-xl border object-cover" />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Après TOK</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {results.map((item, index) => {
                      const itemImageUrl = item.gallery_image_url || item.generated_image_url || "";
                      if (!itemImageUrl) return null;

                      return (
                        <div key={item.gallery_storage_path || item.generated_image_url || index} className="rounded-2xl border bg-background p-2 shadow-sm">
                          <button
                            type="button"
                            aria-label={`Agrandir le visuel TOK généré variante ${index + 1}`}
                            onClick={() => {
                              setPreviewResult(item);
                              setPreviewOpen(true);
                            }}
                            className="group relative block aspect-video w-full overflow-hidden rounded-xl border bg-muted text-left"
                          >
                            {shouldApplyTokWatermark ? <TokLogoWatermark logoSrc={logoSrc} sizeClassName="h-16 w-16" /> : null}
                            <img
                              src={itemImageUrl}
                              alt={item.alt_text || `Visuel TOK variante ${index + 1}`}
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                            />
                            <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">
                              Variante {index + 1}
                            </span>
                            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                              <Maximize2 className="h-3.5 w-3.5" />
                              Agrandir
                            </span>
                          </button>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => void downloadGeneratedPhoto(item)} className="gap-2">
                              <Download className="h-4 w-4" />
                              Télécharger
                            </Button>
                            <Button type="button" size="sm" onClick={() => void addToGallery(item)}>
                              Ajouter
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Dialog
          open={previewOpen && Boolean(generatedImageUrl)}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setPreviewResult(null);
          }}
        >
          <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[92vh] sm:max-h-[92vh]">
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <DialogTitle>Visuel TOK généré</DialogTitle>
                  <DialogDescription>Prévisualisation grand format du visuel avant publication.</DialogDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {previewedResult?.gallery_image_url ? (
                    <Button type="button" variant="outline" onClick={() => void addToGallery(previewedResult)}>
                      Ajouter à la galerie
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" onClick={() => void downloadGeneratedPhoto(previewedResult)} className="gap-2">
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
                      alt={previewedResult?.alt_text || "Visuel TOK"}
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
