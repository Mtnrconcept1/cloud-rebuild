import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AiGenerationProgressDialog from "@/components/ui/ai-generation-progress-dialog";
import AiStyleReferencePicker, {
  type AiStyleReferenceUploadedResource,
  type AiStyleReferenceValue,
} from "@/components/dashboard/AiStyleReferencePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  type TokImageFormat,
  type TokImageGenerationRequest,
  type TokImageGenerationResult,
} from "@/lib/ai/tokAiClient";
import {
  requestAiCreationNotificationPermission,
  setActiveAiCreationContext,
  startTokImageCreationJob,
  useAiCreationRecovery,
} from "@/lib/ai/aiCreationJobs";
import {
  getTokImageOutputPricing,
  type TokImageOutputResolution,
} from "@/lib/ai/imagePricing";
import { createTokGenerationSeed, sanitizeTokGenerationSeed } from "@/lib/ai/generationSeed";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import { formatAiImageGenerationError, isTokCreditError } from "@/lib/publicErrorMessages";
import { assertSafeFileUpload, getSafeUploadExtension } from "@/lib/uploadSecurity";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  generateCommercialDemoVisual,
  getCommercialDemoVisualHistory,
  type CommercialDemoAiRuntime,
  type CommercialDemoVisualHistoryItem,
} from "@/lib/commercialDemoAi";
import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  FileImage,
  FileText,
  ImagePlus,
  Loader2,
  Megaphone,
  Palette,
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

type MarketingRestaurantProfile = {
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  cuisineType: string | null;
  email: string | null;
  website: string | null;
};

type MarketingMenuItem = {
  name: string;
  description: string | null;
  price: number | string | null;
  category: string | null;
  isAvailable: boolean | null;
};

type MarketingBusinessContext = {
  restaurant: MarketingRestaurantProfile | null;
  menuItems: MarketingMenuItem[];
  menuItemsTruncated: boolean;
};

type Props = {
  restaurantId?: string | null;
};

type MarketingImageResult = TokImageGenerationResult;
type MarketingWorkflowStep = 1 | 2 | 3;

const supabase = getSupabase();

const MARKETING_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
const MARKETING_STORAGE_BUCKET = "restaurant-images";
const MARKETING_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_MARKETING_ASSET_BYTES = 15 * 1024 * 1024;
const MAX_COMMERCIAL_DEMO_REFERENCE_BYTES = 4 * 1024 * 1024;
const MARKETING_PROMPT_MAX_LENGTH = 900;
const MARKETING_MENU_CONTEXT_LIMIT = 120;
const MARKETING_MENU_PROMPT_ITEM_LIMIT = 80;
const MARKETING_RENDER_SCROLL_DURATION_MS = 620;
const MARKETING_RENDER_SCROLL_OFFSET_PX = 24;

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

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
const MARKETING_REFERENCE_LIMIT = 4;
const MARKETING_REFERENCE_KIND_PRIORITY: MarketingAssetKind[] = [
  "logo",
  "business_card",
  "restaurant_menu",
  "brand_visuals",
];
const MARKETING_SUGGESTION_BATCH_SIZE = 10;

const MARKETING_PROMPT_IDEAS = [
  "Soiree a theme",
  "Menu du jour",
  "Offre speciale",
  "Brunch du dimanche",
  "Happy hour terrasse",
  "Nouveau plat signature",
  "Menu degustation",
  "Formule midi rapide",
  "Menu enfant",
  "Carte des desserts",
  "Cocktail maison",
  "Afterwork tapas",
  "Saint-Valentin",
  "Fete des meres",
  "Fete des peres",
  "Nouvel An",
  "Halloween gourmand",
  "Noel au restaurant",
  "Ramadan Iftar",
  "Paques en famille",
  "Plat vegetarien",
  "Option vegan",
  "Burger premium",
  "Pizza du mois",
  "Pinsa romana",
  "Pates fraiches",
  "Poisson du jour",
  "Viande grillee",
  "Tacos party",
  "Sushi box",
  "Kebab gourmet",
  "Salade fraicheur",
  "Dessert maison",
  "Cafe gourmand",
  "Menu business lunch",
  "Offre etudiant",
  "Livraison offerte",
  "A emporter rapide",
  "Reservation conseillee",
  "Ouverture exceptionnelle",
  "Nouvelle terrasse",
  "Ambiance musicale",
  "Live DJ",
  "Degustation vins",
  "Accord mets et vins",
  "Carte automne",
  "Carte hiver",
  "Carte printemps",
  "Saveurs estivales",
  "Produits locaux",
  "Cuisine de saison",
  "Fait maison",
  "Chef en cuisine",
  "Equipe en salle",
  "Restaurant familial",
  "Restaurant premium",
  "Ambiance cosy",
  "Ambiance festive",
  "Service tardif",
  "Petit-dejeuner",
  "Pause cafe",
  "Goûter gourmand",
  "Menu sportif",
  "Offre match",
  "Anniversaire",
  "Repas d'entreprise",
  "Carte cadeau",
  "Fidelite clients",
  "Lancement nouvelle carte",
  "Programme fidelite",
  "Anti-gaspi du jour",
  "Vente flash",
  "Dernieres tables",
  "Places limitees",
  "Ouverture dimanche",
  "Privatisation",
  "Traiteur evenement",
  "Buffet aperitif",
  "Menu mariage",
  "Burger week",
  "Pasta week",
  "Tiramisu maison",
  "Cuisine italienne",
  "Cuisine americaine",
  "Cuisine libanaise",
  "Cuisine japonaise",
  "Cuisine suisse",
  "Cuisine francaise",
  "Cuisine mexicaine",
  "Cuisine indienne",
  "Street food premium",
  "Photo plat hero",
  "Affiche vitrine",
  "Flyer boite aux lettres",
  "Story Instagram",
  "Post carre reseaux sociaux",
  "Banniere web",
  "Carte de fidelite",
  "QR code menu",
  "Pied de page avec contact",
  "Menu lisible pour impression",
  "Carte boissons",
  "Selection du chef",
];

const MARKETING_NEGATIVE_PROMPT_IDEAS = [
  "Ne deforme pas le texte",
  "Aucune forme bizarre",
  "Aucun logo deforme",
  "Aucune faute dans les mots visibles",
  "Pas de texte illisible",
  "Pas de lettres inventees",
  "Pas de mains deformees",
  "Pas d'assiette deformee",
  "Pas d'aliments irreconnaissables",
  "Pas de couleurs criardes",
  "Pas de fond trop charge",
  "Pas de flou sur le produit principal",
  "Pas de contraste trop faible",
  "Pas de prix modifie",
  "Pas de date inventee",
  "Pas de telephone invente",
  "Pas d'adresse inventee",
  "Pas de promesse non demandee",
  "Pas de reduction inventee",
  "Pas de QR code fictif",
  "Pas de watermark",
  "Pas de bordure coupee",
  "Pas de logo concurrent",
  "Pas de marque externe",
  "Pas d'effet plastique",
  "Pas de visage inquietant",
  "Pas d'ombres incoherentes",
  "Pas de perspective tordue",
  "Pas de texte hors zone",
  "Pas de surcharge d'icones",
  "Pas d'orthographe anglaise si le visuel est francais",
  "Pas de style low cost",
  "Pas de typographie trop fine",
  "Pas d'element important coupe au bord",
  "Pas de compression visible",
];

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
    title: "Choix du support",
    description: "Support, format, orientation et style.",
    icon: FileImage,
  },
  {
    title: "Éléments de références marketing",
    description: "Logo, carte, menu et visuels de marque dédiés au studio.",
    icon: Upload,
  },
  {
    title: "Brief & génération",
    description: "Rédigez le brief puis générez le visuel.",
    icon: Wand2,
  },
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

