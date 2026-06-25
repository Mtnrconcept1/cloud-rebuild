import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TOK_IMAGE_OUTPUT_OPTIONS,
  getTokImageOutputPricing,
  type TokImageOutputResolution,
} from "@/lib/ai/imagePricing";
import { downloadImageWithWatermark } from "@/lib/media/downloadImageWithWatermark";
import { CheckCircle2, Download, Loader2, Maximize2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useTokLogoSrc } from "@/hooks/useTokLogo";

const supabase = getSupabase();
const STUDIO_BRIEF =
  "améliore cette photo pour un rendu professionnel, photographie culinaire. ajoute un fond esthétique et améliore la forme de l'aliment";

type Props = {
  restaurantId: string | null | undefined;
  userId?: string | null;
  currentPhotoCount: number;
  onGalleryUpdated: () => void;
};

type PhotoStudioDraft = {
  sourceImageUrl: string;
  dishName: string;
  format: TokImageFormat;
  outputResolution: TokImageOutputResolution;
  result: TokImageGenerationResult | null;
};

const DEFAULT_DRAFT: PhotoStudioDraft = {
  sourceImageUrl: "",
  dishName: "",
  format: "landscape",
  outputResolution: "studio",
  result: null,
};

function formatPhotoGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("rate_limited")) {
    return "Trop de générations lancées. Patientez quelques minutes avant de relancer un essai.";
  }

  if (message.includes("Unauthorized") || message.includes("Session expir")) {
    return "Session expirée. Reconnectez-vous puis relancez la génération.";
  }

  if (message.includes("source_image_edit_required") || message.includes("image_edit_failed")) {
    return "La retouche IA n'a pas pu finaliser cette photo. Recadrez le produit principal ou relancez avec une photo JPG, PNG ou WebP bien éclairée.";
  }

  if (message.includes("image_edit_timeout") || message.includes("image_generation_timeout")) {
    return "La retouche a pris trop de temps. Essayez avec une photo plus légère ou relancez la génération.";
  }

  if (message.includes("source_image_unsupported_type")) {
    return "Format non pris en charge par le studio IA. Utilisez une photo JPG, PNG ou WebP.";
  }

  if (message.includes("source_image_too_large")) {
    return "Photo trop lourde pour la retouche IA. Compressez-la sous 10 Mo puis relancez.";
  }

  if (message.includes("ai_credits_exhausted")) {
    return "Les credits image OpenAI sont insuffisants cote serveur.";
  }

  if (message.includes("ai_service_unavailable")) {
    return "Le service image IA est indisponible. L'equipe TOK doit verifier la cle OpenAI de la fonction Supabase.";
  }

  return message || "Génération impossible";
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

