import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/ImageUpload";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { generateTokDishImage, type TokImageFormat, type TokImageGenerationResult } from "@/lib/ai/tokAiClient";
import { Loader2, Megaphone, ShieldCheck, Sparkles, Wand2 } from "lucide-react";

const supabase = getSupabase();

const DEFAULT_AI_PROMPT = [
  "Transforme cette photo en visuel marketing premium TOK.",
  "Le plat doit rester reconnaissable et crédible, avec une présentation plus appétissante.",
  "Style attendu : photo studio food, lumière chaude, fond propre, touches orange TOK, ingrédients frais, contraste premium, aucun texte incrusté.",
].join(" ");

type TokAiPhotoStudioProps = {
  restaurantId: string | null | undefined;
  userId?: string | null;
  currentPhotoCount: number;
  onGalleryUpdated: () => void;
};

export default function TokAiPhotoStudio({
  restaurantId,
  userId,
  currentPhotoCount,
  onGalleryUpdated,
}: TokAiPhotoStudioProps) {
  const { toast } = useToast();
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [dishName, setDishName] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_AI_PROMPT);
  const [format, setFormat] = useState<TokImageFormat>("landscape");
  const [assetType, setAssetType] = useState<"menu_visual" | "campaign_visual" | "banner" | "image">("menu_visual");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TokImageGenerationResult | null>(null);

  const generate = async () => {
    if (!restaurantId) return;
    if (!sourceImageUrl.trim() && !prompt.trim()) {
      return toast({
        title: "Brief requis",
        description: "Ajoutez une photo source ou un brief de génération.",
        variant: "destructive",
      });
    }

    setLoading(true);
    setResult(null);

    try {
      const data = await generateTokDishImage({
        restaurantId,
        sourceImageUrl: sourceImageUrl || null,
        dishName: dishName || null,
        prompt,
        assetType,
        format,
        variantCount: 1,
        generateImage: true,
      });
      setResult(data);
      toast({
        title: "Visuel TOK généré",
        description: "Vérifiez le résultat, puis ajoutez-le à la galerie.",
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
      alt_text: result.alt_text || result.title || dishName || "Visuel plat TOK généré par IA",
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
          <Badge className="bg-orange-600 text-white hover:bg-orange-600">Nouveau</Badge>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-orange-600" /> Studio IA Photo TOK
          </CardTitle>
        </div>
        <CardDescription>
          Transformez une photo restaurateur en visuel marketing cohérent avec la charte TOK. L'outil utilise OpenAI côté serveur, garde le plat crédible, prépare une légende et stocke le visuel généré.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <ImageUpload label="Photo source du restaurateur" value={sourceImageUrl} onChange={setSourceImageUrl} />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Nom du plat</Label>
                <Input value={dishName} onChange={(event) => setDishName(event.target.value)} placeholder="Ex. tacos poulet, salade chèvre miel, tempura..." />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={format} onChange={(event) => setFormat(event.target.value as TokImageFormat)}>
                  <option value="landscape">16:9 / campagne</option>
                  <option value="square">Carré / fiche plat</option>
                  <option value="portrait">Portrait / story</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label>Usage</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={assetType} onChange={(event) => setAssetType(event.target.value as typeof assetType)}>
                  <option value="menu_visual">Fiche plat</option>
                  <option value="campaign_visual">Campagne</option>
                  <option value="banner">Bannière</option>
                  <option value="image">Image libre</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Objectif marketing</Label>
                <Textarea className="min-h-28" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={!restaurantId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer le visuel TOK
              </Button>
              {result?.generated_image_url ? (
                <Button type="button" variant="outline" onClick={addToGallery}>Ajouter à la galerie</Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border bg-background p-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Références de style</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Source interne : <span className="font-medium text-foreground">public/Ligne graphique plats</span></p>
                <p>Rendu attendu : avant/après premium, plat proche, fond sombre ou crème, orange TOK, lumière chaude, aucun texte incrusté.</p>
              </div>
            </div>
            <div className="rounded-2xl border bg-background p-3 shadow-sm">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Garde-fous</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Ne dénature pas le produit.</li>
                <li>N'ajoute pas de faux ingrédients essentiels.</li>
                <li>N'ajoute pas de texte, prix ou promesse médicale.</li>
                <li>Génération en brouillon avant publication.</li>
              </ul>
            </div>
          </div>
        </div>

        {result ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{result.title}</CardTitle>
                  <Badge variant="secondary">{result.status}</Badge>
                  <Badge variant="outline">{result.model}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {sourceImageUrl ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Avant</p>
                      <img src={sourceImageUrl} alt="Photo source" className="aspect-video w-full rounded-xl border object-cover" />
                    </div>
                  ) : null}
                  {result.generated_image_url ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Après TOK</p>
                      <img src={result.generated_image_url} alt={result.alt_text || "Visuel TOK généré"} className="aspect-video w-full rounded-xl border object-cover" />
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">
                  <p className="font-semibold">Brief créatif</p>
                  <p className="mt-1 text-muted-foreground">{result.edit_instructions}</p>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">
                  <p className="font-semibold">Prompt génératif TOK</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{result.enhanced_prompt}</p>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4" /> Légende marketing</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{result.publication_caption}</p>
                  <p className="text-xs">Alt text : {result.alt_text}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Angles de vente</CardTitle></CardHeader>
                <CardContent><ul className="space-y-1 text-sm text-muted-foreground">{result.marketing_angles.map((item) => <li key={item}>- {item}</li>)}</ul></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Checklist qualité</CardTitle></CardHeader>
                <CardContent><ul className="space-y-1 text-sm text-muted-foreground">{result.checklist.map((item) => <li key={item}>- {item}</li>)}</ul></CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
