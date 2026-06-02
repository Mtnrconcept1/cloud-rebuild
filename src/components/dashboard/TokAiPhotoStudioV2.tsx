import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ImageUpload from "@/components/ImageUpload";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { generateTokDishImage, type TokImageFormat, type TokImageGenerationResult } from "@/lib/ai/tokAiClient";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

const supabase = getSupabase();
const STUDIO_BRIEF = "Retouche TOK premium: garder le plat, améliorer la composition, la lumière, la texture et ajouter une identité TOK discrète.";

type Props = {
  restaurantId: string | null | undefined;
  userId?: string | null;
  currentPhotoCount: number;
  onGalleryUpdated: () => void;
};

export default function TokAiPhotoStudioV2({ restaurantId, userId, currentPhotoCount, onGalleryUpdated }: Props) {
  const { toast } = useToast();
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [dishName, setDishName] = useState("");
  const [format, setFormat] = useState<TokImageFormat>("landscape");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TokImageGenerationResult | null>(null);

  const generate = async () => {
    if (!restaurantId) return;
    if (!sourceImageUrl) {
      toast({ title: "Photo requise", description: "Ajoutez la photo brute du plat.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await generateTokDishImage({
        restaurantId,
        sourceImageUrl,
        dishName: dishName || null,
        prompt: STUDIO_BRIEF,
        assetType: "campaign_visual",
        format,
        variantCount: 1,
        generateImage: true,
      });
      setResult(data);
      toast({ title: "Visuel TOK prêt", description: "Contrôlez le rendu puis ajoutez-le à la galerie." });
    } catch (error) {
      toast({ title: "Erreur IA", description: error instanceof Error ? error.message : "Génération impossible", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addToGallery = async () => {
    if (!restaurantId || !result?.generated_image_url) return;
    const { error } = await supabase.from("restaurant_media").insert({
      restaurant_id: restaurantId,
      media_url: result.generated_image_url,
      alt_text: result.alt_text || result.title || dishName || "Visuel TOK",
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
          Créez une version premium de vos photos de plats : composition plus forte, lumière chaude, rendu appétissant et signature TOK discrète.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <ImageUpload label="Photo brute" value={sourceImageUrl} onChange={setSourceImageUrl} showUrlInput={false} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom du plat</Label>
                <Input value={dishName} onChange={(event) => setDishName(event.target.value)} placeholder="Ex. assiette kebab" />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={format} onChange={(event) => setFormat(event.target.value as TokImageFormat)}>
                  <option value="landscape">16:9 campagne</option>
                  <option value="square">Carré fiche plat</option>
                  <option value="portrait">Portrait story</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={!restaurantId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer la version TOK
              </Button>
              {result?.generated_image_url ? <Button type="button" variant="outline" onClick={addToGallery}>Ajouter à la galerie</Button> : null}
            </div>
          </div>
          <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground shadow-sm">
            <p className="mb-2 font-semibold text-foreground">Rendu attendu</p>
            <p>Fond plus chaleureux, produit mieux éclairé, textures renforcées, sauces et éléments de décor cohérents, logo TOK discret lorsque la composition le permet.</p>
          </div>
        </div>

        {result ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardHeader><CardTitle>{result.title || "Version TOK prête"}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div><p className="mb-2 text-sm font-semibold">Avant</p><img src={sourceImageUrl} alt="Photo source" className="aspect-video w-full rounded-xl border object-cover" /></div>
                  {result.generated_image_url ? <div><p className="mb-2 text-sm font-semibold">Après TOK</p><img src={result.generated_image_url} alt={result.alt_text || "Visuel TOK"} className="aspect-video w-full rounded-xl border object-cover" /></div> : null}
                </div>
                <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{result.edit_instructions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Texte proposé</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{result.publication_caption}</p>
                {result.marketing_angles.length ? <ul className="space-y-1">{result.marketing_angles.map((item) => <li key={item}>- {item}</li>)}</ul> : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
