import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  generateTokDishImage,
  type TokImageFormat,
  type TokImageGenerationResult,
} from "@/lib/ai/tokAiClient";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import { assertSafeFileUpload, getSafeUploadExtension } from "@/lib/uploadSecurity";
import {
  AlertTriangle,
  ArrowRight,
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
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type MarketingToolId = "flyer" | "business_card" | "restaurant_menu";

type MarketingAssetKind = "logo" | "business_card" | "restaurant_menu" | "brand_visuals";

type MarketingResource = {
  id: string;
  mediaId?: string;
  kind: MarketingAssetKind;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaUrl: string;
  storageBucket: string | null;
  storagePath: string | null;
  persisted: boolean;
};

type Props = {
  restaurantId?: string | null;
};

type MarketingImageResult = TokImageGenerationResult;
type MarketingWorkflowStep = 1 | 2 | 3 | 4;

const supabase = getSupabase();

const MARKETING_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
const MARKETING_STORAGE_BUCKET = "images";
const MARKETING_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
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

const MARKETING_ASSET_MEDIA_TYPES: Record<MarketingAssetKind, string> = {
  logo: "marketing_logo",
  business_card: "marketing_business_card",
  restaurant_menu: "marketing_menu",
  brand_visuals: "marketing_brand_visual",
};

const MARKETING_KIND_BY_MEDIA_TYPE = Object.fromEntries(
  Object.entries(MARKETING_ASSET_MEDIA_TYPES).map(([kind, mediaType]) => [mediaType, kind]),
) as Record<string, MarketingAssetKind>;

const MARKETING_MEDIA_TYPES = Object.values(MARKETING_ASSET_MEDIA_TYPES);

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

const MARKETING_STUDIO_STEPS: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "Ressources",
    description: "Ajoutez logo, carte, menu et visuels existants.",
    icon: Upload,
  },
  {
    title: "Support",
    description: "Choisissez flyer, carte de visite ou carte du restaurant.",
    icon: FileImage,
  },
  {
    title: "Brief",
    description: "Décrivez le résultat attendu avec un prompt clair.",
    icon: Wand2,
  },
  {
    title: "Generation",
    description: "Vérifiez le récapitulatif, puis lancez l'image.",
    icon: Sparkles,
  },
];

const MARKETING_SECURITY_CHECKS = [
  "Types acceptes limites: PNG, JPG et WebP.",
  "Poids limite a 15 Mo par ressource avant optimisation.",
  "Chaque visuel est enregistré dans Storage puis référencé dans restaurant_media.",
  "Les ressources persistantes sont réutilisées automatiquement à chaque génération.",
  "Prompts filtres contre injection, HTML/script, chemins systeme et requetes SQL.",
  "Aucune cle, token, cookie ou donnee paiement ne doit etre inclus dans le prompt.",
  "Génération image côté serveur avec validation RLS, quotas IA et historique.",
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
    warnings.push(`Le prompt dépasse ${MARKETING_PROMPT_MAX_LENGTH} caractères.`);
  }
  return warnings;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function createPendingMarketingResource(file: File, kind: MarketingAssetKind): MarketingResource {
  return {
    id: `${kind}-${file.name}-${file.lastModified}`,
    kind,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    mediaUrl: "",
    storageBucket: null,
    storagePath: null,
    persisted: false,
  };
}

