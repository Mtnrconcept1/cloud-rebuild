import { useId, useState } from "react";
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
import { generateTokDishImage, type TokImageFormat, type TokImageGenerationResult } from "@/lib/ai/tokAiClient";
import { CheckCircle2, Download, Loader2, Maximize2, RotateCcw, Sparkles, Wand2 } from "lucide-react";

const supabase = getSupabase();
const STUDIO_BRIEF =
  "Améliore l’image en donnant un aspect de photographie professionnelle, éclairage incroyable, en gardant le produit identique. Supprime les objets et éléments parasites mais préserve la nature des aliments présents sur l’image. Ajoute le logo TOK en haut à gauche ou dans le coin libre le plus naturel selon la disposition du produit, entièrement visible et avec une marge intérieure.";

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
  result: TokImageGenerationResult | null;
};

const DEFAULT_DRAFT: PhotoStudioDraft = {
  sourceImageUrl: "",
  dishName: "",
  format: "landscape",
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
    return "Impossible de retoucher fidèlement cette photo. Essayez avec une image plus nette ou moins lourde.";
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

function WineGlassGenerationLoader() {
  const id = useId().replace(/:/g, "");
  const clipId = `tok-wine-glass-clip-${id}`;
  const gradientId = `tok-wine-gradient-${id}`;

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
      <style>{`
        @keyframes tokWineFill {
          0%, 100% { transform: scaleY(0.12); }
          68% { transform: scaleY(1); }
        }
        @keyframes tokWineWave {
          0% { transform: translateX(-28px); }
          100% { transform: translateX(28px); }
        }
        @keyframes tokWineGlow {
          0%, 100% { opacity: 0.34; transform: scale(0.96); }
          50% { opacity: 0.7; transform: scale(1.04); }
        }
        .tok-wine-fill-layer {
          animation: tokWineFill 3.4s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        .tok-wine-wave {
          animation: tokWineWave 2.2s ease-in-out infinite alternate;
        }
        .tok-wine-glow {
          animation: tokWineGlow 2.6s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .tok-wine-fill-layer,
          .tok-wine-wave,
          .tok-wine-glow {
            animation: none;
          }
          .tok-wine-fill-layer {
            transform: scaleY(0.72);
          }
        }
      `}</style>
      <div className="relative">
        <div className="tok-wine-glow absolute inset-x-4 bottom-2 h-8 rounded-full bg-red-500/20 blur-xl" />
        <svg
          className="relative h-36 w-32 drop-shadow-sm"
          viewBox="0 0 160 210"
          role="img"
          aria-label="Verre de vin en cours de remplissage"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="45%" stopColor="#dc2626" />
              <stop offset="100%" stopColor="#7f1d1d" />
            </linearGradient>
            <clipPath id={clipId}>
              <path d="M42 18h76c-3 45-9 78-22 96-8 11-18 17-28 17s-20-6-28-17C27 96 45 63 42 18Z" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <g className="tok-wine-fill-layer">
              <rect x="33" y="37" width="94" height="92" rx="6" fill={`url(#${gradientId})`} />
              <path
                className="tok-wine-wave"
                d="M30 45c11-7 22-7 33 0s22 7 33 0 22-7 33 0v14H30Z"
                fill="rgba(255,255,255,0.28)"
              />
            </g>
          </g>
          <path
            d="M42 18h76c-3 45-9 78-22 96-8 11-18 17-28 17s-20-6-28-17C27 96 45 63 42 18Z"
            fill="rgba(255,255,255,0.28)"
            stroke="rgba(15,23,42,0.42)"
            strokeWidth="4"
          />
          <path d="M80 130v45" stroke="rgba(15,23,42,0.42)" strokeWidth="6" strokeLinecap="round" />
          <path d="M55 190h50" stroke="rgba(15,23,42,0.42)" strokeWidth="7" strokeLinecap="round" />
          <path d="M57 28c3 41 8 66 20 83" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">Génération en cours</p>
        <p className="text-xs text-muted-foreground">Le visuel TOK se prépare.</p>
      </div>
    </div>
  );
}

export default function TokAiPhotoStudioV2({ restaurantId, userId, currentPhotoCount, onGalleryUpdated }: Props) {
  const { toast } = useToast();
  const storageKey = `tok-ai-photo-studio-v2:${restaurantId || "pending"}`;
  const [draft, setDraft, clearDraft] = useSessionStorageState<PhotoStudioDraft>(storageKey, DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const result = draft.result;
  const generatedImageUrl = result?.gallery_image_url || result?.generated_image_url || "";
  const downloadFileName = buildTokPhotoDownloadFileName(draft.dishName || result?.title || "visuel-tok");

  const updateDraft = (nextDraft: Partial<PhotoStudioDraft>) => {
    setDraft((previous) => ({ ...previous, ...nextDraft }));
  };

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
      const data = await generateTokDishImage({
        restaurantId,
        sourceImageUrl: draft.sourceImageUrl,
        dishName: draft.dishName || null,
        prompt: STUDIO_BRIEF,
        assetType: "campaign_visual",
        format: draft.format,
        variantCount: 1,
        generateImage: true,
        imageOnly: true,
      });
      updateDraft({ result: data });
      toast({ title: "Visuel TOK prêt", description: "Contrôlez que le produit source est toujours reconnaissable avant publication." });
    } catch (error) {
      toast({ title: "Erreur IA", description: formatPhotoGenerationError(error), variant: "destructive" });
    } finally {
      setLoading(false);
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
    });
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Ajouté à la galerie" });
    onGalleryUpdated();
  };

  const downloadGeneratedPhoto = async () => {
    if (!generatedImageUrl) return;

    try {
      const response = await fetch(generatedImageUrl);
      if (!response.ok) throw new Error("download_failed");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      const link = document.createElement("a");
      link.href = generatedImageUrl;
      link.download = downloadFileName;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={!restaurantId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer la version TOK
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
              <WineGlassGenerationLoader />
            ) : (
              <>
                <p className="mb-2 font-semibold text-foreground">Rendu attendu</p>
                <ul className="space-y-2">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Même produit ou plat que la source, immédiatement reconnaissable.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Packaging, contenant, marque, textes et couleurs préservés si présents.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Lumière chaude, cadrage plus propre, textures renforcées et logo TOK discret.</li>
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
                <Button type="button" variant="outline" onClick={downloadGeneratedPhoto} className="gap-2">
                  <Download className="h-4 w-4" />
                  Télécharger
                </Button>
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 bg-black p-3 sm:p-5">
              {generatedImageUrl ? (
                <img
                  src={generatedImageUrl}
                  alt={result?.alt_text || "Visuel TOK"}
                  className="h-full w-full rounded-lg object-contain"
                />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
