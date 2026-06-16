export type CampaignCreativeTemplate = "signature" | "offer" | "story";
export type CampaignCreativeTone = "tok_orange" | "fresh_green" | "night_gold" | "berry";
export type CampaignCreativeFont = "display" | "modern" | "editorial";
export type CampaignCreativeBackground = "gradient" | "soft_pattern" | "photo_overlay";
export type CampaignCreativeShape = "rounded" | "ticket" | "capsule";

export type CampaignCreativeConfig = {
  template: CampaignCreativeTemplate;
  tone: CampaignCreativeTone;
  font: CampaignCreativeFont;
  background: CampaignCreativeBackground;
  shape: CampaignCreativeShape;
};

export const CAMPAIGN_CREATIVE_TEMPLATES: Array<{
  id: CampaignCreativeTemplate;
  label: string;
  description: string;
  previewLabel: string;
  contentClassName: string;
}> = [
  {
    id: "signature",
    label: "Signature",
    description: "Une accroche premium avec un appel à l'action très visible.",
    previewLabel: "Recommande",
    contentClassName: "justify-between",
  },
  {
    id: "offer",
    label: "Offre directe",
    description: "Un format plus commercial pour pousser une offre courte.",
    previewLabel: "Conversion",
    contentClassName: "justify-center",
  },
  {
    id: "story",
    label: "Coulisses",
    description: "Un rendu éditorial pour raconter une nouveauté ou un événement.",
    previewLabel: "Image de marque",
    contentClassName: "justify-end",
  },
];

export const CAMPAIGN_CREATIVE_TONES: Array<{
  id: CampaignCreativeTone;
  label: string;
  swatchClassName: string;
  previewClassName: string;
  accentClassName: string;
  ctaClassName: string;
}> = [
  {
    id: "tok_orange",
    label: "TOK orange",
    swatchClassName: "bg-[#ff5a14]",
    previewClassName: "from-[#ff7a1a] via-[#ff4d00] to-[#c92b00]",
    accentClassName: "bg-white/18 text-white ring-white/25",
    ctaClassName: "bg-white text-[#e54800] hover:bg-white/90",
  },
  {
    id: "fresh_green",
    label: "Frais vert",
    swatchClassName: "bg-[#00a878]",
    previewClassName: "from-[#13b981] via-[#047857] to-[#083f36]",
    accentClassName: "bg-white/16 text-white ring-white/25",
    ctaClassName: "bg-white text-[#047857] hover:bg-white/90",
  },
  {
    id: "night_gold",
    label: "Nuit doree",
    swatchClassName: "bg-[#d99b2b]",
    previewClassName: "from-[#15151f] via-[#4b2c12] to-[#d97706]",
    accentClassName: "bg-amber-300/18 text-amber-50 ring-amber-200/25",
    ctaClassName: "bg-amber-100 text-amber-950 hover:bg-amber-50",
  },
  {
    id: "berry",
    label: "Rose berry",
    swatchClassName: "bg-[#db2777]",
    previewClassName: "from-[#f43f5e] via-[#db2777] to-[#7c2d12]",
    accentClassName: "bg-white/16 text-white ring-white/25",
    ctaClassName: "bg-white text-[#be123c] hover:bg-white/90",
  },
];

export const CAMPAIGN_CREATIVE_FONTS: Array<{
  id: CampaignCreativeFont;
  label: string;
  sample: string;
  className: string;
}> = [
  { id: "display", label: "TOK display", sample: "Impact", className: "font-display" },
  { id: "modern", label: "Moderne", sample: "Clair", className: "font-sans" },
  { id: "editorial", label: "Éditorial", sample: "Premium", className: "font-serif" },
];

export const CAMPAIGN_CREATIVE_BACKGROUNDS: Array<{
  id: CampaignCreativeBackground;
  label: string;
  description: string;
  layerClassName: string;
}> = [
  {
    id: "gradient",
    label: "Dégradé",
    description: "Fond fort et lisible pour les emplacements sponsorisés.",
    layerClassName: "bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.26),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_45%)]",
  },
  {
    id: "soft_pattern",
    label: "Motif doux",
    description: "Texture discrete qui garde le texte au premier plan.",
    layerClassName: "bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.28)_0_2px,transparent_3px),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.18)_0_2px,transparent_3px)] bg-[length:42px_42px]",
  },
  {
    id: "photo_overlay",
    label: "Photo voilée",
    description: "Utilise l'image uploadée avec un voile de contraste.",
    layerClassName: "bg-black/18",
  },
];

export const CAMPAIGN_CREATIVE_SHAPES: Array<{
  id: CampaignCreativeShape;
  label: string;
  description: string;
  previewClassName: string;
  chipClassName: string;
}> = [
  {
    id: "rounded",
    label: "Arrondi",
    description: "Carte pleine largeur, simple et premium.",
    previewClassName: "rounded-[28px]",
    chipClassName: "rounded-2xl",
  },
  {
    id: "ticket",
    label: "Ticket",
    description: "Effet coupon pour les offres et temps forts.",
    previewClassName: "rounded-[24px]",
    chipClassName: "rounded-lg",
  },
  {
    id: "capsule",
    label: "Capsule",
    description: "Bords très doux pour une campagne plus lifestyle.",
    previewClassName: "rounded-[40px]",
    chipClassName: "rounded-full",
  },
];

export const DEFAULT_CAMPAIGN_CREATIVE: CampaignCreativeConfig = {
  template: "signature",
  tone: "tok_orange",
  font: "display",
  background: "gradient",
  shape: "rounded",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized as T) ? normalized as T : fallback;
}

export function normalizeCampaignCreative(value: unknown): CampaignCreativeConfig {
  const source = isRecord(value) ? value : {};

  return {
    template: pickAllowed(
      source.template,
      CAMPAIGN_CREATIVE_TEMPLATES.map((entry) => entry.id),
      DEFAULT_CAMPAIGN_CREATIVE.template,
    ),
    tone: pickAllowed(
      source.tone,
      CAMPAIGN_CREATIVE_TONES.map((entry) => entry.id),
      DEFAULT_CAMPAIGN_CREATIVE.tone,
    ),
    font: pickAllowed(
      source.font,
      CAMPAIGN_CREATIVE_FONTS.map((entry) => entry.id),
      DEFAULT_CAMPAIGN_CREATIVE.font,
    ),
    background: pickAllowed(
      source.background,
      CAMPAIGN_CREATIVE_BACKGROUNDS.map((entry) => entry.id),
      DEFAULT_CAMPAIGN_CREATIVE.background,
    ),
    shape: pickAllowed(
      source.shape,
      CAMPAIGN_CREATIVE_SHAPES.map((entry) => entry.id),
      DEFAULT_CAMPAIGN_CREATIVE.shape,
    ),
  };
}

export function getCampaignCreativeSummary(creative: CampaignCreativeConfig) {
  const normalized = normalizeCampaignCreative(creative);
  const template = CAMPAIGN_CREATIVE_TEMPLATES.find((entry) => entry.id === normalized.template);
  const tone = CAMPAIGN_CREATIVE_TONES.find((entry) => entry.id === normalized.tone);
  const font = CAMPAIGN_CREATIVE_FONTS.find((entry) => entry.id === normalized.font);
  const background = CAMPAIGN_CREATIVE_BACKGROUNDS.find((entry) => entry.id === normalized.background);
  const shape = CAMPAIGN_CREATIVE_SHAPES.find((entry) => entry.id === normalized.shape);

  return [template?.label, tone?.label, font?.label, background?.label, shape?.label]
    .filter(Boolean)
    .join(" · ");
}