function formatMarketingImageGenerationError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const message = rawMessage.toLowerCase();

  if (message.includes("image_generation_timeout") || message.includes("image_edit_timeout")) {
    return "La génération d'image a dépassé le délai serveur. Réessayez avec un prompt plus court.";
  }
  if (message.includes("ai_rate_limited") || message.includes("429")) {
    return "OpenAI limite temporairement les générations image. Réessayez dans quelques minutes.";
  }
  if (message.includes("ai_credits_exhausted") || message.includes("402")) {
    return "Les crédits image OpenAI sont insuffisants côté serveur.";
  }
  if (message.includes("ai_service_unavailable") || message.includes("401") || message.includes("403")) {
    return "Le service image OpenAI n'est pas correctement disponible côté Supabase.";
  }
  if (message.includes("content_policy") || message.includes("safety")) {
    return "La demande image a été refusée par la sécurité du modèle. Reformulez sans personne réelle ou promesse sensible.";
  }

  return rawMessage || "L'image n'a pas pu être générée.";
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
  resources: MarketingResource[];
}) {
  const orderedResources = [...input.resources].sort((a, b) => {
    const left = `${a.kind}:${a.mediaId || a.id}:${a.fileName}`;
    const right = `${b.kind}:${b.mediaId || b.id}:${b.fileName}`;
    return left.localeCompare(right);
  });
  const resourceSummary = input.resources.length
    ? orderedResources
      .map((resource) => `${MARKETING_ASSET_KIND_LABELS[resource.kind]}: ${resource.fileName}`)
      .join(", ")
    : "Aucune ressource de marque transmise au modele image.";
  const resourceFingerprint = orderedResources
    .map((resource) => `${resource.kind}:${resource.mediaId || resource.id}:${resource.fileName}`)
    .join("|")
    .slice(0, 900);

  return [
    "Créer directement un visuel marketing final pour le restaurateur, sans produire de brief.",
    `Support: ${input.toolTitle}. Format: ${input.format}. Orientation: ${input.orientation}. Style: ${input.styleMode}.`,
    `Demande restaurateur: ${input.prompt}`,
    `Ressources actives à utiliser comme seules références visuelles: ${resourceSummary}`,
    `Empreinte des ressources actives: ${resourceFingerprint || "aucune"}`,
    "Direction artistique: reprendre l'identité visuelle observable dans les fichiers actifs fournis pour cette génération: logo, couleurs, typographies, textures, style photo, formes, composition, hiérarchie et ton commercial.",
    "Interdictions: ne pas utiliser l'identité visuelle de la plateforme par défaut, ne pas réutiliser une identité ou un prompt d'une génération précédente, ne pas inventer une autre marque si les références indiquent une marque précise.",
    "Contraintes: respecter uniquement le prompt courant et les visuels actifs envoyés avec cette requête, ne pas ajouter de coordonnées privées, ne pas créer de faux label officiel, garder le texte demandé lisible.",
  ].join("\n\n").slice(0, 3600);
}

