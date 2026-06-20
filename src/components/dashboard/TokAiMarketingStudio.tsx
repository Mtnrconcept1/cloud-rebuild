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

type MarketingToolId =
  | "flyer"
  | "business_card"
  | "restaurant_menu"
  | "folded_leaflet"
  | "brochure"
  | "poster"
  | "large_poster"
  | "postcard"
  | "sticker"
  | "pos_display"
  | "banner";

type MarketingOrientation = "Portrait" | "Paysage" | "Carre" | "Rond" | "Libre";

type MarketingFormatOption = {
  label: string;
  orientation: MarketingOrientation;
  printSpec: string;
  pageHint?: string;
};

type MarketingToolConfig = {
  id: MarketingToolId;
  title: string;
  description: string;
  icon: LucideIcon;
  suggestions: string[];
  formats: MarketingFormatOption[];
};

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

const marketingFormat = (
  label: string,
  orientation: MarketingOrientation,
  printSpec = label,
  pageHint?: string,
): MarketingFormatOption => ({ label, orientation, printSpec, pageHint });

const MARKETING_TOOLS: MarketingToolConfig[] = [
  {
    id: "flyer",
    title: "Flyer / affiche",
    description: "Flyers, annonces de service, offres et supports promotionnels courts.",
    icon: Megaphone,
    suggestions: ["Soiree a theme", "Menu du jour", "Offre speciale", "Brunch du dimanche"],
    formats: [
      marketingFormat("A3 297 x 420 mm", "Portrait", "DIN A3 297 x 420 mm"),
      marketingFormat("A4 imprime 210 x 297 mm", "Portrait", "DIN A4 210 x 297 mm"),
      marketingFormat("A5 148 x 210 mm", "Portrait", "DIN A5 148 x 210 mm"),
      marketingFormat("A6 105 x 148 mm", "Portrait", "DIN A6 105 x 148 mm"),
      marketingFormat("DIN A6/5 105 x 210 mm", "Portrait", "DIN A6/5 105 x 210 mm"),
      marketingFormat("Flyer carre 148 x 148 mm", "Carre", "Carre 148 x 148 mm"),
      marketingFormat("Story 9:16", "Portrait", "Format digital vertical 9:16"),
      marketingFormat("Post carre", "Carre", "Format digital carre"),
    ],
  },
  {
    id: "business_card",
    title: "Carte de visite",
    description: "Cartes compactes recto ou recto-verso pour equipe, livraison et reservation.",
    icon: BriefcaseBusiness,
    suggestions: ["Sobre premium", "Chef proprietaire", "Livraison", "QR code menu"],
    formats: [
      marketingFormat("Carte de visite 85 x 55 mm", "Paysage", "85 x 55 mm paysage", "Recto ou recto-verso"),
      marketingFormat("Carte de visite 55 x 85 mm", "Portrait", "55 x 85 mm portrait", "Recto ou recto-verso"),
      marketingFormat("Carte de visite double volet", "Paysage", "Carte de visite pliee / double volet", "4 faces"),
      marketingFormat("Carte de visite carree 55 x 55 mm", "Carre", "55 x 55 mm carre"),
    ],
  },
  {
    id: "restaurant_menu",
    title: "Carte du restaurant",
    description: "Menus, cartes boissons, cartes saisonnieres et supports de table lisibles.",
    icon: FileText,
    suggestions: ["Menu du soir", "Carte drinks", "Menu enfant", "Carte saisonniere"],
    formats: [
      marketingFormat("Menu A4 210 x 297 mm", "Portrait", "DIN A4 210 x 297 mm", "1 ou 2 pages"),
      marketingFormat("Menu A3 plie A4", "Paysage", "DIN A3 plie au format A4", "4 pages"),
      marketingFormat("Menu A5 148 x 210 mm", "Portrait", "DIN A5 148 x 210 mm", "1 ou 2 pages"),
      marketingFormat("Menu DIN A6/5 105 x 210 mm", "Portrait", "DIN A6/5 105 x 210 mm"),
      marketingFormat("Set de table A3", "Paysage", "DIN A3 paysage"),
    ],
  },
  {
    id: "folded_leaflet",
    title: "Depliant multi-page",
    description: "Depliants plies pour menus et offres: 1 a 4 plis, jusqu'a 12 pages.",
    icon: FileText,
    suggestions: ["Menu traiteur", "Offre entreprise", "Programme brunch", "Carte festive"],
    formats: [
      marketingFormat("Depliant 1 pli 4 pages", "Paysage", "Depliant 1 pli", "4 pages"),
      marketingFormat("Depliant accordeon 6 pages", "Paysage", "Pli accordeon", "6 pages"),
      marketingFormat("Depliant roule 6 pages", "Paysage", "Pli roule", "6 pages"),
      marketingFormat("Depliant double pli parallele 8 pages", "Paysage", "Double pli parallele", "8 pages"),
      marketingFormat("Depliant pli croise 8 pages", "Paysage", "Pli croise", "8 pages"),
      marketingFormat("Depliant pli fenetre 6 pages", "Paysage", "Pli fenetre", "6 pages"),
      marketingFormat("Depliant accordeon avec rabat 10 pages", "Paysage", "Accordeon avec rabat", "10 pages"),
      marketingFormat("Depliant 4 plis 12 pages", "Paysage", "Depliant 4 plis", "12 pages"),
    ],
  },
  {
    id: "brochure",
    title: "Brochure",
    description: "Brochures agrafees ou collees pour cartes longues, dossiers et offres groupe.",
    icon: FileText,
    suggestions: ["Dossier banquet", "Carte vins", "Catalogue traiteur", "Presentation restaurant"],
    formats: [
      marketingFormat("Brochure DIN A4 8 a 72 pages", "Portrait", "DIN A4 portrait", "8 a 72 pages"),
      marketingFormat("Brochure DIN A4 paysage 8 a 72 pages", "Paysage", "DIN A4 paysage", "8 a 72 pages"),
      marketingFormat("Brochure DIN A5 8 a 72 pages", "Portrait", "DIN A5 portrait", "8 a 72 pages"),
      marketingFormat("Brochure DIN A6/5 8 a 72 pages", "Portrait", "DIN A6/5 portrait", "8 a 72 pages"),
      marketingFormat("Brochure DIN A6 8 a 72 pages", "Portrait", "DIN A6 portrait", "8 a 72 pages"),
    ],
  },
  {
    id: "poster",
    title: "Poster / affiche",
    description: "Affiches imprimees pour vitrine, entree, evenement ou promotion locale.",
    icon: Megaphone,
    suggestions: ["Affiche vitrine", "Concert live", "Happy hour", "Recrutement"],
    formats: [
      marketingFormat("Affiche A4 210 x 297 mm", "Portrait", "DIN A4 210 x 297 mm", "1 ou 2 pages"),
      marketingFormat("Affiche A3 297 x 420 mm", "Portrait", "DIN A3 297 x 420 mm"),
      marketingFormat("Affiche A2 420 x 594 mm", "Portrait", "DIN A2 420 x 594 mm"),
      marketingFormat("Affiche B2 / A2+", "Portrait", "A2+ / B2"),
      marketingFormat("Affiche A1 594 x 841 mm", "Portrait", "DIN A1 594 x 841 mm"),
      marketingFormat("Affiche B1", "Portrait", "DIN B1"),
      marketingFormat("Affiche A0 841 x 1189 mm", "Portrait", "DIN A0 841 x 1189 mm"),
    ],
  },
  {
    id: "large_poster",
    title: "Affiche grand format",
    description: "Formats exterieurs et reseaux d'affichage type F4, F200, F12 et F24.",
    icon: FileImage,
    suggestions: ["Campagne quartier", "Ouverture", "Terrasse ete", "Grand visuel marque"],
    formats: [
      marketingFormat("Affiche F4", "Portrait", "Format F4 grand affichage"),
      marketingFormat("Affiche F200", "Portrait", "Format F200"),
      marketingFormat("Affiche F200L", "Paysage", "Format F200L"),
      marketingFormat("Affiche F12", "Portrait", "Format F12"),
      marketingFormat("Affiche F12L", "Paysage", "Format F12L"),
      marketingFormat("Affiche F24", "Portrait", "Format F24"),
      marketingFormat("Carton a suspendre 250 x 350 mm", "Portrait", "250 x 350 mm"),
      marketingFormat("RailPoster", "Paysage", "RailPoster"),
      marketingFormat("RailMidiPoster", "Paysage", "RailMidiPoster"),
    ],
  },
  {
    id: "postcard",
    title: "Carte postale",
    description: "Cartes postales, cartes cadeau et invitations recto-verso ou 4 pages.",
    icon: FileImage,
    suggestions: ["Carte cadeau", "Invitation VIP", "Merci client", "Carte de voeux"],
    formats: [
      marketingFormat("Carte postale A6 105 x 148 mm", "Paysage", "DIN A6 105 x 148 mm"),
      marketingFormat("Carte postale A5 148 x 210 mm", "Paysage", "DIN A5 148 x 210 mm"),
      marketingFormat("Carte postale carree 148 x 148 mm", "Carre", "Carre 148 x 148 mm"),
      marketingFormat("Carte de voeux 4 pages A6", "Paysage", "Carte pliee A6", "4 pages"),
      marketingFormat("Carte de voeux 4 pages A5", "Paysage", "Carte pliee A5", "4 pages"),
    ],
  },
  {
    id: "sticker",
    title: "Autocollant / sticker",
    description: "Etiquettes, stickers QR, stickers emballage et formes rondes ou carrees.",
    icon: FileImage,
    suggestions: ["Sticker packaging", "QR code avis", "Etiquette produit", "Scelle livraison"],
    formats: [
      marketingFormat("Autocollant format carte de visite", "Paysage", "Format carte de visite"),
      marketingFormat("Autocollant A8", "Portrait", "DIN A8"),
      marketingFormat("Autocollant A7", "Portrait", "DIN A7"),
      marketingFormat("Autocollant A6", "Portrait", "DIN A6"),
      marketingFormat("Autocollant DIN A6/5", "Portrait", "DIN A6/5"),
      marketingFormat("Autocollant A5", "Portrait", "DIN A5"),
      marketingFormat("Autocollant A4", "Portrait", "DIN A4"),
      marketingFormat("Autocollant A3", "Portrait", "DIN A3"),
      marketingFormat("Autocollant carre 50 x 50 mm", "Carre", "Carre 50 x 50 mm"),
      marketingFormat("Autocollant carre 74 x 74 mm", "Carre", "Carre 74 x 74 mm"),
      marketingFormat("Autocollant carre 105 x 105 mm", "Carre", "Carre 105 x 105 mm"),
      marketingFormat("Autocollant carre 148 x 148 mm", "Carre", "Carre 148 x 148 mm"),
      marketingFormat("Autocollant rond 30 mm", "Rond", "Rond 30 mm"),
      marketingFormat("Autocollant rond 50 mm", "Rond", "Rond 50 mm"),
      marketingFormat("Autocollant rond 74 mm", "Rond", "Rond 74 mm"),
      marketingFormat("Autocollant rond 105 mm", "Rond", "Rond 105 mm"),
      marketingFormat("Autocollant Freeform", "Libre", "Forme libre"),
    ],
  },
  {
    id: "pos_display",
    title: "PLV / presentoir",
    description: "Supports de comptoir, porte-brochures, affiches a poser, chevalets et roll-up.",
    icon: FileImage,
    suggestions: ["Comptoir livraison", "Menu QR", "Table tente", "Entree restaurant"],
    formats: [
      marketingFormat("Presentoir carte de visite portrait", "Portrait", "Presentoir cartes de visite portrait"),
      marketingFormat("Presentoir carte de visite paysage", "Paysage", "Presentoir cartes de visite paysage"),
      marketingFormat("Porte-brochures DIN A6", "Portrait", "Porte-brochures DIN A6"),
      marketingFormat("Porte-brochures DIN A6/5", "Portrait", "Porte-brochures DIN A6/5"),
      marketingFormat("Porte-brochures DIN A5", "Portrait", "Porte-brochures DIN A5"),
      marketingFormat("Affiche a poser A4", "Portrait", "Affiche a poser DIN A4"),
      marketingFormat("Affiche a poser A3", "Portrait", "Affiche a poser DIN A3"),
      marketingFormat("Affiche a poser A2", "Portrait", "Affiche a poser DIN A2"),
      marketingFormat("Affiche a poser A1", "Portrait", "Affiche a poser DIN A1"),
      marketingFormat("Chevalet Stopper A1", "Portrait", "Chevalet Stopper A1"),
      marketingFormat("Cadre Stopper A1", "Portrait", "Cadre Stopper A1"),
      marketingFormat("Roll-up", "Portrait", "Roll-up"),
    ],
  },
  {
    id: "banner",
    title: "Bache / banniere",
    description: "Baches grand format, bannieres de chantier et supports exterieurs.",
    icon: Megaphone,
    suggestions: ["Terrasse", "Ouverture facade", "Festival food", "Signaletique retrait"],
    formats: [
      marketingFormat("Bache format libre hauteur 800 mm", "Paysage", "Format libre, hauteur jusqu'a 800 mm"),
      marketingFormat("Bache format libre hauteur 1000 mm", "Paysage", "Format libre, hauteur jusqu'a 1000 mm"),
      marketingFormat("Bache format libre hauteur 1500 mm", "Paysage", "Format libre, hauteur jusqu'a 1500 mm"),
      marketingFormat("Bache format libre hauteur 2000 mm", "Paysage", "Format libre, hauteur jusqu'a 2000 mm"),
      marketingFormat("Bache format libre hauteur 2400 mm", "Paysage", "Format libre, hauteur jusqu'a 2400 mm"),
      marketingFormat("Bache chantier 340 x 173 cm", "Paysage", "340 x 173 cm"),
      marketingFormat("Banniere barriere de securite", "Paysage", "Banniere pour barriere de securite"),
    ],
  },
];