function sanitizeMarketingContextValue(value: unknown, maxLength = 220) {
  if (typeof value !== "string") return "";
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : char;
  })
    .join("")
    .replace(/[<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

function formatMarketingMenuPrice(price: MarketingMenuItem["price"]) {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return "";
  return `${numericPrice.toFixed(2)} CHF`;
}

function buildMarketingRestaurantContext(context?: MarketingBusinessContext | null) {
  const restaurant = context?.restaurant;
  if (!restaurant) return "Aucune fiche restaurant disponible.";

  const contactLines = [
    sanitizeMarketingContextValue(restaurant.name) ? `Nom: ${sanitizeMarketingContextValue(restaurant.name, 120)}` : "",
    sanitizeMarketingContextValue(restaurant.cuisineType) ? `Types de cuisine: ${sanitizeMarketingContextValue(restaurant.cuisineType, 180)}` : "",
    sanitizeMarketingContextValue(restaurant.description) ? `Description: ${sanitizeMarketingContextValue(restaurant.description, 300)}` : "",
    [sanitizeMarketingContextValue(restaurant.address, 180), sanitizeMarketingContextValue(restaurant.city, 80)].filter(Boolean).join(", "),
    sanitizeMarketingContextValue(restaurant.phone) ? `Telephone: ${sanitizeMarketingContextValue(restaurant.phone, 80)}` : "",
    sanitizeMarketingContextValue(restaurant.email) ? `Email: ${sanitizeMarketingContextValue(restaurant.email, 120)}` : "",
    sanitizeMarketingContextValue(restaurant.website) ? `Site: ${sanitizeMarketingContextValue(restaurant.website, 160)}` : "",
  ].filter(Boolean);

  return contactLines.length ? contactLines.join(" | ") : "Fiche restaurant vide.";
}

function buildMarketingMenuContext(context?: MarketingBusinessContext | null) {
  const menuItems = context?.menuItems || [];
  if (!menuItems.length) return "Aucun plat de menu disponible.";

  const visibleItems = menuItems.slice(0, MARKETING_MENU_PROMPT_ITEM_LIMIT);
  const grouped = new Map<string, string[]>();

  for (const item of visibleItems) {
    const category = sanitizeMarketingContextValue(item.category, 80) || "Sans categorie";
    const name = sanitizeMarketingContextValue(item.name, 120);
    if (!name) continue;

    const price = formatMarketingMenuPrice(item.price);
    const description = sanitizeMarketingContextValue(item.description, 180);
    const availability = item.isAvailable === false ? "indisponible" : "";
    const details = [price, availability, description].filter(Boolean).join(" - ");
    const line = details ? `${name} (${details})` : name;
    grouped.set(category, [...(grouped.get(category) || []), line]);
  }

  const summary = Array.from(grouped.entries())
    .map(([category, items]) => `${category}: ${items.join("; ")}`)
    .join(" | ");
  const suffix = context?.menuItemsTruncated || menuItems.length > MARKETING_MENU_PROMPT_ITEM_LIMIT
    ? ` | Menu tronque: ${Math.min(menuItems.length, MARKETING_MENU_CONTEXT_LIMIT)} plats charges, ${visibleItems.length} transmis.`
    : "";

  return `${summary}${suffix}`.slice(0, 2200);
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
  return formatAiImageGenerationError(error);
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
  styleReference?: AiStyleReferenceValue | null;
  businessContext?: MarketingBusinessContext | null;
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
    `Contexte restaurant public autorise pour pied de page, carte de visite, affiche ou menu: ${buildMarketingRestaurantContext(input.businessContext)}`,
    `Informations de menu disponibles pour creer une carte ou un menu: ${buildMarketingMenuContext(input.businessContext)}`,
    `Ressources actives à utiliser comme seules références visuelles: ${resourceSummary}`,
    input.styleReference
      ? `Référence de style prioritaire: ${input.styleReference.fileName}. Reprendre son ambiance, sa lumière, sa palette, son cadrage et son rendu, sans copier son contenu ni inventer une autre marque.`
      : "Référence de style prioritaire: aucune image de style spécifique sélectionnée.",
    `Empreinte des ressources actives: ${resourceFingerprint || "aucune"}`,
    "Direction artistique: reprendre l'identité visuelle observable dans les fichiers actifs fournis pour cette génération: logo, couleurs, typographies, textures, style photo, formes, composition, hiérarchie et ton commercial.",
    "Interdictions: ne pas utiliser l'identité visuelle de la plateforme par défaut, ne pas réutiliser une identité ou un prompt d'une génération précédente, ne pas inventer une autre marque si les références indiquent une marque précise.",
    "Le nom du compte restaurant n'est pas une reference visuelle: ne pas l'utiliser pour inventer une marque, un logo, une typographie, un chef, un personnage ou un plat.",
    "Si les references actives ne montrent pas clairement une marque ou un personnage, produire un visuel sans marque inventee.",
    "Contraintes: respecter uniquement le prompt courant et les visuels actifs envoyés avec cette requête, ne pas ajouter de coordonnées privées, ne pas créer de faux label officiel, garder le texte demandé lisible.",
    "Coordonnées et menu: utiliser uniquement les informations fournies dans le contexte restaurant et menu; ne pas inventer d'email, de téléphone, d'adresse, de prix ou de plat.",
  ].join("\n\n").slice(0, 5600);
}

function selectMarketingGenerationResources(resources: MarketingResource[]) {
  const activeResources = resources.filter((resource) => resource.persisted && resource.mediaUrl);
  const selected: MarketingResource[] = [];

  for (const kind of MARKETING_REFERENCE_KIND_PRIORITY) {
    for (const resource of activeResources.filter((item) => item.kind === kind)) {
      if (selected.some((item) => item.mediaUrl === resource.mediaUrl)) continue;
      selected.push(resource);
      if (selected.length >= MARKETING_REFERENCE_LIMIT) return selected;
      if (kind !== "brand_visuals") break;
    }
  }

  return selected;
}

function withStyleReferenceResource(
  generationResources: MarketingResource[],
  styleReference: AiStyleReferenceValue | null,
  latestResources: MarketingResource[],
) {
  if (!styleReference?.mediaId && !styleReference?.mediaUrl) return generationResources;

  const matchedResource = latestResources.find((resource) =>
    Boolean(resource.persisted && resource.mediaUrl) &&
    ((styleReference.mediaId && resource.mediaId === styleReference.mediaId) || resource.mediaUrl === styleReference.mediaUrl)
  );
  if (!matchedResource?.mediaId) return generationResources;

  return [
    matchedResource,
    ...generationResources.filter((resource) => resource.mediaId !== matchedResource.mediaId && resource.mediaUrl !== matchedResource.mediaUrl),
  ].slice(0, MARKETING_REFERENCE_LIMIT);
}

function createMarketingAssetPath(userId: string, restaurantId: string, file: File) {
  const ext = getSafeUploadExtension(file, MARKETING_IMAGE_MIME_EXTENSIONS);
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${restaurantId}/marketing-assets/${userId}/${id}.${ext}`;
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

function styleReferenceToMarketingResource(resource: AiStyleReferenceUploadedResource): MarketingResource {
  return {
    id: resource.mediaId,
    mediaId: resource.mediaId,
    kind: "brand_visuals",
    fileName: resource.fileName,
    fileSize: 0,
    mimeType: "image/*",
    mediaUrl: resource.mediaUrl,
    storageBucket: resource.storageBucket,
    storagePath: resource.storagePath,
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

async function fetchMarketingBusinessContext(restaurantId: string): Promise<MarketingBusinessContext> {
  const [restaurantResult, invoiceSettingsResult, menuItemsResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select("name, description, address, city, phone, cuisine_type")
      .eq("id", restaurantId)
      .maybeSingle(),
    supabase
      .from("restaurant_invoice_settings")
      .select("email, phone, website")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    supabase
      .from("menu_items")
      .select("name, description, price, category, is_available")
      .eq("restaurant_id", restaurantId)
      .order("category", { ascending: true })
      .order("name", { ascending: true })
      .limit(MARKETING_MENU_CONTEXT_LIMIT),
  ]);

  if (restaurantResult.error) throw restaurantResult.error;
  if (menuItemsResult.error) throw menuItemsResult.error;
  if (invoiceSettingsResult.error) {
    console.warn("[marketing-studio] contexte email/site indisponible", invoiceSettingsResult.error);
  }

  const restaurant = restaurantResult.data;
  const invoiceSettings = invoiceSettingsResult.data;
  const menuItems = (menuItemsResult.data || []).map((item) => ({
    name: item.name,
    description: item.description,
    price: item.price,
    category: item.category,
    isAvailable: item.is_available,
  })) satisfies MarketingMenuItem[];

  return {
    restaurant: restaurant
      ? {
        name: restaurant.name,
        description: restaurant.description,
        address: restaurant.address,
        city: restaurant.city,
        phone: invoiceSettings?.phone || restaurant.phone || null,
        cuisineType: restaurant.cuisine_type,
        email: invoiceSettings?.email || null,
        website: invoiceSettings?.website || null,
      }
      : null,
    menuItems,
    menuItemsTruncated: menuItems.length >= MARKETING_MENU_CONTEXT_LIMIT,
  };
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

  if (insertError) {
      await supabase.storage.from(storageBucket).remove([storagePath]);
      throw insertError;
    }
  return rowToMarketingResource(media as Record<string, unknown>);
}

function escapeDemoSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function demoSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clampColorChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixRgb(
  color: { red: number; green: number; blue: number },
  target: { red: number; green: number; blue: number },
  amount: number,
) {
  return {
    red: color.red + (target.red - color.red) * amount,
    green: color.green + (target.green - color.green) * amount,
    blue: color.blue + (target.blue - color.blue) * amount,
  };
}

function hashMarketingReferences(resources: MarketingResource[]) {
  const value = resources
    .map((resource) => `${resource.kind}:${resource.fileName}:${resource.fileSize}:${resource.mimeType}`)
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function sampleMarketingReference(resource: MarketingResource) {
  if (typeof document === "undefined" || !resource.mediaUrl) return null;

  return new Promise<{ red: number; green: number; blue: number } | null>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: { red: number; green: number; blue: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    const timeoutId = window.setTimeout(() => finish(null), 3500);

    if (resource.mediaUrl.startsWith("https://")) image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return finish(null);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let weight = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] / 255;
          if (alpha < 0.2) continue;
          const pixelRed = pixels[index];
          const pixelGreen = pixels[index + 1];
          const pixelBlue = pixels[index + 2];
          const contrast = Math.max(pixelRed, pixelGreen, pixelBlue) - Math.min(pixelRed, pixelGreen, pixelBlue);
          const pixelWeight = alpha * (1 + contrast / 255);
          red += pixelRed * pixelWeight;
          green += pixelGreen * pixelWeight;
          blue += pixelBlue * pixelWeight;
          weight += pixelWeight;
        }
        finish(weight > 0 ? { red: red / weight, green: green / weight, blue: blue / weight } : null);
      } catch {
        // Cross-origin references can reject canvas reads. The deterministic fallback below remains isolated.
        finish(null);
      }
    };
    image.onerror = () => finish(null);
    image.src = resource.mediaUrl;
  });
}

async function buildCommercialDemoReferencePalette(
  resources: MarketingResource[],
): Promise<NonNullable<TokImageGenerationRequest["demoReferencePalette"]>> {
  const selected = resources.slice(0, MARKETING_REFERENCE_LIMIT);
  const sampled = (await Promise.all(selected.map(sampleMarketingReference))).filter(
    (color): color is { red: number; green: number; blue: number } => Boolean(color),
  );
  const fingerprint = hashMarketingReferences(selected);
  const fallbackSeed = Number.parseInt(fingerprint.slice(0, 6), 16) || 0xff6b00;
  const base = sampled.length > 0
    ? sampled.reduce((total, color) => ({
        red: total.red + color.red / sampled.length,
        green: total.green + color.green / sampled.length,
        blue: total.blue + color.blue / sampled.length,
      }), { red: 0, green: 0, blue: 0 })
    : {
        red: (fallbackSeed >> 16) & 255,
        green: (fallbackSeed >> 8) & 255,
        blue: fallbackSeed & 255,
      };
  const primary = mixRgb(base, { red: 255, green: 107, blue: 0 }, 0.18);
  const secondary = mixRgb(base, { red: 255, green: 255, blue: 255 }, 0.58);
  const background = mixRgb(base, { red: 9, green: 9, blue: 11 }, 0.74);

  return {
    primaryColor: rgbToHex(primary.red, primary.green, primary.blue),
    secondaryColor: rgbToHex(secondary.red, secondary.green, secondary.blue),
    backgroundColor: rgbToHex(background.red, background.green, background.blue),
    fingerprint,
    label: selected.map((resource) => resource.fileName).join(", ").slice(0, 90),
  };
}

function buildCommercialDemoMarketingResources(snapshot: CommercialDemoSnapshot): MarketingResource[] {
  const restaurant = snapshot.demo_restaurant;
  const restaurantName = escapeDemoSvgText(restaurant.name || "Restaurant Démo TOK");
  const menuLines = snapshot.catalog_items
    .filter((item) => item.is_available)
    .slice(0, 4)
    .map((item, index) => (
      `<text x="42" y="${96 + index * 36}" fill="#1f2937" font-size="20" font-family="Arial, sans-serif">${escapeDemoSvgText(item.name)}</text>`
    ))
    .join("");
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720"><rect width="720" height="720" rx="96" fill="#fff7ed"/><circle cx="360" cy="300" r="170" fill="#ff6b00"/><text x="360" y="328" text-anchor="middle" fill="white" font-size="92" font-weight="800" font-family="Arial, sans-serif">TOK</text><text x="360" y="540" text-anchor="middle" fill="#111827" font-size="38" font-weight="700" font-family="Arial, sans-serif">${restaurantName}</text></svg>`;
  const menuSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="#fffaf5"/><rect x="24" y="24" width="852" height="1152" rx="36" fill="none" stroke="#ff6b00" stroke-width="8"/><text x="42" y="62" fill="#ff6b00" font-size="28" font-weight="800" font-family="Arial, sans-serif">CARTE DÉMO · ${restaurantName}</text>${menuLines}<text x="42" y="1128" fill="#6b7280" font-size="18" font-family="Arial, sans-serif">Ressource isolée de la session commerciale</text></svg>`;
  const resources: MarketingResource[] = [
    {
      id: `demo-logo-${restaurant.id}`,
      kind: "logo",
      fileName: `Logo Démo ${restaurant.name}`,
      fileSize: 0,
      mimeType: "image/svg+xml",
      mediaUrl: demoSvgDataUrl(logoSvg),
      storageBucket: null,
      storagePath: null,
      persisted: true,
    },
    {
      id: `demo-menu-${restaurant.id}`,
      kind: "restaurant_menu",
      fileName: "Carte Démo TOK",
      fileSize: 0,
      mimeType: "image/svg+xml",
      mediaUrl: demoSvgDataUrl(menuSvg),
      storageBucket: null,
      storagePath: null,
      persisted: true,
    },
  ];

  if (restaurant.image_url) {
    resources.push({
      id: `demo-visual-${restaurant.id}`,
      kind: "brand_visuals",
      fileName: `Visuel ${restaurant.name}`,
      fileSize: 0,
      mimeType: "image/*",
      mediaUrl: restaurant.image_url,
      storageBucket: null,
      storagePath: null,
      persisted: true,
    });
  }

  return resources;
}

function buildCommercialDemoBusinessContext(snapshot: CommercialDemoSnapshot): MarketingBusinessContext {
  const restaurant = snapshot.demo_restaurant;
  return {
    restaurant: {
      name: restaurant.name,
      description: restaurant.description || null,
      address: restaurant.address || null,
      city: restaurant.city || null,
      phone: restaurant.phone || null,
      cuisineType: restaurant.cuisine_type || null,
      email: null,
      website: null,
    },
    menuItems: snapshot.catalog_items.map((item) => ({
      name: item.name,
      description: item.description || null,
      price: item.price,
      category: item.category || null,
      isAvailable: item.is_available,
    })),
    menuItemsTruncated: false,
  };
}

export default function TokAiMarketingStudio({ restaurantId }: Props) {
  const { toast } = useToast();
  // A visual stored while the tab was away is re-attached instead of being lost.
  useAiCreationRecovery(restaurantId);
  const commercialDemoFrame = useCommercialDemoFrame();
  const commercialDemoSessionId = commercialDemoFrame?.config.sessionId;
  const commercialDemoSurface = commercialDemoFrame?.surface;
  const demoRuntime = useMemo<CommercialDemoAiRuntime | null>(() => {
    if (!commercialDemoSessionId || !commercialDemoSurface || commercialDemoSurface === "commercial") return null;
    return {
      sessionId: commercialDemoSessionId,
      surface: commercialDemoSurface,
    };
  }, [commercialDemoSessionId, commercialDemoSurface]);
  const isCommercialDemo = Boolean(demoRuntime);
  const demoStudioEnabled = !commercialDemoFrame
    || commercialDemoFrame.snapshot.active_features.includes("dashboard-photos");
  const [activeTool, setActiveTool] = useState<MarketingToolId>("flyer");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState(DEFAULT_MARKETING_FORMAT.label);
  const [orientation, setOrientation] = useState<MarketingOrientation>(DEFAULT_MARKETING_FORMAT.orientation);
  const [styleMode, setStyleMode] = useState("Base sur mon identite");
  const [generationSeed, setGenerationSeed] = useState("");
  const [styleReference, setStyleReference] = useState<AiStyleReferenceValue | null>(null);
  const outputResolution: TokImageOutputResolution = "studio";
  const [resources, setResources] = useState<MarketingResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<MarketingAssetKind | null>(null);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null);
  const [marketingImageResult, setMarketingImageResult] = useState<MarketingImageResult | null>(null);
  const [demoGenerationHistory, setDemoGenerationHistory] = useState<CommercialDemoVisualHistoryItem[]>([]);
  const [demoHistoryLoading, setDemoHistoryLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<MarketingWorkflowStep>(1);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [visiblePromptIdeaCount, setVisiblePromptIdeaCount] = useState(MARKETING_SUGGESTION_BATCH_SIZE);
  const [visibleNegativeIdeaCount, setVisibleNegativeIdeaCount] = useState(MARKETING_SUGGESTION_BATCH_SIZE);
  const generationRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const renderSettingsRef = useRef<HTMLDivElement | null>(null);
  const renderSettingsScrollFrameRef = useRef<number | null>(null);
  const demoObjectUrlsRef = useRef(new Set<string>());
  const initializedDemoResourcesRef = useRef<string | null>(null);

  const activeToolConfig = MARKETING_TOOLS.find((tool) => tool.id === activeTool) || MARKETING_TOOLS[0]!;
  const selectedFormat = getFormatByLabel(activeToolConfig.formats, format);
  const availableOrientations = useMemo(
    () => getFormatOrientations(activeToolConfig.formats),
    [activeToolConfig.formats],
  );
  const sanitizedPrompt = sanitizeMarketingPrompt(prompt);
  const promptWarnings = getMarketingPromptWarnings(prompt);
  const promptIdeas = useMemo(() => {
    return Array.from(new Set([...activeToolConfig.suggestions, ...MARKETING_PROMPT_IDEAS]));
  }, [activeToolConfig.suggestions]);
  const visiblePromptIdeas = promptIdeas.slice(0, visiblePromptIdeaCount);
  const visibleNegativePromptIdeas = MARKETING_NEGATIVE_PROMPT_IDEAS.slice(0, visibleNegativeIdeaCount);
  const persistedResources = resources.filter((resource) => resource.persisted && resource.mediaUrl);
  const hasLogo = persistedResources.some((resource) => resource.kind === "logo");
  const hasBrandResources = persistedResources.length >= 2;
  const marketingImageFormat = getMarketingImageFormat(selectedFormat.label, selectedFormat.orientation);
  const outputPricing = getTokImageOutputPricing(marketingImageFormat, outputResolution);
  const displayedModelLabel = isCommercialDemo ? "OpenAI réel · Démo isolée" : outputPricing.modelLabel;
  const displayedPhotoCredits = isCommercialDemo
    ? "illimités (Démo)"
    : `${outputPricing.photoCredits} cr.`;
  const sanitizedGenerationSeed = sanitizeTokGenerationSeed(generationSeed);
  const { data: businessContext, isLoading: businessContextLoading } = useQuery({
    queryKey: ["marketing-studio-business-context", restaurantId, isCommercialDemo],
    queryFn: () => fetchMarketingBusinessContext(restaurantId!),
    enabled: !!restaurantId && !isCommercialDemo,
  });
  const demoBusinessContext = useMemo(() => (
    commercialDemoFrame ? buildCommercialDemoBusinessContext(commercialDemoFrame.snapshot) : null
  ), [commercialDemoFrame]);
  const activeBusinessContext = isCommercialDemo ? demoBusinessContext : businessContext;
  const activeBusinessContextLoading = isCommercialDemo ? false : businessContextLoading;
  const demoResourceFingerprint = commercialDemoFrame
    ? [
      commercialDemoFrame.config.sessionId,
      commercialDemoFrame.snapshot.demo_restaurant.image_url || "",
      ...commercialDemoFrame.snapshot.catalog_items.map((item) => `${item.id}:${item.name}:${item.is_available}`),
    ].join("|")
    : "";

  useEffect(() => {
    if (isCommercialDemo) return;
    setActiveAiCreationContext("dashboard-photos:marketing");
    return () => setActiveAiCreationContext(null);
  }, [isCommercialDemo]);

  useEffect(() => {
    mountedRef.current = true;
    const demoObjectUrls = demoObjectUrlsRef.current;
    return () => {
      mountedRef.current = false;
      if (renderSettingsScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(renderSettingsScrollFrameRef.current);
      }
      for (const objectUrl of demoObjectUrls) URL.revokeObjectURL(objectUrl);
      demoObjectUrls.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!demoRuntime) {
      setDemoGenerationHistory([]);
      setDemoHistoryLoading(false);
      return undefined;
    }

    setDemoHistoryLoading(true);
    getCommercialDemoVisualHistory(demoRuntime, "marketing_studio", 20)
      .then((items) => {
        if (cancelled) return;
        setDemoGenerationHistory(items);
        setMarketingImageResult((current) => current || items[0] || null);
      })
      .catch(() => {
        if (!cancelled) setDemoGenerationHistory([]);
      })
      .finally(() => {
        if (!cancelled) setDemoHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [demoRuntime]);

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

  const updateGenerationSeed = (value: string) => {
    invalidateMarketingGeneration();
    setGenerationSeed(sanitizeTokGenerationSeed(value));
  };

  const generateNewMarketingSeed = () => {
    updateGenerationSeed(createTokGenerationSeed("marketing"));
  };

  const handleStyleReferenceUploaded = (resource: AiStyleReferenceUploadedResource) => {
    const marketingResource = styleReferenceToMarketingResource(resource);
    setResources((current) => [
      marketingResource,
      ...current.filter((item) => item.mediaId !== resource.mediaId && item.mediaUrl !== resource.mediaUrl),
    ]);
    invalidateMarketingGeneration();
  };

  const handleStyleReferenceChange = (nextStyleReference: AiStyleReferenceValue | null) => {
    setStyleReference(nextStyleReference);
    invalidateMarketingGeneration();
  };

  const scrollToMarketingRenderSettings = () => {
    const target = renderSettingsRef.current;
    if (!target || typeof window === "undefined") return;

    if (renderSettingsScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(renderSettingsScrollFrameRef.current);
      renderSettingsScrollFrameRef.current = null;
    }

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const startY = window.scrollY;
    const targetY = Math.max(
      0,
      startY + target.getBoundingClientRect().top - MARKETING_RENDER_SCROLL_OFFSET_PX,
    );
    const distance = targetY - startY;

    if (prefersReducedMotion || Math.abs(distance) < 2) {
      window.scrollTo({ top: targetY, left: window.scrollX, behavior: "auto" });
      return;
    }

    const startTime = window.performance.now();
    const animateScroll = (currentTime: number) => {
      const progress = Math.min((currentTime - startTime) / MARKETING_RENDER_SCROLL_DURATION_MS, 1);
      const easedProgress = easeInOutCubic(progress);
      window.scrollTo(0, startY + distance * easedProgress);

      if (progress < 1) {
        renderSettingsScrollFrameRef.current = window.requestAnimationFrame(animateScroll);
        return;
      }

      renderSettingsScrollFrameRef.current = null;
    };

    renderSettingsScrollFrameRef.current = window.requestAnimationFrame(animateScroll);
  };

  const handleMarketingToolSelect = (tool: MarketingToolConfig) => {
    const nextFormat = tool.formats[0] || DEFAULT_MARKETING_FORMAT;
    invalidateMarketingGeneration();
    setActiveTool(tool.id);
    setFormat(nextFormat.label);
    setOrientation(nextFormat.orientation);
    window.requestAnimationFrame(scrollToMarketingRenderSettings);
  };

  useEffect(() => {
    setVisiblePromptIdeaCount(MARKETING_SUGGESTION_BATCH_SIZE);
    setVisibleNegativeIdeaCount(MARKETING_SUGGESTION_BATCH_SIZE);
  }, [activeTool]);

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
    if (commercialDemoFrame && initializedDemoResourcesRef.current === demoResourceFingerprint) {
      return;
    }
    generationRequestRef.current += 1;
    setLoading(false);
    setMarketingImageResult(null);
    setStyleReference(null);

    async function loadMarketingAssets() {
      if (!restaurantId) {
        initializedDemoResourcesRef.current = null;
        setResources([]);
        setResourcesLoading(false);
        return;
      }

      if (commercialDemoFrame) {
        initializedDemoResourcesRef.current = demoResourceFingerprint;
        setResources(buildCommercialDemoMarketingResources(commercialDemoFrame.snapshot));
        setResourcesLoading(false);
        return;
      }

      setResourcesLoading(true);
      initializedDemoResourcesRef.current = null;
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
  }, [commercialDemoFrame, demoResourceFingerprint, restaurantId, toast]);

  const handleResourceFiles = async (kind: MarketingAssetKind, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const accepted = files.filter((file) => {
      try {
        assertSafeFileUpload(file, {
          allowedMimeTypes: MARKETING_IMAGE_MIME_EXTENSIONS,
          maxBytes: isCommercialDemo ? MAX_COMMERCIAL_DEMO_REFERENCE_BYTES : MAX_MARKETING_ASSET_BYTES,
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

    if (isCommercialDemo) {
      invalidateMarketingGeneration();
      const localResources = accepted.map((file) => {
        const id = typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `demo-resource-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const mediaUrl = URL.createObjectURL(file);
        demoObjectUrlsRef.current.add(mediaUrl);
        return {
          id,
          mediaId: id,
          kind,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          mediaUrl,
          storageBucket: null,
          storagePath: null,
          persisted: true,
        } satisfies MarketingResource;
      });
      setResources((current) => [...localResources, ...current]);
      toast({
        title: "Références ajoutées à la Démo",
        description: "Les fichiers restent hors du Storage et des tables de production. Les deux références utilisées seront transmises temporairement à OpenAI lors de la génération.",
      });
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      toast({ title: "Connexion requise", description: "Reconnectez-vous avant d'ajouter des visuels.", variant: "destructive" });
      return;
    }

    invalidateMarketingGeneration();
    setUploadingKind(kind);
    const previousResources = resources;
    setResources((current) => {
      const pending = accepted.map((file) => createPendingMarketingResource(file, kind));
      return [...pending, ...current];
    });

    let persisted: MarketingResource[] = [];
    try {
      const uploadResults = await Promise.allSettled(accepted.map((file) => uploadMarketingResource({
        restaurantId,
        userId: userData.user.id,
        kind,
        file,
      })));
      persisted = uploadResults
        .filter((result): result is PromiseFulfilledResult<MarketingResource> => result.status === "fulfilled")
        .map((result) => result.value);

      const failedUpload = uploadResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failedUpload) {
        if (!persisted.length) throw failedUpload.reason;
      }

      setResources((current) => {
        const pendingIds = new Set(accepted.map((file) => createPendingMarketingResource(file, kind).id));
        const existingResources = current.filter((resource) => !pendingIds.has(resource.id));
        return [...persisted, ...existingResources];
      });
      toast({
        title: failedUpload ? "Visuels partiellement enregistrés" : "Visuels enregistrés",
        description: failedUpload
          ? "Les visuels ajoutés avec succès restent disponibles. Les fichiers en échec peuvent être réessayés sans supprimer les anciens."
          : "Les nouveaux visuels ont été ajoutés aux références existantes. Les anciens restent disponibles jusqu'à suppression manuelle.",
      });
    } catch (error) {
      setResources(previousResources);
      toast({
        title: "Upload impossible",
        description: error instanceof Error ? error.message : "Impossible d'ajouter les visuels marketing.",
        variant: "destructive",
      });
    } finally {
      setUploadingKind(null);
    }
  };

  const deleteMarketingResource = async (resource: MarketingResource) => {
    if (deletingResourceId) return;

    invalidateMarketingGeneration();

    if (isCommercialDemo) {
      setResources((current) => current.filter((item) => item.id !== resource.id));
      if (resource.mediaUrl.startsWith("blob:")) {
        URL.revokeObjectURL(resource.mediaUrl);
        demoObjectUrlsRef.current.delete(resource.mediaUrl);
      }
      toast({
        title: "Référence retirée de la Démo",
        description: "Aucune donnée ou ressource de production n'a été modifiée.",
      });
      return;
    }

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
    const safeGenerationSeed = sanitizeTokGenerationSeed(generationSeed);

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
    setCreditError(null);
    setMarketingImageResult(null);

    try {
      if (!isCommercialDemo) void requestAiCreationNotificationPermission();
      const [latestResources, latestBusinessContext] = isCommercialDemo
        ? [resources, activeBusinessContext || null] as const
        : await Promise.all([
          fetchMarketingResources(restaurantId),
          fetchMarketingBusinessContext(restaurantId),
        ]);
      if (!mountedRef.current || generationRequestRef.current !== requestId) return;

      setResources(latestResources);
      const baseGenerationResources = selectMarketingGenerationResources(latestResources);
      const generationResources = withStyleReferenceResource(baseGenerationResources, styleReference, latestResources);
      const generationResourceIds = generationResources
        .map((resource) => resource.mediaId)
        .filter((mediaId): mediaId is string => Boolean(mediaId));
      if (!isCommercialDemo && !generationResources.length) {
        toast({
          title: "Reference requise",
          description: "Ajoutez au moins une ressource de marque active avant de generer un visuel marketing.",
          variant: "destructive",
        });
        return;
      }
      if (!isCommercialDemo && generationResourceIds.length !== generationResources.length) {
        toast({
          title: "Reference instable",
          description: "Rechargez les ressources de marque avant de generer. TOK ne lance pas de generation avec des references non identifiees.",
          variant: "destructive",
        });
        return;
      }
      const demoReferencePalette = isCommercialDemo
        ? await buildCommercialDemoReferencePalette(generationResources)
        : null;
      if (!mountedRef.current || generationRequestRef.current !== requestId) return;

      const imagePrompt = buildMarketingImagePrompt({
        toolTitle: activeToolConfig.title,
        prompt: safePrompt,
        format: selectedFormat.label,
        formatSpec: selectedFormat.printSpec,
        pageHint: selectedFormat.pageHint,
        orientation: selectedFormat.orientation,
        styleMode,
        resources: generationResources,
        styleReference,
        businessContext: latestBusinessContext,
      });

      const generationRequest = {
        restaurantId,
        prompt: imagePrompt,
        referenceImageUrls: generationResources.map((resource) => resource.mediaUrl),
        referenceMediaIds: generationResourceIds,
        dishName: activeToolConfig.title,
        assetType: "campaign_visual" as const,
        format: marketingImageFormat,
        outputResolution,
        variantCount: 1,
        generationSeed: safeGenerationSeed || null,
        generateImage: true,
        imageOnly: true,
        marketingAssetMode: true,
        styleMode,
        demoReferencePalette,
      };
      const imageResult = demoRuntime
        ? await generateCommercialDemoVisual(demoRuntime, generationRequest)
        : await startTokImageCreationJob({
          restaurantId,
          tool: "marketing_studio",
          title: `${activeToolConfig.title} ${selectedFormat.label}`,
          request: generationRequest,
        }).promise;

      if (!mountedRef.current || generationRequestRef.current !== requestId) return;

      setGenerationSeed(imageResult.generation_seed || safeGenerationSeed);
      setMarketingImageResult(imageResult);
      if (isCommercialDemo && imageResult.created_at) {
        const historyItem: CommercialDemoVisualHistoryItem = {
          ...imageResult,
          created_at: imageResult.created_at,
          prompt: imagePrompt,
          tool: "marketing_studio",
          style: styleMode,
        };
        setDemoGenerationHistory((current) => [
          historyItem,
          ...current.filter((item) => item.assetId !== historyItem.assetId),
        ].slice(0, 20));
      }
      setCreditError(null);
      toast({
        title: "Image marketing générée",
        description: isCommercialDemo
          ? "Le visuel a réellement été créé avec OpenAI dans l'espace Démo isolé. Les crédits Démo sont illimités et le coût fournisseur est suivi en interne."
          : `Le visuel a été produit avec ${imageResult.model || "OpenAI"} pour ${outputPricing.photoCredits} crédit(s) photo IA.`,
      });
    } catch (error) {
      if (!mountedRef.current || generationRequestRef.current !== requestId) return;
      const rawMessage = error instanceof Error ? error.message : "";
      const message = isCommercialDemo
        ? /disabled|désactiv/i.test(rawMessage)
          ? "Le Studio Marketing est désactivé par le flag administrateur dashboard-photos."
          : "Le moteur visuel de démonstration est momentanément indisponible. Réessayez dans quelques instants."
        : formatMarketingImageGenerationError(error);
      if (!isCommercialDemo && isTokCreditError(error)) setCreditError(message);
      toast({
        title: "Image impossible",
        description: message,
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current && generationRequestRef.current === requestId) setLoading(false);
    }
  };

  const generatedMarketingImageUrl = marketingImageResult?.gallery_image_url || marketingImageResult?.generated_image_url || "";

  if (!demoStudioEnabled) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Studio Marketing désactivé</CardTitle>
          <CardDescription>
            Le flag dashboard-photos est désactivé par l'administrateur pour cette démonstration.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="max-w-full overflow-hidden rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-background to-background shadow-sm dark:border-orange-900/50 dark:from-orange-950/20">
      <div className="grid min-w-0 gap-4 p-3 sm:gap-6 sm:p-5 lg:p-6">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <div className="relative min-w-0 overflow-hidden rounded-3xl border border-orange-200 bg-[radial-gradient(circle_at_top_right,rgba(255,115,0,0.20),transparent_38%),linear-gradient(135deg,#fff7ed,#ffffff_52%,#fff1e6)] p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
            <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-orange-200/50 blur-3xl" aria-hidden="true" />
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-orange-600 text-white hover:bg-orange-600">Marketing automatique</Badge>
                {isCommercialDemo ? (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                    OpenAI réel · crédits Démo illimités · coût suivi en interne
                  </Badge>
                ) : null}
              </div>
              <div>
                <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                  Studio Photo & Marketing IA
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {isCommercialDemo
                    ? "Utilisez les références préchargées ou ajoutez temporairement vos fichiers. OpenAI génère réellement le visuel ; la clé reste côté serveur et aucune donnée de production n'est modifiée."
                    : "Ajoutez une fois votre logo, vos captures et vos visuels de marque. L'outil les enregistre et génère ensuite une image marketing finale à partir de votre prompt."}
                </p>
              </div>
            </div>
          </div>

          {isCommercialDemo && (demoHistoryLoading || demoGenerationHistory.length > 0) ? (
            <Card className="min-w-0 border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/10">
              <CardHeader className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Créations Démo persistées</CardTitle>
                    <CardDescription>
                      Retrouvez les visuels de cette session après un rechargement, sans Storage ni crédit de production.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 bg-white/80 text-emerald-800">
                    {demoHistoryLoading ? "Chargement…" : `${demoGenerationHistory.length} visuel${demoGenerationHistory.length > 1 ? "s" : ""}`}
                  </Badge>
                </div>
              </CardHeader>
              {demoGenerationHistory.length > 0 ? (
                <CardContent className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto p-4 pt-0 sm:grid-cols-3 lg:grid-cols-4">
                  {demoGenerationHistory.map((item) => {
                    const imageUrl = item.gallery_image_url || item.generated_image_url || "";
                    return (
                      <button
                        key={item.assetId}
                        type="button"
                        onClick={() => {
                          setMarketingImageResult(item);
                          setActiveStep(3);
                          window.requestAnimationFrame(scrollToMarketingRenderSettings);
                        }}
                        className="min-w-0 overflow-hidden rounded-2xl border bg-background text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md"
                      >
                        <span className="block aspect-square bg-slate-950/5 p-2">
                          <img src={imageUrl} alt={item.alt_text} className="h-full w-full rounded-xl object-contain" />
                        </span>
                        <span className="block min-w-0 p-2.5">
                          <span className="block truncate text-xs font-semibold">{item.style || "Style Démo"}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {new Date(item.created_at).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MARKETING_STUDIO_STEPS.map((step, index) => {
              const Icon = step.icon;
              const currentStep = (index + 1) as MarketingWorkflowStep;
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(currentStep)}
                  className={`rounded-2xl border border-orange-100 bg-white/85 p-3 text-left shadow-sm ring-1 ring-black/[0.02] transition hover:border-orange-300 dark:bg-background/80 ${activeStep === currentStep ? "border-orange-400" : ""}`}
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

          <Card className={`${activeStep === 2 ? "hidden" : ""} min-w-0 border-orange-200 bg-white/95 shadow-md shadow-orange-100/40 dark:bg-background/85`}>
            <CardHeader className="border-b border-orange-100 bg-orange-50/60 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Wand2 className="h-5 w-5 text-orange-600" />
                {activeStep === 1 ? "Choix du support" : "Rédiger le brief et générer le visuel"}
              </CardTitle>
              <CardDescription className="break-words">
                {activeStep === 1
                  ? "Choisissez le support, son format, son orientation et son style."
                  : "Décrivez le résultat attendu, vérifiez le récapitulatif, puis lancez la génération."}
              </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit border-orange-300 bg-white text-orange-700">
                  Workflow guidé
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4 p-3 sm:p-5">
              <div className={`${activeStep === 1 ? "" : "hidden"} min-w-0 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background sm:rounded-3xl`}>
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
                      onClick={() => handleMarketingToolSelect(tool)}
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

              <div className={`${activeStep === 3 ? "" : "hidden"} min-w-0 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background sm:rounded-3xl`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">3</span>
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
              </div>
              </div>

              <div className={`${activeStep === 3 ? "space-y-3" : "hidden"} min-w-0 rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 p-3 sm:rounded-3xl`}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="basis-full self-center text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 sm:mr-1 sm:basis-auto">Idées rapides</span>
                  {visiblePromptIdeas.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className="max-w-full rounded-full border bg-background px-3 py-1 text-left text-xs font-medium text-muted-foreground transition [overflow-wrap:anywhere] hover:border-orange-300 hover:text-orange-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                  {visiblePromptIdeaCount < promptIdeas.length ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisiblePromptIdeaCount((count) => Math.min(count + MARKETING_SUGGESTION_BATCH_SIZE, promptIdeas.length))}
                      className="rounded-full"
                    >
                      Afficher plus
                    </Button>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-orange-200/70 pt-3">
                  <span className="basis-full self-center text-xs font-semibold uppercase tracking-[0.18em] text-red-700 sm:mr-1 sm:basis-auto">À éviter</span>
                  {visibleNegativePromptIdeas.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className="max-w-full rounded-full border border-red-100 bg-white px-3 py-1 text-left text-xs font-medium text-red-600 transition [overflow-wrap:anywhere] hover:border-red-300 hover:text-red-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                  {visibleNegativeIdeaCount < MARKETING_NEGATIVE_PROMPT_IDEAS.length ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleNegativeIdeaCount((count) => Math.min(count + MARKETING_SUGGESTION_BATCH_SIZE, MARKETING_NEGATIVE_PROMPT_IDEAS.length))}
                      className="rounded-full"
                    >
                      Afficher plus
                    </Button>
                  ) : null}
                </div>
              </div>

              <div
                ref={renderSettingsRef}
                className={`${activeStep === 1 ? "" : "hidden"} min-w-0 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm dark:bg-background sm:rounded-3xl`}
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">2</span>
                  Paramétrer le rendu
                </div>
              <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <div className="min-w-0 space-y-2 md:col-span-2 xl:col-span-2">
                  <Label htmlFor="marketing-generation-seed">Seed de generation</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="marketing-generation-seed"
                      value={generationSeed}
                      onChange={(event) => updateGenerationSeed(event.target.value)}
                      placeholder="Ex. marketing-menu-premium-01"
                      className="min-w-0"
                    />
                    <Button type="button" variant="outline" onClick={generateNewMarketingSeed} className="shrink-0">
                      Nouvelle seed
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Reutilisez une seed deja reussie pour garder une famille visuelle proche sur vos prochains supports.
                  </p>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label>Image IA</Label>
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    <p className="font-medium text-foreground">{displayedModelLabel}</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {outputPricing.size} - qualité {outputPricing.quality} - crédits {displayedPhotoCredits}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex justify-stretch md:col-span-2 xl:col-span-4 md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveStep(2)}
                    className="h-auto min-h-[44px] w-full min-w-0 whitespace-normal rounded-2xl border-orange-300 text-center text-orange-700 hover:bg-orange-50 sm:w-auto"
                  >
                    Continuer vers les références marketing
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              </div>

              <div className={`${activeStep === 3 ? "" : "hidden"} min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm shadow-sm sm:rounded-3xl sm:p-4`}>
                <div className="mb-3 flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">3</span>
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
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Modele IA: {displayedModelLabel}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Resolution: {outputPricing.size} / {outputPricing.quality}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Credits: {displayedPhotoCredits}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Seed: {marketingImageResult?.generation_seed || sanitizedGenerationSeed || "auto"}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Style réutilisé: {styleReference ? styleReference.fileName : "non"}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Références marketing: {persistedResources.length}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Logo: {hasLogo ? "oui" : "non"}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Fiche restaurant: {activeBusinessContextLoading ? "chargement" : activeBusinessContext?.restaurant ? "active" : "vide"}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 [overflow-wrap:anywhere]">Menu: {activeBusinessContextLoading ? "chargement" : `${activeBusinessContext?.menuItems.length || 0} plat(s)`}</span>
                </div>
                <p className="mt-2 line-clamp-2 min-w-0 rounded-2xl bg-white/80 p-3 text-emerald-950/80 [overflow-wrap:anywhere]">{sanitizedPrompt || "Le prompt apparaitra ici apres saisie."}</p>
              </div>

              {activeStep === 3 && generatedMarketingImageUrl ? (
                <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/50 dark:bg-background">
                  <div className="flex flex-col gap-3 border-b border-emerald-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900/50">
                    <div>
                      <p className="font-semibold text-foreground">Image marketing générée</p>
                      <p className="text-xs text-muted-foreground">
                        Modèle : {marketingImageResult?.model || (isCommercialDemo ? "openai" : "gpt-image-2")}
                      </p>
                      {marketingImageResult?.generation_seed ? (
                        <p className="text-xs text-muted-foreground">Seed: {marketingImageResult.generation_seed}</p>
                      ) : null}
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

              {activeStep === 3 && creditError && !isCommercialDemo ? (
                <div className="min-w-0 rounded-2xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Credits TOK insuffisants</p>
                      <p className="mt-1 text-xs leading-5">{creditError}</p>
                    </div>
                  </div>
                  <Button asChild type="button" variant="outline" className="mt-3 h-9 rounded-xl border-destructive/30 bg-background text-destructive hover:bg-destructive/10">
                    <Link to="/dashboard/mon-compte-facturation">Recharger mes credits</Link>
                  </Button>
                </div>
              ) : null}

              <div className={`${activeStep === 3 ? "flex" : "hidden"} min-w-0 flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50/80 p-3 sm:flex-row sm:items-center sm:rounded-3xl`}>
                <Button type="button" onClick={requestGeneration} disabled={!restaurantId || loading} size="lg" className="h-auto min-h-12 w-full min-w-0 whitespace-normal rounded-2xl bg-orange-600 px-4 text-center text-base font-bold shadow-lg shadow-orange-500/20 hover:bg-orange-700 sm:w-auto sm:px-6">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading
                    ? "Génération de l'image..."
                    : isCommercialDemo
                      ? "Générer avec OpenAI · crédits Démo illimités"
                      : `Générer l'image marketing (${outputPricing.photoCredits} cr.)`}
                </Button>
                <p className="min-w-0 break-words text-xs leading-5 text-muted-foreground">
                  {isCommercialDemo
                    ? "Le résultat et son historique restent dans la session Démo spéciale."
                    : "Votre visuel est généré à partir du brief, du support choisi et des ressources de marque enregistrées."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className={`${activeStep === 2 ? "" : "hidden"} min-w-0 space-y-4`}>
          <Card className="border-orange-200 shadow-sm">
            <CardHeader className="border-b border-orange-100 bg-orange-50/60">
              <Badge variant="outline" className="w-fit border-orange-300 bg-white text-orange-700">
                Etape 2
              </Badge>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="h-5 w-5 text-orange-600" />
                Éléments de références marketing
              </CardTitle>
              <CardDescription>Ajoutez ici les visuels de référence utilisés uniquement par le Marketing Studio. Ils ne sont pas ajoutés à la galerie restaurant.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isCommercialDemo ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Références Démo préchargées. Les fichiers ajoutés ci-dessous restent uniquement en mémoire dans cette fenêtre et ne sont jamais envoyés au Storage.
                </div>
              ) : (
                <AiStyleReferencePicker
                  restaurantId={restaurantId}
                  value={styleReference}
                  onChange={handleStyleReferenceChange}
                  onUploaded={handleStyleReferenceUploaded}
                  galleryMediaTypes={MARKETING_MEDIA_TYPES}
                />
              )}
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
                      <div className="mt-3 grid max-h-80 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                        {kindResources.map((resource) => (
                          <div key={resource.id} className="group overflow-hidden rounded-xl border bg-muted/30">
                            <div className="relative aspect-square bg-white">
                              {resource.mediaUrl ? (
                                <img
                                  src={resource.mediaUrl}
                                  alt={resource.fileName}
                                  className="h-full w-full object-contain p-2"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                  Upload...
                                </div>
                              )}
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute right-2 top-2 h-8 w-8 opacity-95 shadow-sm transition group-hover:opacity-100"
                                disabled={deletingResourceId === resource.id}
                                onClick={() => deleteMarketingResource(resource)}
                                aria-label={`Supprimer ${resource.fileName}`}
                              >
                                {deletingResourceId === resource.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </div>
                            <div className="min-w-0 px-2 py-2">
                              <p className="truncate text-xs font-medium text-foreground">{resource.fileName}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {resource.persisted
                                  ? isCommercialDemo ? "session Démo" : "enregistré"
                                  : "en cours"}{resource.fileSize ? ` · ${formatBytes(resource.fileSize)}` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <Input
                      id={inputId}
                      type="file"
                      accept={MARKETING_UPLOAD_ACCEPT}
                      multiple
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
                  <p>{hasBrandResources ? "Éléments de références marketing prêts pour générer une image cohérente." : "Ajoutez logo + carte/menu/visuels dans cet onglet pour une image plus proche de votre marque."}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setActiveStep(3)} className="gap-2 rounded-2xl bg-orange-600 hover:bg-orange-700">
                  Continuer vers le brief
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

        </aside>
      </div>
      <AiGenerationProgressDialog
        open={loading}
        title="Generation marketing en cours"
        description={isCommercialDemo
          ? "OpenAI compose réellement un visuel isolé ; le coût fournisseur est suivi en interne."
          : "TOK combine le support choisi, votre brief et vos ressources de marque pour produire un visuel coherent."}
        status={isCommercialDemo ? "OpenAI réel · crédits Démo illimités" : "Marketing Studio compose le visuel"}
        steps={["Brief", "Références marketing", "Rendu final"]}
        kind="image"
        estimatedDurationMs={100_000}
      />
    </section>
  );
}
