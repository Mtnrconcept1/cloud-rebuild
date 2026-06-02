import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ImageUpload from "@/components/ImageUpload";
import { useToast } from "@/hooks/use-toast";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { getSupabase } from "@/integrations/supabase/client";
import { generateTokDishImage, type TokImageFormat, type TokImageGenerationResult } from "@/lib/ai/tokAiClient";
import { CheckCircle2, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";

const supabase = getSupabase();
const STUDIO_BRIEF = [
  "Retouche TOK premium fidèle: améliorer l'image source sans remplacer le sujet.",
  "Conserver strictement le même produit ou plat: même packaging, même contenant, même forme générale, mêmes couleurs dominantes, même marque ou étiquette visible lorsque c'est possible.",
  "Si la photo montre un produit emballé, une boîte, une bouteille, un sachet ou une conserve, créer un packshot premium du même emballage. Ne jamais le transformer en assiette servie ou plat inventé.",
  "Améliorer seulement la composition, le cadrage, la lumière chaude, les textures, les reflets et le décor secondaire TOK.",
  "Le résultat doit rester immédiatement reconnaissable comme la photo source retouchée.",
].join("\n");

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
  const result = draft.result;

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
      toast({ title: "Erreur IA", description: error instanceof Error ? error.message : "Génération impossible", variant: "destructive" });
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
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Lumière chaude, cadrage plus propre, textures renforcées et décor TOK discret.</li>
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
                {result.generated_image_url ? <div><p className="mb-2 text-sm font-semibold">Après TOK</p><img src={result.generated_image_url} alt={result.alt_text || "Visuel TOK"} className="aspect-video w-full rounded-xl border object-cover" /></div> : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </CardContent>
    </Card>
  );
}
