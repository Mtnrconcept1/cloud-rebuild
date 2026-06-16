export type CampaignCreativeTemplate =
  | "signature"
  | "offer"
  | "story"
  | "contrast"
  | "minimal"
  | "dynamic"
  | "immersive"
  | "street";
export type CampaignCreativeTone = "tok_orange" | "fresh_green" | "night_gold" | "berry";
export type CampaignCreativeFont = "display" | "modern" | "editorial";
export type CampaignCreativeBackground = "gradient" | "soft_pattern" | "photo_overlay" | "paper" | "dark_grain";
export type CampaignCreativeShape = "rounded" | "ticket" | "capsule" | "wave" | "fade" | "grunge" | "diagonal";

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
  cardClassName: string;
  mediaClassName: string;
  panelClassName: string;
  badgeClassName: string;
}> = [
  {
    id: "signature",
    label: "01 - Classique élégant",
    description: "Carte claire, image gourmande et bloc campagne lisible.",
    previewLabel: "Recommande",
    contentClassName: "justify-end",
    cardClassName: "bg-[#fff8ed] text-[#171717]",
    mediaClassName: "absolute left-0 top-0 h-[36%] w-full",
    panelClassName: "border-orange-200/80 bg-white/88 text-[#171717] shadow-[0_18px_42px_-28px_rgba(120,54,15,0.8)]",
    badgeClassName: "bg-[#ff5a14] text-white",
  },
  {
    id: "offer",
    label: "02 - Moderne épuré",
    description: "Photo immersive sombre, offre courte et CTA fort.",
    previewLabel: "Conversion",
    contentClassName: "justify-end",
    cardClassName: "bg-[#111111] text-white",
    mediaClassName: "absolute inset-0 h-full w-full",
    panelClassName: "border-white/15 bg-black/38 text-white shadow-[0_22px_60px_-34px_rgba(0,0,0,0.95)] backdrop-blur-sm",
    badgeClassName: "bg-[#ff5a14] text-white",
  },
  {
    id: "story",
    label: "03 - Coulisses gourmand",
    description: "Fond chaud, photo en masque doux et ton éditorial.",
    previewLabel: "Image de marque",
    contentClassName: "justify-end",
    cardClassName: "bg-[#fff4df] text-[#171717]",
    mediaClassName: "absolute right-4 top-4 h-[32%] w-[58%]",
    panelClassName: "border-orange-200/90 bg-white/82 text-[#171717] shadow-[0_18px_42px_-28px_rgba(120,54,15,0.75)]",
    badgeClassName: "bg-[#ff5a14] text-white",
  },
  {
    id: "contrast",
    label: "04 - Audacieux contrasté",
    description: "Noir intense, image tranchée et forte lisibilité.",
    previewLabel: "Impact",
    contentClassName: "justify-end",
    cardClassName: "bg-[#101010] text-white",
    mediaClassName: "absolute right-0 top-0 h-[38%] w-[62%]",
    panelClassName: "border-orange-400/40 bg-black/58 text-white shadow-[0_22px_60px_-34px_rgba(0,0,0,0.95)]",
    badgeClassName: "bg-[#ff5a14] text-white",
  },
  {
    id: "minimal",
    label: "05 - Minimaliste premium",
    description: "Beaucoup d'air, photo fondue et encart premium.",
    previewLabel: "Premium",
    contentClassName: "justify-end",
    cardClassName: "bg-[#fbf7ee] text-[#171717]",
    mediaClassName: "absolute bottom-0 right-0 h-[54%] w-[70%]",
    panelClassName: "border-white/90 bg-white/92 text-[#171717] shadow-[0_24px_70px_-38px_rgba(111,78,37,0.75)]",
    badgeClassName: "bg-[#ff5a14] text-white",
  },
  {
    id: "dynamic",
    label: "06 - Dynamique coloré",
    description: "Composition vive avec zone image masquée.",
    previewLabel: "Notoriété",
    contentClassName: "justify-end",
    cardClassName: "bg-[#fff2d8] text-[#171717]",
    mediaClassName: "absolute right-0 top-0 h-[40%] w-[66%]",
    panelClassName: "border-emerald-300/40 bg-emerald-700/88 text-white shadow-[0_22px_60px_-34px_rgba(0,80,54,0.8)]",
    badgeClassName: "bg-[#ffd51f] text-[#15120a]",
  },
  {
    id: "immersive",
    label: "07 - Immersif photo",
    description: "Photo plein cadre, voile sombre et contenu superposé.",
    previewLabel: "Immersif",
    contentClassName: "justify-end",
    cardClassName: "bg-[#14100c] text-white",
    mediaClassName: "absolute inset-0 h-full w-full",
    panelClassName: "border-white/18 bg-black/42 text-white shadow-[0_22px_60px_-34px_rgba(0,0,0,0.95)] backdrop-blur-[2px]",
    badgeClassName: "bg-[#ff5a14] text-white",
  },
  {
    id: "street",
    label: "08 - Urbain street",
    description: "Fond brut, accents verts et photo grunge.",
    previewLabel: "Street",
    contentClassName: "justify-end",
    cardClassName: "bg-[#0b0b0b] text-white",
    mediaClassName: "absolute right-0 top-0 h-[42%] w-[66%]",
    panelClassName: "border-white/30 bg-white/94 text-[#151515] shadow-[0_22px_60px_-34px_rgba(0,0,0,0.9)]",
    badgeClassName: "bg-[#ff5a14] text-white",
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
    previewClassName: "from-[#fff4e7] via-[#ff6a1a] to-[#ff3f00]",
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
  {
    id: "paper",
    label: "Papier premium",
    description: "Fond clair, texture douce et lecture très nette.",
    layerClassName: "bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.78),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.56),rgba(255,237,213,0.22))]",
  },
  {
    id: "dark_grain",
    label: "Grain sombre",
    description: "Fond contrasté pour offres flash et campagnes fortes.",
    layerClassName: "bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_18%),radial-gradient(circle_at_82%_28%,rgba(16,185,129,0.16),transparent_28%),linear-gradient(135deg,rgba(0,0,0,0.32),rgba(0,0,0,0.62))]",
  },
];

export const CAMPAIGN_CREATIVE_SHAPES: Array<{
  id: CampaignCreativeShape;
  label: string;
  description: string;
  previewClassName: string;
  chipClassName: string;
  mediaMaskClassName: string;
}> = [
  {
    id: "rounded",
    label: "Arrondi",
    description: "Photo avec coins doux, proche des cartes premium.",
    previewClassName: "rounded-[28px]",
    chipClassName: "rounded-2xl",
    mediaMaskClassName: "rounded-[28px]",
  },
  {
    id: "ticket",
    label: "Ticket",
    description: "Découpe coupon pour les offres et temps forts.",
    previewClassName: "rounded-[24px]",
    chipClassName: "rounded-lg",
    mediaMaskClassName: "rounded-[24px] [clip-path:polygon(0_0,92%_0,100%_16%,100%_100%,0_100%)]",
  },
  {
    id: "capsule",
    label: "Capsule",
    description: "Masque très doux pour une campagne lifestyle.",
    previewClassName: "rounded-[40px]",
    chipClassName: "rounded-full",
    mediaMaskClassName: "rounded-[999px]",
  },
  {
    id: "wave",
    label: "Vague",
    description: "Forme organique qui laisse respirer la photo.",
    previewClassName: "rounded-[28px]",
    chipClassName: "rounded-[50%]",
    mediaMaskClassName: "rounded-[28px] [clip-path:ellipse(75%_58%_at_58%_42%)]",
  },
  {
    id: "fade",
    label: "Fade-in",
    description: "Photo fondue dans le fond pour garder le texte net.",
    previewClassName: "rounded-[28px]",
    chipClassName: "rounded-2xl",
    mediaMaskClassName: "rounded-[28px] [mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)]",
  },
  {
    id: "grunge",
    label: "Grunge",
    description: "Bord brut pour un rendu urbain et contrasté.",
    previewClassName: "rounded-[24px]",
    chipClassName: "rounded-md",
    mediaMaskClassName: "rounded-[20px] [clip-path:polygon(0_7%,100%_0,94%_86%,72%_100%,14%_92%)]",
  },
  {
    id: "diagonal",
    label: "Diagonale",
    description: "Découpe dynamique pour attirer l'oeil.",
    previewClassName: "rounded-[28px]",
    chipClassName: "rounded-lg",
    mediaMaskClassName: "rounded-[24px] [clip-path:polygon(12%_0,100%_0,100%_100%,0_84%)]",
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