function TokLogoGenerationLoader({ logoSrc }: { logoSrc: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-black">
      <div className="relative isolate flex min-h-[260px] w-full items-center justify-center overflow-hidden px-6 py-8 text-white">
        <style>{`
          @keyframes tokStudioBackdrop {
            0%, 100% { opacity: 0.72; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.04); }
          }
          @keyframes tokLogoPulse {
            0%, 100% { transform: scale(0.985); }
            50% { transform: scale(1.035); }
          }
          @keyframes tokLogoGlow {
            0%, 100% { opacity: 0.9; }
            50% { opacity: 1; }
          }
          @keyframes tokHaloSoft {
            0%, 100% { transform: scale(0.94); opacity: 0.3; }
            50% { transform: scale(1.08); opacity: 0.56; }
          }
          @keyframes tokHaloStrong {
            0%, 100% { transform: scale(0.98); opacity: 0.12; }
            50% { transform: scale(1.14); opacity: 0.24; }
          }
          @keyframes tokOrbit {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes tokOrbitReverse {
            from { transform: rotate(360deg); }
            to { transform: rotate(0deg); }
          }
          @keyframes tokStatusPulse {
            0%, 100% { transform: scale(1); opacity: 0.74; }
            50% { transform: scale(1.08); opacity: 1; }
          }
          @keyframes tokLogoShine {
            0%, 100% { opacity: 0.12; transform: translateX(-56px) rotate(-18deg); }
            50% { opacity: 0.36; transform: translateX(56px) rotate(-18deg); }
          }
          @keyframes tokStudioScan {
            0% { transform: translateY(-118%); opacity: 0; }
            18% { opacity: 0.78; }
            58% { opacity: 0.42; }
            100% { transform: translateY(118%); opacity: 0; }
          }
          @keyframes tokStudioGrain {
            0%, 100% { opacity: 0.18; transform: translate3d(0, 0, 0); }
            50% { opacity: 0.28; transform: translate3d(-1.5%, 1%, 0); }
          }
          @keyframes tokStageFill {
            0% { transform: scaleX(0.14); }
            38% { transform: scaleX(0.56); }
            72% { transform: scaleX(0.84); }
            100% { transform: scaleX(0.98); }
          }
          @keyframes tokStageDot {
            0%, 100% { opacity: 0.4; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(-2px); }
          }
          .tok-studio-backdrop {
            animation: tokStudioBackdrop 5.8s ease-in-out infinite;
            transform-origin: center;
          }
          .tok-logo-pulse {
            animation: tokLogoPulse 3s ease-in-out infinite;
            transform-origin: center;
          }
          .tok-logo-glow {
            animation: tokLogoGlow 3s ease-in-out infinite;
            filter:
              drop-shadow(0 0 10px rgba(255,255,255,0.12))
              drop-shadow(0 0 18px rgba(255,147,41,0.22))
              drop-shadow(0 0 36px rgba(255,98,0,0.18));
          }
          .tok-halo-soft {
            animation: tokHaloSoft 3s ease-in-out infinite;
          }
          .tok-halo-strong {
            animation: tokHaloStrong 3s ease-in-out infinite;
          }
          .tok-orbit {
            animation: tokOrbit 5.2s linear infinite;
            transform-origin: center;
          }
          .tok-orbit-slow {
            animation: tokOrbitReverse 8.2s linear infinite;
            transform-origin: center;
          }
          .tok-dot {
            animation: tokOrbit 2.8s linear infinite;
            transform-origin: center;
          }
          .tok-dot-2 {
            animation: tokOrbitReverse 4.4s linear infinite;
            transform-origin: center;
          }
          .tok-status {
            animation: tokStatusPulse 2.4s ease-in-out infinite;
          }
          .tok-shine {
            animation: tokLogoShine 4.8s ease-in-out infinite;
          }
          .tok-studio-scan {
            animation: tokStudioScan 3.4s ease-in-out infinite;
          }
          .tok-studio-grain {
            animation: tokStudioGrain 4.2s ease-in-out infinite;
          }
          .tok-stage-fill {
            animation: tokStageFill 3.8s ease-in-out infinite alternate;
            transform-origin: left;
          }
          .tok-stage-dot {
            animation: tokStageDot 1.8s ease-in-out infinite;
          }
          .tok-stage-dot:nth-child(2) {
            animation-delay: 0.18s;
          }
          .tok-stage-dot:nth-child(3) {
            animation-delay: 0.36s;
          }
          @media (prefers-reduced-motion: reduce) {
            .tok-studio-backdrop,
            .tok-logo-pulse,
            .tok-logo-glow,
            .tok-halo-soft,
            .tok-halo-strong,
            .tok-orbit,
            .tok-orbit-slow,
            .tok-dot,
            .tok-dot-2,
            .tok-status,
            .tok-shine,
            .tok-studio-scan,
            .tok-studio-grain,
            .tok-stage-fill,
            .tok-stage-dot {
              animation: none;
            }
          }
        `}</style>

        <div className="tok-studio-backdrop absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(70,165,255,0.12),transparent_22%),radial-gradient(circle_at_68%_26%,rgba(255,176,58,0.12),transparent_24%),radial-gradient(circle_at_50%_50%,rgba(255,120,0,0.09),transparent_16%),radial-gradient(circle_at_50%_50%,rgba(255,170,40,0.07),transparent_31%),linear-gradient(180deg,#000000_0%,#020202_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.18)_56%,rgba(0,0,0,0.84)_100%)]" />
        <div className="tok-studio-grain absolute inset-0 opacity-20 mix-blend-screen [background-image:linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="tok-studio-scan absolute left-0 right-0 top-0 h-24 bg-gradient-to-b from-transparent via-white/10 to-transparent blur-[1px]" />

        <div className="relative aspect-square w-[min(66vw,240px)]">
          <div className="tok-halo-soft absolute inset-[16%] rounded-full bg-[#ff981f]/18 blur-[38px]" />
          <div className="tok-halo-strong absolute inset-[4%] rounded-full bg-[#ff5b00]/12 blur-[74px]" />

          <div
            className="tok-orbit absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(255,160,32,0) 0deg, rgba(255,160,32,0.04) 26deg, rgba(255,204,92,0.85) 74deg, rgba(255,138,20,1) 102deg, rgba(255,94,0,0.9) 122deg, rgba(255,160,32,0.06) 160deg, rgba(255,160,32,0) 220deg, rgba(255,160,32,0) 360deg)",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 10px))",
              mask:
                "radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 10px))",
              filter:
                "drop-shadow(0 0 10px rgba(255,181,64,0.62)) drop-shadow(0 0 28px rgba(255,112,0,0.26))",
            }}
          />

          <div
            className="tok-orbit-slow absolute inset-[10px] rounded-full opacity-80"
            style={{
              background:
                "conic-gradient(from 180deg, rgba(255,190,70,0) 0deg, rgba(255,174,0,0.07) 92deg, rgba(255,214,124,0.9) 132deg, rgba(255,140,0,0.24) 150deg, rgba(255,174,0,0) 220deg, rgba(255,174,0,0) 360deg)",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 3px))",
              mask:
                "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 3px))",
              filter: "blur(1px)",
            }}
          />

          <div className="absolute inset-[20px] rounded-full border border-[#ffb24a]/60 shadow-[0_0_24px_rgba(255,145,28,0.18)]" />

          <div className="tok-dot absolute inset-0">
            <div className="absolute left-1/2 top-[2px] h-4 w-4 -translate-x-1/2 rounded-full bg-[#ffd58a] blur-[0.5px] shadow-[0_0_14px_rgba(255,201,116,0.95),0_0_34px_rgba(255,134,24,0.55)]" />
          </div>

          <div className="tok-dot-2 absolute inset-[12px] opacity-75">
            <div className="absolute bottom-[1px] left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#ff971f] blur-[0.3px] shadow-[0_0_10px_rgba(255,151,31,0.85),0_0_24px_rgba(255,92,0,0.4)]" />
          </div>

          <div className="absolute inset-[44px] flex items-center justify-center">
            <div className="tok-logo-pulse relative flex h-full w-full items-center justify-center rounded-full">
              <div className="absolute inset-0 rounded-full bg-white/[0.03] ring-1 ring-white/10 backdrop-blur-[2px]" />
              <div className="absolute inset-[8%] overflow-hidden rounded-full">
                <div className="tok-shine absolute left-0 top-[-10%] h-[130%] w-[18%] bg-white/20 blur-[10px]" />
              </div>
              <img
                src={logoSrc}
                alt="Logo TOK"
                className="tok-logo-glow relative z-10 h-[58%] w-[58%] object-contain"
                draggable={false}
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 h-px w-36 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-white/78">
            Création de l’image
          </p>
          <div className="mt-2 flex items-center gap-2 text-white/54">
            <span className="tok-status inline-block h-2.5 w-2.5 rounded-full bg-[#ff9a1f] shadow-[0_0_12px_rgba(255,154,31,0.75)]" />
            <span className="text-[11px] uppercase tracking-[0.24em]">Retouche, lumière, export galerie</span>
          </div>
          <div className="mt-4 w-full max-w-[240px]">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="tok-stage-fill h-full w-full rounded-full bg-gradient-to-r from-[#47a5ff] via-[#ffd37a] to-[#ff8a1f] shadow-[0_0_18px_rgba(255,151,31,0.55)]" />
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="tok-stage-dot h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="tok-stage-dot h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="tok-stage-dot h-1.5 w-1.5 rounded-full bg-white/50" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TokAiPhotoStudioV2({ restaurantId, userId, currentPhotoCount, onGalleryUpdated }: Props) {
  const { toast } = useToast();
  const logoSrc = useTokLogoSrc();
  const mountedRef = useRef(true);
  const storageKey = `tok-ai-photo-studio-v2:${restaurantId || "pending"}`;
  const [draft, setDraft, clearDraft] = useSessionStorageState<PhotoStudioDraft>(storageKey, DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const result = draft.result;
  const generatedImageUrl = result?.gallery_image_url || result?.generated_image_url || "";
  const downloadFileName = buildTokPhotoDownloadFileName(draft.dishName || result?.title || "visuel-tok");
  const selectedOutputResolution = draft.outputResolution || "studio";
  const outputPricing = getTokImageOutputPricing(draft.format, selectedOutputResolution);

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

    setLoading(true);
    setPreviewOpen(false);
    updateDraft({ result: null });
    try {
      void requestAiCreationNotificationPermission();
      const request = {
        restaurantId,
        sourceImageUrl: draft.sourceImageUrl,
        dishName: draft.dishName || null,
        prompt: STUDIO_BRIEF,
        assetType: "campaign_visual",
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
        title: draft.dishName || "Retouche PhotoPro",
        request,
      });
      const data = await promise;
      if (!mountedRef.current) return;
      updateDraft({ result: data });
      toast({ title: "Visuel TOK prêt", description: "Contrôlez que le produit source est toujours reconnaissable avant publication." });
    } catch (error) {
      if (!mountedRef.current) return;
      toast({ title: "Erreur IA", description: formatPhotoGenerationError(error), variant: "destructive" });
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
    const { error } = await supabase.from("restaurant_media").insert({
      restaurant_id: restaurantId,
      media_url: result.gallery_image_url,
      alt_text: result.alt_text || result.title || draft.dishName || "Visuel TOK",
      media_type: "photo_ai_tok",
      uploaded_by: userId || null,
      position: currentPhotoCount,
      storage_bucket: result.gallery_storage_bucket,
      storage_path: result.gallery_storage_path,
    });
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Ajouté à la galerie" });
    onGalleryUpdated();
  };

  const downloadGeneratedPhoto = async () => {
    if (!generatedImageUrl) return;

    try {
      await downloadImageWithWatermark({
        imageUrl: generatedImageUrl,
        fileName: downloadFileName,
        watermarkUrl: logoSrc,
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
              onChange={(sourceImageUrl) => updateDraft({ sourceImageUrl, result: null })}
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
                  onChange={(event) => updateDraft({ format: event.target.value as TokImageFormat, result: null })}
                >
                  <option value="landscape">16:9 campagne</option>
                  <option value="square">Carré fiche produit</option>
                  <option value="portrait">Portrait story</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Resolution de sortie</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {TOK_IMAGE_OUTPUT_OPTIONS.map((option) => {
                  const pricing = getTokImageOutputPricing(draft.format, option.value);
                  const selected = selectedOutputResolution === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateDraft({ outputResolution: option.value, result: null })}
                      className={`min-w-0 rounded-2xl border p-3 text-left text-sm transition ${
                        selected
                          ? "border-orange-400 bg-orange-50 text-orange-950 shadow-sm"
                          : "border-border bg-background hover:border-orange-200"
                      }`}
                    >
                      <span className="block font-semibold">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{pricing.size} - qualite {option.quality}</span>
                      <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-xs font-bold text-orange-700">
                        {pricing.photoCredits} credit{pricing.photoCredits > 1 ? "s" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Estimation OpenAI: {outputPricing.outputCostChf.toFixed(3)} CHF par image, hors petite part de tokens d'entree.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={!restaurantId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer la version TOK ({outputPricing.photoCredits} cr.)
              </Button>
              {result?.gallery_image_url ? <Button type="button" variant="outline" onClick={addToGallery}>Ajouter à la galerie</Button> : null}
              {draft.sourceImageUrl || result ? (
                <Button type="button" variant="ghost" onClick={clearDraft} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Nouveau
                </Button>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground shadow-sm">
            {loading ? (
              <TokLogoGenerationLoader logoSrc={logoSrc} />
            ) : (
              <>
                <p className="mb-2 font-semibold text-foreground">Rendu attendu</p>
                <ul className="space-y-2">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Même produit ou plat que la source, immédiatement reconnaissable.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Packaging, contenant, marque, textes et couleurs préservés si présents.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Éclairage studio, fond nettoyé, profondeur de champ douce, textures renforcées et logo TOK ajouté en calque transparent séparé.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Un emballage ne doit jamais devenir une assiette servie.</li>
                </ul>
              </>
            )}
          </div>
        </div>

        {result ? (
          <Card>
            <CardHeader><CardTitle>Version TOK prête</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <div><p className="mb-2 text-sm font-semibold">Avant</p><img src={draft.sourceImageUrl} alt="Photo source" className="aspect-video w-full rounded-xl border object-cover" /></div>
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
                      <TokLogoWatermark logoSrc={logoSrc} sizeClassName="h-16 w-16" />
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
                    <TokLogoWatermark logoSrc={logoSrc} className="left-4 top-4" sizeClassName="h-16 w-16" />
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