function createMarketingAssetPath(userId: string, restaurantId: string, file: File) {
  const ext = getSafeUploadExtension(file, MARKETING_IMAGE_MIME_EXTENSIONS);
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${userId}/marketing-assets/${restaurantId}/${id}.${ext}`;
}

function rowToMarketingResource(row: Record<string, unknown>): MarketingResource {
  const mediaType = typeof row.media_type === "string" ? row.media_type : "";
  const kind = MARKETING_KIND_BY_MEDIA_TYPE[mediaType] || "brand_visuals";
  const mediaUrl = typeof row.media_url === "string" ? row.media_url : "";
  const storagePath = typeof row.storage_path === "string" ? row.storage_path : null;

  return {
    id: typeof row.id === "string" ? row.id : `${kind}-${mediaUrl}`,
    mediaId: typeof row.id === "string" ? row.id : undefined,
    kind,
    fileName: typeof row.alt_text === "string" && row.alt_text ? row.alt_text : storagePath?.split("/").pop() || MARKETING_ASSET_KIND_LABELS[kind],
    fileSize: 0,
    mimeType: "image/*",
    mediaUrl,
    storageBucket: typeof row.storage_bucket === "string" ? row.storage_bucket : null,
    storagePath,
    persisted: true,
  };
}

async function fetchMarketingResources(restaurantId: string) {
  const { data, error } = await supabase
    .from("restaurant_media")
    .select("id, media_url, alt_text, media_type, storage_bucket, storage_path, created_at")
    .eq("restaurant_id", restaurantId)
    .in("media_type", MARKETING_MEDIA_TYPES)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => rowToMarketingResource(row as Record<string, unknown>));
}

async function uploadMarketingResource(input: {
  restaurantId: string;
  userId: string;
  kind: MarketingAssetKind;
  file: File;
}) {
  const optimizedFile = await optimizeImageUpload(input.file);
  assertSafeFileUpload(optimizedFile, {
    allowedMimeTypes: MARKETING_IMAGE_MIME_EXTENSIONS,
    maxBytes: MAX_MARKETING_ASSET_BYTES,
    label: "Visuel marketing",
  });

  const storageBucket = MARKETING_STORAGE_BUCKET;
  const storagePath = createMarketingAssetPath(input.userId, input.restaurantId, optimizedFile);
  const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, optimizedFile, {
    contentType: optimizedFile.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
  const mediaUrl = publicData.publicUrl;

  const { data: media, error: insertError } = await supabase
    .from("restaurant_media")
    .insert({
      restaurant_id: input.restaurantId,
      media_url: mediaUrl,
      alt_text: input.file.name,
      media_type: MARKETING_ASSET_MEDIA_TYPES[input.kind],
      storage_bucket: storageBucket,
      storage_path: storagePath,
      uploaded_by: input.userId,
      position: 0,
      is_cover: false,
    })
    .select("id, media_url, alt_text, media_type, storage_bucket, storage_path")
    .single();

  if (insertError) throw insertError;
  return rowToMarketingResource(media as Record<string, unknown>);
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
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<MarketingAssetKind | null>(null);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null);
  const [marketingImageResult, setMarketingImageResult] = useState<MarketingImageResult | null>(null);
  const [activeStep, setActiveStep] = useState<MarketingWorkflowStep>(1);
  const generationRequestRef = useRef(0);

  const activeToolConfig = MARKETING_TOOLS.find((tool) => tool.id === activeTool) || MARKETING_TOOLS[0];
  const sanitizedPrompt = sanitizeMarketingPrompt(prompt);
  const promptWarnings = getMarketingPromptWarnings(prompt);
  const persistedResources = resources.filter((resource) => resource.persisted && resource.mediaUrl);
  const hasLogo = persistedResources.some((resource) => resource.kind === "logo");
  const hasBrandResources = persistedResources.length >= 2;
  const briefReady = Boolean(sanitizedPrompt) && promptWarnings.length === 0;

  const resourcesByKind = useMemo(() => {
    return resources.reduce<Record<MarketingAssetKind, MarketingResource[]>>(
      (acc, resource) => {
        acc[resource.kind].push(resource);
        return acc;
      },
      { logo: [], business_card: [], restaurant_menu: [], brand_visuals: [] },
    );
  }, [resources]);

  const invalidateMarketingGeneration = () => {
    generationRequestRef.current += 1;
    setLoading(false);
    setMarketingImageResult(null);
  };

  const updatePrompt = (value: string) => {
    invalidateMarketingGeneration();
    setPrompt(value);
  };

  useEffect(() => {
    let cancelled = false;
    generationRequestRef.current += 1;
    setLoading(false);
    setMarketingImageResult(null);

    async function loadMarketingAssets() {
      if (!restaurantId) {
        setResources([]);
        setResourcesLoading(false);
        return;
      }

      setResourcesLoading(true);
      try {
        const latestResources = await fetchMarketingResources(restaurantId);
        if (cancelled) return;
        setResources(latestResources);
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "Ressources indisponibles",
          description: error instanceof Error ? error.message : "Impossible de charger les ressources marketing.",
          variant: "destructive",
        });
        setResources([]);
      } finally {
        if (!cancelled) setResourcesLoading(false);
      }
    }

    loadMarketingAssets();
    return () => { cancelled = true; };
  }, [restaurantId, toast]);

  const handleResourceFiles = async (kind: MarketingAssetKind, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const accepted = files.filter((file) => {
      try {
        assertSafeFileUpload(file, {
          allowedMimeTypes: MARKETING_IMAGE_MIME_EXTENSIONS,
          maxBytes: MAX_MARKETING_ASSET_BYTES,
          label: "Visuel marketing",
        });
      } catch (error) {
        toast({
          title: "Format refuse",
          description: error instanceof Error ? error.message : `${file.name} doit etre un PNG, JPG ou WebP.`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    if (!accepted.length) return;

    if (!restaurantId) {
      toast({ title: "Restaurant requis", description: "Sélectionnez un restaurant avant d'ajouter des visuels.", variant: "destructive" });
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      toast({ title: "Connexion requise", description: "Reconnectez-vous avant d'ajouter des visuels.", variant: "destructive" });
      return;
    }

    invalidateMarketingGeneration();
    setUploadingKind(kind);
    setResources((current) => {
      const pending = accepted.map((file) => createPendingMarketingResource(file, kind));
      return [...pending, ...current].slice(0, 16);
    });

    try {
      const persisted = await Promise.all(accepted.map((file) => uploadMarketingResource({
        restaurantId,
        userId: userData.user.id,
        kind,
        file,
      })));

      setResources((current) => {
        const withoutPending = current.filter((resource) => resource.persisted);
        return [...persisted, ...withoutPending].slice(0, 16);
      });
      toast({ title: "Visuels enregistrés", description: "Les ressources seront réutilisées automatiquement pour les prochaines générations." });
    } catch (error) {
      setResources((current) => current.filter((resource) => resource.persisted));
      toast({
        title: "Upload impossible",
        description: error instanceof Error ? error.message : "Impossible d'enregistrer les visuels marketing.",
        variant: "destructive",
      });
    } finally {
      setUploadingKind(null);
    }
  };

  const deleteMarketingResource = async (resource: MarketingResource) => {
    if (deletingResourceId) return;

    invalidateMarketingGeneration();

    if (!resource.persisted) {
      setResources((current) => current.filter((item) => item.id !== resource.id));
      return;
    }

    if (!restaurantId || !resource.mediaId) {
      toast({
        title: "Suppression impossible",
        description: "Cette ressource n'est pas rattachee au restaurant actif.",
        variant: "destructive",
      });
      return;
    }

    const previousResources = resources;
    setDeletingResourceId(resource.id);
    setResources((current) => current.filter((item) => item.id !== resource.id));

    try {
      const { data: deletedMedia, error: deleteError } = await supabase
        .from("restaurant_media")
        .delete()
        .eq("id", resource.mediaId)
        .eq("restaurant_id", restaurantId)
        .eq("media_type", MARKETING_ASSET_MEDIA_TYPES[resource.kind])
        .select("id")
        .maybeSingle();

      if (deleteError) throw deleteError;
      if (!deletedMedia) throw new Error("La ressource n'a pas ete supprimee. Verifiez vos droits sur ce restaurant.");

      if (resource.storageBucket && resource.storagePath) {
        if (resource.storageBucket !== MARKETING_STORAGE_BUCKET) {
          toast({
            title: "Ressource retiree",
            description: "Le fichier est retire du studio. Le bucket d'origine n'a pas ete modifie.",
          });
          return;
        }

        const { error: storageError } = await supabase.storage
          .from(resource.storageBucket)
          .remove([resource.storagePath]);

        if (storageError) {
          toast({
            title: "Ressource retiree",
            description: "La reference a ete supprimee, mais le fichier Storage devra etre nettoye plus tard.",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Ressource supprimee",
        description: `${resource.fileName} a ete retire du studio marketing.`,
      });
    } catch (error) {
      setResources(previousResources);
      toast({
        title: "Suppression impossible",
        description: error instanceof Error ? error.message : "Impossible de supprimer cette ressource marketing.",
        variant: "destructive",
      });
    } finally {
      setDeletingResourceId(null);
    }
  };

  const applySuggestion = (suggestion: string) => {
    updatePrompt(sanitizeMarketingPrompt(prompt ? `${prompt} ${suggestion}.` : `${suggestion}.`));
    setActiveStep((current) => current < 3 ? 3 : current);
  };

  const requestGeneration = async () => {
    const safePrompt = sanitizeMarketingPrompt(prompt);
    const warnings = getMarketingPromptWarnings(prompt);

    if (!restaurantId) {
      toast({ title: "Restaurant requis", description: "Sélectionnez un restaurant avant de générer l'image marketing.", variant: "destructive" });
      return;
    }

    if (!safePrompt) {
      toast({ title: "Prompt requis", description: "Ajoutez une consigne pour guider le visuel.", variant: "destructive" });
      return;
    }

    if (warnings.length) {
      toast({ title: "Prompt bloque", description: warnings[0], variant: "destructive" });
      return;
    }

    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    setLoading(true);
    setMarketingImageResult(null);

    try {
      const latestResources = await fetchMarketingResources(restaurantId);
      if (generationRequestRef.current !== requestId) return;

      setResources(latestResources);
      const generationResources = latestResources.filter((resource) => resource.persisted && resource.mediaUrl);

      const imageResult = await generateTokDishImage({
        restaurantId,
        prompt: buildMarketingImagePrompt({
          toolTitle: activeToolConfig.title,
          prompt: safePrompt,
          format,
          orientation,
          styleMode,
          resources: generationResources,
        }),
        referenceImageUrls: generationResources.map((resource) => resource.mediaUrl),
        dishName: activeToolConfig.title,
        assetType: "campaign_visual",
        format: getMarketingImageFormat(format, orientation),
        variantCount: 1,
        generateImage: true,
        imageOnly: true,
        marketingAssetMode: true,
      });

      if (generationRequestRef.current !== requestId) return;

      setMarketingImageResult(imageResult);
      toast({
        title: "Image marketing générée",
        description: `Le visuel a été produit avec ${imageResult.model || "OpenAI"} à partir du prompt et des ressources persistantes.`,
      });
    } catch (error) {
      if (generationRequestRef.current !== requestId) return;
      toast({
        title: "Image impossible",
        description: formatMarketingImageGenerationError(error),
        variant: "destructive",
      });
    } finally {
      if (generationRequestRef.current === requestId) setLoading(false);
    }
  };

  const generatedMarketingImageUrl = marketingImageResult?.gallery_image_url || marketingImageResult?.generated_image_url || "";

  return (
    <section className="overflow-hidden rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-background to-background shadow-sm dark:border-orange-900/50 dark:from-orange-950/20">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-[2rem] border border-orange-200 bg-[radial-gradient(circle_at_top_right,rgba(255,115,0,0.20),transparent_38%),linear-gradient(135deg,#fff7ed,#ffffff_52%,#fff1e6)] p-5 shadow-sm sm:p-6">
            <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-orange-200/50 blur-3xl" aria-hidden="true" />
            <div className="space-y-2">
              <Badge className="bg-orange-600 text-white hover:bg-orange-600">Marketing automatique</Badge>
              <div>
                <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                  Studio Photo & Marketing IA
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Ajoutez une fois votre logo, vos captures et vos visuels de marque. L'outil les enregistre et génère ensuite une image marketing finale à partir de votre prompt.
                </p>
              </div>
            </div>
            <div className="hidden rounded-2xl border border-violet-200 bg-white/80 p-4 text-sm shadow-sm dark:bg-background/70">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                <div>
                  <p className="font-semibold text-violet-700 dark:text-violet-300">IA sécurisée & responsable</p>
                  <p className="mt-1 text-xs text-muted-foreground">{MARKETING_SAFE_OUTPUT_NOTE}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {MARKETING_STUDIO_STEPS.map((step, index) => {
              const Icon = step.icon;
              const currentStep = (index + 1) as MarketingWorkflowStep;
              const isLocked = currentStep > activeStep + 1 || (currentStep >= 3 && !briefReady);
              return (
                <button
                  key={step.title}
                  type="button"
                  disabled={isLocked}
                  onClick={() => setActiveStep(currentStep)}
                  className={`rounded-2xl border border-orange-100 bg-white/85 p-3 text-left shadow-sm ring-1 ring-black/[0.02] transition hover:border-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background/80 ${activeStep === currentStep ? "border-orange-400" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-sm font-bold text-white shadow-sm">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-orange-600" />
                        <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <Card className="border-orange-200 bg-white/95 shadow-md shadow-orange-100/40 dark:bg-background/85">
            <CardHeader className="border-b border-orange-100 bg-orange-50/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-orange-600" />
                Générer un nouveau visuel
              </CardTitle>
              <CardDescription>Choisissez le type de support, puis decrivez le resultat attendu.</CardDescription>
                </div>
                <Badge variant="outline" className="w-fit border-orange-300 bg-white text-orange-700">
                  Workflow guidé
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="rounded-3xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">1</span>
                  Choisir le support
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                {MARKETING_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const selected = tool.id === activeTool;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => {
                        invalidateMarketingGeneration();
                        setActiveTool(tool.id);
                        setActiveStep((current) => current < 2 ? 2 : current);
                      }}
                      className={`rounded-2xl border p-4 text-center transition ${
                        selected
                          ? "border-orange-400 bg-orange-50 shadow-sm dark:bg-orange-950/20"
                          : "border-border bg-background hover:border-orange-200"
                      }`}
                    >
                      <div className="flex min-h-28 flex-col items-center justify-center gap-3">
                        <span className={`rounded-3xl p-4 ${selected ? "bg-orange-600 text-white" : "bg-orange-50 text-orange-700"}`}>
                          <Icon className="h-7 w-7" />
                        </span>
                        <span>
                          <span className="block text-base font-bold text-foreground">{tool.title}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>

              <div className={`${activeStep >= 2 ? "" : "hidden"} rounded-3xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">2</span>
                  Rédiger le brief
                </div>
              <div className="space-y-2">
                <Label htmlFor="marketing-ia-prompt">Décrivez votre besoin</Label>
                <Textarea
                  id="marketing-ia-prompt"
                  value={prompt}
                  onChange={(event) => updatePrompt(event.target.value)}
                  maxLength={MARKETING_PROMPT_MAX_LENGTH + 120}
                  placeholder="Ex: Creer un flyer pour la soiree mexicaine de vendredi, avec tacos, ambiance festive, couleurs chaudes, style moderne et gourmand..."
                  className="min-h-[132px] resize-y rounded-2xl border-orange-200 bg-orange-50/30 text-base shadow-inner focus-visible:ring-orange-400"
                />
                <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>{sanitizedPrompt.length}/{MARKETING_PROMPT_MAX_LENGTH} caractères sécurisés</span>
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
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!briefReady}
                    onClick={() => setActiveStep(3)}
                    className="gap-2 rounded-2xl border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    Continuer
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              </div>

              <div className={`${activeStep >= 2 ? "flex" : "hidden"} flex-wrap gap-2 rounded-3xl border border-dashed border-orange-200 bg-orange-50/40 p-3`}>
                <span className="mr-1 self-center text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Idées rapides</span>
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

              <div className={`${activeStep >= 3 ? "" : "hidden"} rounded-3xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">3</span>
                  Paramétrer le rendu
                </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="marketing-format">Format</Label>
                  <select
                    id="marketing-format"
                    value={format}
                    onChange={(event) => {
                      invalidateMarketingGeneration();
                      setFormat(event.target.value);
                    }}
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
                    onChange={(event) => {
                      invalidateMarketingGeneration();
                      setOrientation(event.target.value);
                    }}
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
                    onChange={(event) => {
                      invalidateMarketingGeneration();
                      setStyleMode(event.target.value);
                    }}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option>Base sur mon identite</option>
                    <option>Premium discret</option>
                    <option>Gourmand et colore</option>
                    <option>Minimaliste imprime</option>
                  </select>
                </div>
                <div className="mt-2 flex justify-end md:col-span-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveStep(4)}
                    className="gap-2 rounded-2xl border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    Verifier le recapitulatif
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              </div>

              <div className={`${activeStep >= 4 ? "" : "hidden"} rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm shadow-sm`}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">4</span>
                  <p className="font-semibold text-emerald-950">Contrôle avant génération</p>
                </div>
                <p className="font-semibold text-foreground">Image marketing prête à générer</p>
                <p className="mt-2 text-emerald-900/80">
                  Type: {activeToolConfig.title} · Format: {format} · Orientation: {orientation} · Style: {styleMode} · Ressources persistantes: {persistedResources.length} · Logo: {hasLogo ? "oui" : "non"}
                </p>
                <p className="mt-2 line-clamp-2 rounded-2xl bg-white/80 p-3 text-emerald-950/80">{sanitizedPrompt || "Le prompt apparaitra ici apres saisie."}</p>
              </div>

              {generatedMarketingImageUrl ? (
                <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/50 dark:bg-background">
                  <div className="flex flex-col gap-3 border-b border-emerald-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900/50">
                    <div>
                      <p className="font-semibold text-foreground">Image marketing générée</p>
                      <p className="text-xs text-muted-foreground">Modele: {marketingImageResult?.model || "gpt-image-2"}</p>
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

              <div className={`${activeStep >= 4 ? "flex" : "hidden"} flex-col gap-3 rounded-3xl border border-orange-200 bg-orange-50/80 p-3 sm:flex-row sm:items-center`}>
                <Button type="button" onClick={requestGeneration} disabled={!restaurantId || loading} size="lg" className="min-h-12 gap-2 rounded-2xl bg-orange-600 px-6 text-base font-bold shadow-lg shadow-orange-500/20 hover:bg-orange-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "Génération de l'image..." : "Générer l'image marketing"}
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Image générée côté serveur avec validation RLS, ressources persistantes, quotas IA et historique.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="border-orange-200 shadow-sm">
            <CardHeader className="border-b border-orange-100 bg-orange-50/60">
              <Badge variant="outline" className="w-fit border-orange-300 bg-white text-orange-700">
                Etape 1
              </Badge>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="h-5 w-5 text-orange-600" />
                Ressources de marque
              </CardTitle>
              <CardDescription>Ajoutez les elements qui definissent votre identite visuelle. Ils seront conserves pour les prochaines generations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {resourcesLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement des ressources enregistrées...
                </div>
              ) : null}
              {(Object.keys(MARKETING_ASSET_KIND_LABELS) as MarketingAssetKind[]).map((kind) => {
                const kindResources = resourcesByKind[kind];
                const inputId = `marketing-resource-${kind}`;
                const isUploading = uploadingKind === kind;
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
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-orange-600" /> : kindResources.length ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                    </div>
                    {kindResources.length ? (
                      <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
                        {kindResources.map((resource) => (
                          <div key={resource.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">
                                {resource.fileName} · {resource.persisted ? "enregistré" : "en cours"}{resource.fileSize ? ` · ${formatBytes(resource.fileSize)}` : ""}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={deletingResourceId === resource.id}
                              onClick={() => deleteMarketingResource(resource)}
                              aria-label={`Supprimer ${resource.fileName}`}
                            >
                              {deletingResourceId === resource.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <Input
                      id={inputId}
                      type="file"
                      accept={MARKETING_UPLOAD_ACCEPT}
                      multiple={kind === "brand_visuals"}
                      className="mt-3"
                      disabled={isUploading || resourcesLoading}
                      onChange={(event) => handleResourceFiles(kind, event)}
                    />
                  </div>
                );
              })}

              <div className={`rounded-2xl border p-4 text-sm ${hasBrandResources ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <div className="flex gap-2">
                  {hasBrandResources ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ImagePlus className="mt-0.5 h-4 w-4 shrink-0" />}
                  <p>{hasBrandResources ? "Ressources persistantes prêtes pour générer une image cohérente." : "Ajoutez logo + carte/menu/visuels pour une image plus proche de votre marque."}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-100 shadow-sm">
            <CardHeader className="border-b bg-blue-50/50">
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