const DEFAULT_MARKETING_FORMAT = MARKETING_TOOLS[0]!.formats[0]!;

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
    description: "Choisissez le support imprime ou digital, puis son format.",
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

  if (
    message.includes("functionsfetcherror") ||
    message.includes("functionsrelayerror") ||
    rawMessage.includes("Failed to send a request to the Edge Function") ||
    message.includes("relay error invoking the edge function")
  ) {
    return "La fonction Supabase de génération image n'a pas répondu correctement. Réessayez avec moins de visuels de référence ou un prompt plus court; si le problème persiste, l'équipe TOK doit vérifier la fonction ai-image-enhance.";
  }
  if (message.includes("requested function was not found") || message.includes("not_found")) {
    return "La fonction Supabase ai-image-enhance n'est pas disponible. Relancez le workflow de déploiement des Edge Functions avant de réessayer.";
  }
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
  if (normalized.includes("rond")) return "square";
  if (normalized.includes("carre") || normalized.includes("carr")) return "square";
  return "landscape";
}

function getFormatByLabel(formats: MarketingFormatOption[], label: string): MarketingFormatOption {
  return formats.find((option) => option.label === label) || formats[0] || DEFAULT_MARKETING_FORMAT;
}

function getFormatOrientations(formats: MarketingFormatOption[]) {
  return formats.reduce<MarketingOrientation[]>((orientations, option) => {
    if (!orientations.includes(option.orientation)) orientations.push(option.orientation);
    return orientations;
  }, []);
}

