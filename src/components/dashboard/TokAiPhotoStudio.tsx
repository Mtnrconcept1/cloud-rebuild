import { useState } from "react";
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
import { CheckCircle2, Loader2, Megaphone, RotateCcw, Sparkles, Wand2 } from "lucide-react";

const supabase = getSupabase();

const TOK_RETOUCH_BRIEF = [
  "Retouche TOK premium fidèle: améliorer l'image source sans remplacer le sujet.",
  "Conserver strictement le même produit ou plat: même packaging, même contenant, même forme générale, mêmes couleurs dominantes, même marque ou étiquette visible lorsque c'est possible.",
  "Si la photo montre un produit emballé, une boîte, une bouteille, un sachet ou une conserve, créer un packshot premium du même emballage. Ne jamais le transformer en assiette servie ou plat inventé.",
  "Améliorer seulement la composition, le cadrage, la lumière chaude, les textures, les reflets et le décor secondaire TOK.",
  "Le résultat doit rester immédiatement reconnaissable comme la photo source retouchée.",
].join("\n");

type TokAiPhotoStudioProps = {
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

function formatLabel(format: TokImageFormat) {
  if (format === "square") return "Carré / fiche produit";
  if (format === "portrait") return "Portrait / story";
  return "16:9 / campagne";
}

export default function TokAiPhotoStudio({
  restaurantId,
  userId,
  currentPhotoCount,
  onGalleryUpdated,
}: TokAiPhotoStudioProps) {
  const { toast } = useToast();
  const storageKey = `tok-ai-photo-studio:${restaurantId || "pending"}`;
  const [draft, setDraft, clearDraft] = useSessionStorageState<PhotoStudioDraft>(storageKey, DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const result = draft.result;

  const updateDraft = (nextDraft: Partial<PhotoStudioDraft>) => {
    setDraft((previous) => ({ ...previous, ...nextDraft }));
  };

  const generate = async () => {
    if (!restaurantId) return;
    if (!draft.sourceImageUrl.trim()) {
      return toast({
        title: "Photo requise",
        description: "Ajoutez une photo brute du produit ou du plat avant de générer la version TOK.",
        variant: "destructive",
      });
    }

    setLoading(true);

    try {
      const data = await generateTokDishImage({
        restaurantId,
        sourceImageUrl: draft.sourceImageUrl,
        dishName: draft.dishName || null,
        prompt: TOK_RETOUCH_BRIEF,
        assetType: "menu_visual",
        format: draft.format,
        variantCount: 1,
        generateImage: true,
      });
      updateDraft({ result: data });
      toast({
        title: "Version TOK générée",
        description: "Contrôlez que le produit source est toujours reconnaissable avant publication.",
      });
    } catch (error) {
      toast({
        title: "Erreur génération IA",
        description: error instanceof Error ? error.message : "Erreur IA",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addToGallery = async () => {
    if (!restaurantId || !result?.generated_image_url) return;

    const { error } = await supabase.from("restaurant_media").insert({
      restaurant_id: restaurantId,
      media_url: result.generated_image_url,
      alt_text: result.alt_text || result.title || draft.dishName || "Visuel produit TOK généré par IA",
      media_type: "photo_ai_tok",
      uploaded_by: userId || null,
      position: currentPhotoCount,
    });

    if (error) {
      return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }

    toast({ title: "Visuel ajouté", description: "Le visuel IA a été ajouté à la galerie du restaurant." });
    onGalleryUpdated();
  };

  return (
    <Card className="overflow-hidden border-orange-200/70 bg-gradient-to-br from-orange-50 via-background to-background dark:border-orange-900/50 dark:from-orange-950/20">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-orange-600 text-white hover:bg-orange-600">Studio TOK</Badge>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-orange-600" /> Studio IA Photo
          </CardTitle>
        </div>
        <CardDescription>
          Transformez une photo brute en visuel premium sans changer le produit, son packaging ou l'identité du plat source.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <ImageUpload
              label="Photo brute du produit ou plat"
              value={draft.sourceImageUrl}
              onChange={(sourceImageUrl) => updateDraft({ sourceImageUrl, result: null })}
              showUrlInput={false}
            />

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label>Nom du produit ou plat</Label>
                <Input
                  value={draft.dishName}
                  onChange={(event) => updateDraft({ dishName: event.target.value })}
                  placeholder="Ex. produit emballé, tacos poulet, salade..."
                />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.format}
                  onChange={(event) => updateDraft({ format: event.target.value as TokImageFormat, result: null })}
                >
                  <option value="landscape">16:9 / campagne</option>
                  <option value="square">Carré / fiche produit</option>
                  <option value="portrait">Portrait / story</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={!restaurantId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer la version TOK
              </Button>
              {result?.generated_image_url ? (
                <Button type="button" variant="outline" onClick={addToGallery}>
                  Ajouter à la galerie
                </Button>
              ) : null}
              {draft.sourceImageUrl || result ? (
                <Button type="button" variant="ghost" onClick={clearDraft} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Nouveau
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Rendu attendu</p>
            <ul className="mt-3 space-y-2">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Même produit ou plat conservé et immédiatement reconnaissable.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Packaging, contenant, marque et couleurs préservés si présents.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Lumière chaude, textures renforcées, contraste premium.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Interdiction de remplacer un emballage par un plat servi.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Format sélectionné : {formatLabel(draft.format)}.</li>
            </ul>
          </div>
        </div>

        {result ? (
          <div className="space-y-5 rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{result.title || "Version TOK"}</p>
                <p className="text-sm text-muted-foreground">Aperçu avant / après et texte marketing proposé.</p>
              </div>
              <Badge variant="secondary">{result.status === "stored" ? "Image prête" : "Brouillon"}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Avant</p>
                <img src={draft.sourceImageUrl} alt="Photo brute du produit ou plat" className="aspect-video w-full rounded-lg border object-cover" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Après TOK</p>
                {result.generated_image_url ? (
                  <img src={result.generated_image_url} alt={result.alt_text || "Visuel TOK généré"} className="aspect-video w-full rounded-lg border object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
                    Image en cours de préparation
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Megaphone className="h-4 w-4 text-orange-600" />
                  Texte marketing proposé
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.publication_caption}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-semibold">Points de contrôle</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {["Même sujet que la source", "Packaging/contenant préservé", ...result.checklist].slice(0, 5).map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
