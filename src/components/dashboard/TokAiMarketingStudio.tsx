import { ChangeEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  generateTokDishImage,
  runRestaurantAgent,
  type TokImageFormat,
  type TokImageGenerationResult,
} from "@/lib/ai/tokAiClient";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  FileImage,
  FileText,
  ImagePlus,
  Loader2,
  LockKeyhole,
  Megaphone,
  Palette,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type MarketingToolId = "flyer" | "business_card" | "restaurant_menu";

type MarketingAssetKind = "logo" | "business_card" | "restaurant_menu" | "brand_visuals";

type MarketingResource = {
  id: string;
  kind: MarketingAssetKind;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

type Props = {
  restaurantId?: string | null;
};

type MarketingGenerationResult = Awaited<ReturnType<typeof runRestaurantAgent>>;
type MarketingImageResult = TokImageGenerationResult;

const MARKETING_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_MARKETING_ASSET_BYTES = 15 * 1024 * 1024;
const MARKETING_PROMPT_MAX_LENGTH = 900;
const MARKETING_SAFE_OUTPUT_NOTE =
  "Le prompt est traite comme une instruction non privilegiee: aucune commande, requete SQL, URL externe ou demande de secret n'est transmise comme regle systeme.";

const MARKETING_ASSET_KIND_LABELS: Record<MarketingAssetKind, string> = {
  logo: "Logo",
  business_card: "Carte de visite",
  restaurant_menu: "Carte du restaurant",
  brand_visuals: "Visuels existants",
};

const MARKETING_TOOLS: Array<{
  id: MarketingToolId;
  title: string;
  description: string;
  icon: LucideIcon;
  suggestions: string[];
}> = [
  {
    id: "flyer",
    title: "Flyer / affiche",
    description: "Creez des flyers, posters et visuels promotionnels coherents avec votre marque.",
    icon: Megaphone,
    suggestions: ["Soiree a theme", "Menu du jour", "Offre speciale", "Brunch du dimanche"],
  },
  {
    id: "business_card",
    title: "Carte de visite",
    description: "Generez une carte professionnelle a partir de votre logo et de votre style.",
    icon: BriefcaseBusiness,
    suggestions: ["Sobre premium", "Chef proprietaire", "Livraison", "QR code menu"],
  },
  {
    id: "restaurant_menu",
    title: "Carte du restaurant",
    description: "Creez ou modernisez une carte de restaurant lisible, elegante et imprimable.",
    icon: FileText,
    suggestions: ["Menu du soir", "Carte drinks", "Menu enfant", "Carte saisonniere"],
  },
];

const MARKETING_SECURITY_CHECKS = [
  "Types acceptes limites: PNG, JPG, WebP et PDF.",
  "Poids limite a 15 Mo par ressource avant toute analyse IA.",
  "Prompts filtres contre injection, HTML/script, chemins systeme et requetes SQL.",
  "Aucune cle, token, cookie ou donnee paiement ne doit etre inclus dans le prompt.",
  "Les ressources de marque restent rattachees au restaurant et doivent passer par Storage/RLS cote serveur avant production.",
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+les\s+instructions/i,
  /system\s*prompt/i,
  /developer\s*message/i,
  /jailbreak/i,
  /prompt\s*injection/i,
  /reveal\s+(the\s+)?(secret|token|key|password)/i,
  /affiche\s+(le\s+)?(secret|token|mot de passe|cle)/i,
  /<\s*script/i,
  /javascript:/i,
  /\.\.\/|\.\.\\|\/etc\/|c:\\/i,
];

const SQL_INJECTION_PATTERNS = [
  /\b(drop|delete|truncate|alter|insert|update|select)\b.+\b(from|table|where|into|set)\b/i,
  /;\s*(drop|delete|truncate|alter|insert|update|select)\b/i,
  /--|\/\*|\*\//,
  /\bor\s+1\s*=\s*1\b/i,
  /\bunion\s+select\b/i,
];

function sanitizeMarketingPrompt(value: string) {
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : char;
  })
    .join("")
    .replace(/[<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MARKETING_PROMPT_MAX_LENGTH);
}