function getFormatOrientationSummary(format: MarketingFormatOption) {
  if (format.orientation === "Rond" || format.orientation === "Libre") {
    return `Forme: ${format.orientation}`;
  }
  return `Orientation: ${format.orientation}`;
}

function buildMarketingImagePrompt(input: {
  toolTitle: string;
  prompt: string;
  format: string;
  formatSpec: string;
  pageHint?: string;
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
    `Support: ${input.toolTitle}. Format: ${input.format}. Specification imprimeur: ${input.formatSpec}. Orientation: ${input.orientation}. Style: ${input.styleMode}.`,
    `Pagination et support: ${input.pageHint || "respecter le format selectionne et garder les zones de coupe/marge visuellement propres."}`,
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
  const [format, setFormat] = useState(DEFAULT_MARKETING_FORMAT.label);
  const [orientation, setOrientation] = useState<MarketingOrientation>(DEFAULT_MARKETING_FORMAT.orientation);
  const [styleMode, setStyleMode] = useState("Base sur mon identite");
  const [resources, setResources] = useState<MarketingResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<MarketingAssetKind | null>(null);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null);
  const [marketingImageResult, setMarketingImageResult] = useState<MarketingImageResult | null>(null);
  const [activeStep, setActiveStep] = useState<MarketingWorkflowStep>(1);
  const generationRequestRef = useRef(0);

  const activeToolConfig = MARKETING_TOOLS.find((tool) => tool.id === activeTool) || MARKETING_TOOLS[0]!;
  const selectedFormat = getFormatByLabel(activeToolConfig.formats, format);
  const availableOrientations = useMemo(
    () => getFormatOrientations(activeToolConfig.formats),
    [activeToolConfig.formats],
  );
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
    const nextFormat = getFormatByLabel(activeToolConfig.formats, format);
    if (!activeToolConfig.formats.some((option) => option.label === format)) {
      setFormat(nextFormat.label);
      setOrientation(nextFormat.orientation);
      return;
    }
    if (orientation !== nextFormat.orientation) setOrientation(nextFormat.orientation);
  }, [activeToolConfig.formats, format, orientation]);

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
          format: selectedFormat.label,
          formatSpec: selectedFormat.printSpec,
          pageHint: selectedFormat.pageHint,
          orientation: selectedFormat.orientation,
          styleMode,
          resources: generationResources,
        }),
        referenceImageUrls: generationResources.map((resource) => resource.mediaUrl),
        dishName: activeToolConfig.title,
        assetType: "campaign_visual",
        format: getMarketingImageFormat(selectedFormat.label, selectedFormat.orientation),
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
    <section className="max-w-full overflow-hidden rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-background to-background shadow-sm dark:border-orange-900/50 dark:from-orange-950/20">
      <div className="grid min-w-0 gap-4 p-3 sm:gap-6 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <div className="relative min-w-0 overflow-hidden rounded-3xl border border-orange-200 bg-[radial-gradient(circle_at_top_right,rgba(255,115,0,0.20),transparent_38%),linear-gradient(135deg,#fff7ed,#ffffff_52%,#fff1e6)] p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
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

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-sm font-bold text-white shadow-sm">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 text-orange-600" />
                        <p className="min-w-0 break-words text-sm font-semibold text-foreground">{step.title}</p>
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <Card className="min-w-0 border-orange-200 bg-white/95 shadow-md shadow-orange-100/40 dark:bg-background/85">
            <CardHeader className="border-b border-orange-100 bg-orange-50/60 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Wand2 className="h-5 w-5 text-orange-600" />
                Générer un nouveau visuel
              </CardTitle>
              <CardDescription className="break-words">Choisissez le type de support, puis decrivez le resultat attendu.</CardDescription>
                </div>
                <Badge variant="outline" className="w-fit border-orange-300 bg-white text-orange-700">
                  Workflow guidé
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4 p-3 sm:p-5">
              <div className="min-w-0 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background sm:rounded-3xl">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">1</span>
                  Choisir le support
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {MARKETING_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const selected = tool.id === activeTool;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => {
                        const nextFormat = tool.formats[0] || DEFAULT_MARKETING_FORMAT;
                        invalidateMarketingGeneration();
                        setActiveTool(tool.id);
                        setFormat(nextFormat.label);
                        setOrientation(nextFormat.orientation);
                        setActiveStep((current) => current < 2 ? 2 : current);
                      }}
                      className={`min-w-0 rounded-2xl border p-4 text-center transition ${
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
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tool.description}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>

              <div className={`${activeStep >= 2 ? "" : "hidden"} min-w-0 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background sm:rounded-3xl`}>
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
                <div className="flex min-w-0 flex-col gap-2 break-words text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">{sanitizedPrompt.length}/{MARKETING_PROMPT_MAX_LENGTH} caractères sécurisés</span>
                  <span className="min-w-0">{hasBrandResources ? "Identite visuelle exploitable" : "Ajoutez au moins deux ressources de marque pour affiner le style."}</span>
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

              <div className={`${activeStep >= 2 ? "flex" : "hidden"} min-w-0 flex-wrap gap-2 rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 p-3 sm:rounded-3xl`}>
                <span className="basis-full self-center text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 sm:mr-1 sm:basis-auto">Idées rapides</span>
                {activeToolConfig.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    className="max-w-full rounded-full border bg-background px-3 py-1 text-left text-xs font-medium text-muted-foreground transition [overflow-wrap:anywhere] hover:border-orange-300 hover:text-orange-700"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className={`${activeStep >= 3 ? "" : "hidden"} min-w-0 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background sm:rounded-3xl`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">3</span>
                  Paramétrer le rendu
                </div>
              <div className="grid min-w-0 gap-4 md:grid-cols-3">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="marketing-format">Format</Label>
                  <select
                    id="marketing-format"
                    value={format}
                    onChange={(event) => {
                      const nextFormat = getFormatByLabel(activeToolConfig.formats, event.target.value);
                      invalidateMarketingGeneration();
                      setFormat(nextFormat.label);
                      setOrientation(nextFormat.orientation);
                    }}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {activeToolConfig.formats.map((option) => (
                      <option key={option.label} value={option.label}>{option.label}</option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-muted-foreground">{selectedFormat.printSpec}</p>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="marketing-orientation">Orientation / forme</Label>
                  <select
                    id="marketing-orientation"
                    value={orientation}
                    onChange={(event) => {
                      const nextOrientation = event.target.value as MarketingOrientation;
                      const nextFormat = activeToolConfig.formats.find((option) => option.orientation === nextOrientation) || activeToolConfig.formats[0] || DEFAULT_MARKETING_FORMAT;
                      invalidateMarketingGeneration();
                      setOrientation(nextOrientation);
                      setFormat(nextFormat.label);
                    }}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {availableOrientations.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-muted-foreground">{selectedFormat.pageHint || "Format adapte au support selectionne."}</p>
                </div>
                <div className="min-w-0 space-y-2">
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
                <div className="mt-2 flex justify-stretch md:col-span-3 md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveStep(4)}
                    className="h-auto min-h-[44px] w-full min-w-0 whitespace-normal rounded-2xl border-orange-300 text-center text-orange-700 hover:bg-orange-50 sm:w-auto"
                  >
                    Verifier le recapitulatif
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              </div>

              <div className={`${activeStep >= 4 ? "" : "hidden"} min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm shadow-sm sm:rounded-3xl sm:p-4`}>
                <div className="mb-3 flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">4</span>
                  <p className="min-w-0 break-words font-semibold text-emerald-950">Contrôle avant génération</p>
                </div>
                <p className="break-words font-semibold text-foreground">Image marketing prête à générer</p>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-emerald-900/80">
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Type: {activeToolConfig.title}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Format: {selectedFormat.label}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Specification: {selectedFormat.printSpec}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">{getFormatOrientationSummary(selectedFormat)}</span>
                  {selectedFormat.pageHint ? (
                    <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Pages: {selectedFormat.pageHint}</span>
                  ) : null}
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Style: {styleMode}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Ressources: {persistedResources.length}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Logo: {hasLogo ? "oui" : "non"}</span>
                </div>
                <p className="mt-2 line-clamp-2 min-w-0 rounded-2xl bg-white/80 p-3 text-emerald-950/80 [overflow-wrap:anywhere]">{sanitizedPrompt || "Le prompt apparaitra ici apres saisie."}</p>
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

              <div className={`${activeStep >= 4 ? "flex" : "hidden"} min-w-0 flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50/80 p-3 sm:flex-row sm:items-center sm:rounded-3xl`}>
                <Button type="button" onClick={requestGeneration} disabled={!restaurantId || loading} size="lg" className="h-auto min-h-12 w-full min-w-0 whitespace-normal rounded-2xl bg-orange-600 px-4 text-center text-base font-bold shadow-lg shadow-orange-500/20 hover:bg-orange-700 sm:w-auto sm:px-6">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "Génération de l'image..." : "Générer l'image marketing"}
                </Button>
                <p className="min-w-0 break-words text-xs leading-5 text-muted-foreground">
                  Image générée côté serveur avec validation RLS, ressources persistantes, quotas IA et historique.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
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