function getMarketingPromptWarnings(prompt: string) {
  const warnings: string[] = [];
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(prompt))) {
    warnings.push("Le prompt contient une instruction de contournement ou une demande sensible.");
  }
  if (SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(prompt))) {
    warnings.push("Le prompt contient une structure proche d'une requete SQL ou d'une injection.");
  }
  if (prompt.length > MARKETING_PROMPT_MAX_LENGTH) {
    warnings.push(`Le prompt depasse ${MARKETING_PROMPT_MAX_LENGTH} caracteres.`);
  }
  return warnings;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function createMarketingResource(file: File, kind: MarketingAssetKind): MarketingResource {
  return {
    id: `${kind}-${file.name}-${file.lastModified}`,
    kind,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

function formatMarketingGenerationError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const message = rawMessage.toLowerCase();

  if (message.includes("ai_quota_exceeded") || message.includes("402")) {
    return "Le quota IA de ce restaurant est atteint pour la période en cours.";
  }
  if (message.includes("ai_service_unavailable") || message.includes("openai")) {
    return "Le service IA serveur n'est pas disponible pour le moment. Vérifiez la configuration IA côté Supabase avant de relancer.";
  }
  if (message.includes("unauthorized") || message.includes("401")) {
    return "Votre session a expiré. Reconnectez-vous avant de relancer le brief.";
  }
  if (message.includes("restaurant_required")) {
    return "Sélectionnez un restaurant avant de lancer le brief marketing.";
  }
  if (message.includes("rate") || message.includes("429")) {
    return "Trop de demandes IA ont été lancées. Réessayez dans quelques minutes.";
  }

  return rawMessage || "Impossible de générer le brief marketing.";
}

function formatMarketingImageGenerationError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const message = rawMessage.toLowerCase();

  if (message.includes("image_generation_timeout") || message.includes("image_edit_timeout")) {
    return "Le brief est prêt, mais la génération d'image a dépassé le délai serveur. Réessayez avec un brief plus court.";
  }
  if (message.includes("ai_rate_limited") || message.includes("429")) {
    return "Le brief est prêt, mais OpenAI limite temporairement les générations image. Réessayez dans quelques minutes.";
  }
  if (message.includes("ai_credits_exhausted") || message.includes("402")) {
    return "Le brief est prêt, mais les crédits image OpenAI sont insuffisants côté serveur.";
  }
  if (message.includes("ai_service_unavailable") || message.includes("401") || message.includes("403")) {
    return "Le brief est prêt, mais le service image OpenAI n'est pas correctement disponible côté Supabase.";
  }
  if (message.includes("content_policy") || message.includes("safety")) {
    return "Le brief est prêt, mais la demande image a été refusée par la sécurité du modèle. Reformulez sans marque, personne réelle ou promesse sensible.";
  }

  return rawMessage || "Le brief est prêt, mais l'image n'a pas pu être générée.";
}

function getMarketingImageFormat(format: string, orientation: string): TokImageFormat {
  const normalized = `${format} ${orientation}`.toLowerCase();
  if (normalized.includes("story") || normalized.includes("portrait")) return "portrait";
  if (normalized.includes("carre") || normalized.includes("carr")) return "square";
  return "landscape";
}

function buildMarketingImagePrompt(input: {
  toolTitle: string;
  prompt: string;
  format: string;
  orientation: string;
  styleMode: string;
  result: MarketingGenerationResult;
  resources: MarketingResource[];
}) {
  const resourceSummary = input.resources.length
    ? input.resources
      .map((resource) => `${MARKETING_ASSET_KIND_LABELS[resource.kind]}: ${resource.fileName}`)
      .join(", ")
    : "Aucune ressource de marque transmise au modele image.";

  return [
    "Créer un visuel marketing premium pour un restaurant, prêt à servir de base créative après validation du brief.",
    `Support: ${input.toolTitle}. Format: ${input.format}. Orientation: ${input.orientation}. Style: ${input.styleMode}.`,
    `Demande restaurateur: ${input.prompt}`,
    `Ressources déclarées: ${resourceSummary}`,
    `Titre du brief: ${input.result.title}`,
    `Synthèse du brief: ${input.result.summary}`,
    `Brief validé: ${input.result.markdown.slice(0, 1400)}`,
    "Direction artistique: photographie et design restauration haut de gamme, composition claire, appétissante, moderne, adaptée au marché suisse romand.",
    "Contraintes: ne pas inventer de logo, QR code, coordonnées, prix, allergènes, labels officiels ou fausse promotion. Ne pas ajouter de watermark. Garder le rendu exploitable pour une validation humaine avant publication.",
  ].join("\n\n").slice(0, 3600);
}

export default function TokAiMarketingStudio({ restaurantId }: Props) {
  const { toast } = useToast();
  const [activeTool, setActiveTool] = useState<MarketingToolId>("flyer");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("A4 imprime");
  const [orientation, setOrientation] = useState("Portrait");
  const [styleMode, setStyleMode] = useState("Base sur mon identite");
  const [resources, setResources] = useState<MarketingResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [generationResult, setGenerationResult] = useState<MarketingGenerationResult | null>(null);
  const [marketingImageResult, setMarketingImageResult] = useState<MarketingImageResult | null>(null);

  const activeToolConfig = MARKETING_TOOLS.find((tool) => tool.id === activeTool) || MARKETING_TOOLS[0];
  const sanitizedPrompt = sanitizeMarketingPrompt(prompt);
  const promptWarnings = getMarketingPromptWarnings(prompt);
  const hasLogo = resources.some((resource) => resource.kind === "logo");
  const hasBrandResources = resources.length >= 2;

  const resourcesByKind = useMemo(() => {
    return resources.reduce<Record<MarketingAssetKind, MarketingResource[]>>(
      (acc, resource) => {
        acc[resource.kind].push(resource);
        return acc;
      },
      { logo: [], business_card: [], restaurant_menu: [], brand_visuals: [] },
    );
  }, [resources]);

  const handleResourceFiles = (kind: MarketingAssetKind, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const accepted = files.filter((file) => {
      if (!MARKETING_UPLOAD_ACCEPT.split(",").includes(file.type)) {
        toast({
          title: "Format refuse",
          description: `${file.name} doit etre un PNG, JPG, WebP ou PDF.`,
          variant: "destructive",
        });
        return false;
      }
      if (file.size > MAX_MARKETING_ASSET_BYTES) {
        toast({
          title: "Fichier trop lourd",
          description: `${file.name} depasse 15 Mo. Compressez le visuel avant l'analyse.`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    if (!accepted.length) return;

    setResources((current) => {
      const next = [...current, ...accepted.map((file) => createMarketingResource(file, kind))];
      return next.slice(-16);
    });
  };

  const applySuggestion = (suggestion: string) => {
    setPrompt((current) => sanitizeMarketingPrompt(current ? `${current} ${suggestion}.` : `${suggestion}.`));
  };

  const requestGeneration = async () => {
    const safePrompt = sanitizeMarketingPrompt(prompt);
    const warnings = getMarketingPromptWarnings(prompt);

    if (!restaurantId) {
      toast({ title: "Restaurant requis", description: "Sélectionnez un restaurant avant de lancer le brief marketing.", variant: "destructive" });
      return;
    }

    if (!safePrompt) {
      toast({ title: "Brief requis", description: "Ajoutez une consigne pour guider le visuel.", variant: "destructive" });
      return;
    }

    if (warnings.length) {
      toast({ title: "Prompt bloque", description: warnings[0], variant: "destructive" });
      return;
    }

    setLoading(true);
    setGenerationResult(null);
    setMarketingImageResult(null);

    try {
      const data = await runRestaurantAgent({
        restaurantId,
        action: "marketing_campaign",
        prompt: [
          safePrompt,
          `Support demandé: ${activeToolConfig.title}.`,
          `Format: ${format}. Orientation: ${orientation}. Style: ${styleMode}.`,
          "Produis un brief de création marketing exploitable pour un graphiste ou un moteur image, sans publier automatiquement.",
        ].join("\n"),
        context: {
          source: "tok_ai_marketing_studio",
          requested_output: "branded_marketing_visual_brief",
          active_tool: activeTool,
          format,
          orientation,
          style_mode: styleMode,
          has_logo: hasLogo,
          resource_count: resources.length,
          resources: resources.map((resource) => ({
            kind: resource.kind,
            label: MARKETING_ASSET_KIND_LABELS[resource.kind],
            file_name: resource.fileName,
            file_size: resource.fileSize,
            mime_type: resource.mimeType,
          })),
        },
      });

      setGenerationResult(data);

      try {
        const imageResult = await generateTokDishImage({
          restaurantId,
          prompt: buildMarketingImagePrompt({
            toolTitle: activeToolConfig.title,
            prompt: safePrompt,
            format,
            orientation,
            styleMode,
            result: data,
            resources,
          }),
          dishName: activeToolConfig.title,
          assetType: "campaign_visual",
          format: getMarketingImageFormat(format, orientation),
          variantCount: 1,
          generateImage: true,
          imageOnly: true,
        });

        setMarketingImageResult(imageResult);
        toast({
          title: "Brief et image générés",
          description: `Le visuel marketing a été généré côté serveur avec ${imageResult.model || "OpenAI"}.`,
        });
      } catch (imageError) {
        toast({
          title: "Brief généré, image non produite",
          description: formatMarketingImageGenerationError(imageError),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Génération impossible",
        description: formatMarketingGenerationError(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generatedMarketingImageUrl = marketingImageResult?.gallery_image_url || marketingImageResult?.generated_image_url || "";

  return (
    <section className="overflow-hidden rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-background to-background shadow-sm dark:border-orange-900/50 dark:from-orange-950/20">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge className="bg-orange-600 text-white hover:bg-orange-600">Marketing automatique</Badge>
              <div>
                <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Studio Photo & Marketing IA
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Ajoutez votre logo, votre carte de visite, votre carte de restaurant et vos visuels existants. L'outil prepare un brief securise pour generer des flyers, cartes de visite et menus dans l'identite visuelle de votre entreprise.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-white/80 p-4 text-sm shadow-sm dark:bg-background/70">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                <div>
                  <p className="font-semibold text-violet-700 dark:text-violet-300">IA securisee & responsable</p>
                  <p className="mt-1 text-xs text-muted-foreground">{MARKETING_SAFE_OUTPUT_NOTE}</p>
                </div>
              </div>
            </div>
          </div>

          <Card className="border-orange-100 bg-white/90 shadow-sm dark:bg-background/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-orange-600" />
                Generer un nouveau visuel
              </CardTitle>
              <CardDescription>Choisissez le type de support, puis decrivez le resultat attendu.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                {MARKETING_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const selected = tool.id === activeTool;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setActiveTool(tool.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-orange-400 bg-orange-50 shadow-sm dark:bg-orange-950/20"
                          : "border-border bg-background hover:border-orange-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`rounded-2xl p-3 ${selected ? "bg-orange-600 text-white" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block font-semibold text-foreground">{tool.title}</span>
                          <span className="mt-1 block text-sm leading-5 text-muted-foreground">{tool.description}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="marketing-ia-prompt">Décrivez votre besoin</Label>
                <Textarea
                  id="marketing-ia-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={MARKETING_PROMPT_MAX_LENGTH + 120}
                  placeholder="Ex: Creer un flyer pour la soiree mexicaine de vendredi, avec tacos, ambiance festive, couleurs chaudes, style moderne et gourmand..."
                  className="min-h-[112px] resize-y"
                />
                <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>{sanitizedPrompt.length}/{MARKETING_PROMPT_MAX_LENGTH} caracteres securises</span>
                  <span>{hasBrandResources ? "Identite visuelle exploitable" : "Ajoutez au moins deux ressources de marque pour affiner le style."}</span>
                </div>
                {promptWarnings.length ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-1">
                        {promptWarnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {activeToolConfig.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-orange-300 hover:text-orange-700"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="marketing-format">Format</Label>
                  <select
                    id="marketing-format"
                    value={format}
                    onChange={(event) => setFormat(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option>A4 imprime</option>
                    <option>Story 9:16</option>
                    <option>Post carre</option>
                    <option>Carte double volet</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marketing-orientation">Orientation</Label>
                  <select
                    id="marketing-orientation"
                    value={orientation}
                    onChange={(event) => setOrientation(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option>Portrait</option>
                    <option>Paysage</option>
                    <option>Carre</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marketing-style">Style</Label>
                  <select
                    id="marketing-style"
                    value={styleMode}
                    onChange={(event) => setStyleMode(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option>Base sur mon identite</option>
                    <option>Premium discret</option>
                    <option>Gourmand et colore</option>
                    <option>Minimaliste imprime</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border bg-muted/40 p-4 text-sm">
                <p className="font-semibold text-foreground">Brief sécurisé prêt pour génération serveur</p>
                <p className="mt-2 text-muted-foreground">
                  Type: {activeToolConfig.title} · Format: {format} · Orientation: {orientation} · Style: {styleMode} · Logo: {hasLogo ? "oui" : "non"}
                </p>
                <p className="mt-2 line-clamp-2 text-muted-foreground">{sanitizedPrompt || "Le brief apparaitra ici apres saisie."}</p>
              </div>

              {generationResult ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-50">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{generationResult.title}</p>
                      <p className="mt-1 text-emerald-800 dark:text-emerald-100">{generationResult.summary}</p>
                    </div>
                    <Badge variant="outline" className="w-fit border-emerald-300 bg-white/70 text-emerald-800 dark:bg-background/40 dark:text-emerald-100">
                      {generationResult.status}
                    </Badge>
                  </div>
                  <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm leading-6 text-foreground dark:border-emerald-900/50 dark:bg-background/70">
                    <pre className="whitespace-pre-wrap font-sans">{generationResult.markdown}</pre>
                  </div>
                  {generatedMarketingImageUrl ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/50 dark:bg-background">
                      <div className="flex flex-col gap-3 border-b border-emerald-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900/50">
                        <div>
                          <p className="font-semibold text-foreground">Image marketing générée</p>
                          <p className="text-xs text-muted-foreground">Modèle: {marketingImageResult?.model || "gpt-image-2"}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" asChild>
                          <a href={generatedMarketingImageUrl} target="_blank" rel="noreferrer">
                            Ouvrir l'image
                          </a>
                        </Button>
                      </div>
                      <div className="bg-slate-950/5 p-3">
                        <img
                          src={generatedMarketingImageUrl}
                          alt={marketingImageResult?.alt_text || `Visuel marketing ${activeToolConfig.title}`}
                          className="mx-auto max-h-[520px] w-full rounded-xl object-contain"
                        />
                      </div>
                    </div>
                  ) : null}
                  {generationResult.recommended_actions.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {generationResult.recommended_actions.slice(0, 4).map((action) => (
                        <span key={action} className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-background/50 dark:text-emerald-100">
                          {action}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" onClick={requestGeneration} disabled={!restaurantId || loading} className="gap-2 bg-orange-600 hover:bg-orange-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "Génération du brief et de l'image..." : "Générer le brief et l'image"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Génération IA serveur avec quotas, historique et validation RLS. L'image est produite après le brief via la fonction Supabase image.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="h-5 w-5 text-orange-600" />
                Ressources de marque
              </CardTitle>
              <CardDescription>Ajoutez les elements qui definissent votre identite visuelle.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(Object.keys(MARKETING_ASSET_KIND_LABELS) as MarketingAssetKind[]).map((kind) => {
                const kindResources = resourcesByKind[kind];
                const inputId = `marketing-resource-${kind}`;
                return (
                  <div key={kind} className="rounded-2xl border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-muted p-2">
                          {kind === "logo" ? <FileImage className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{MARKETING_ASSET_KIND_LABELS[kind]}</p>
                          <p className="text-xs text-muted-foreground">{kindResources.length ? `${kindResources.length} fichier(s)` : "A ajouter"}</p>
                        </div>
                      </div>
                      {kindResources.length ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                    </div>
                    {kindResources.length ? (
                      <div className="mt-3 space-y-1">
                        {kindResources.slice(-2).map((resource) => (
                          <p key={resource.id} className="truncate text-xs text-muted-foreground">
                            {resource.fileName} · {formatBytes(resource.fileSize)}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <Input
                      id={inputId}
                      type="file"
                      accept={MARKETING_UPLOAD_ACCEPT}
                      multiple={kind === "brand_visuals"}
                      className="mt-3"
                      onChange={(event) => handleResourceFiles(kind, event)}
                    />
                  </div>
                );
              })}

              <div className={`rounded-2xl border p-4 text-sm ${hasBrandResources ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <div className="flex gap-2">
                  {hasBrandResources ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ImagePlus className="mt-0.5 h-4 w-4 shrink-0" />}
                  <p>{hasBrandResources ? "Analyse de marque prete pour un brief IA coherent." : "Ajoutez logo + carte/menu/visuels pour une analyse plus fiable."}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LockKeyhole className="h-5 w-5 text-blue-600" />
                Securite & confidentialite
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {MARKETING_SECURITY_CHECKS.map((check) => (
                  <li key={check} className="flex gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
