export type CampaignCreativeTemplate =
  | "classic_elegant"
  | "modern_clean"
  | "warm_gourmet"
  | "bold_contrast"
  | "minimal_premium"
  | "dynamic_color"
  | "immersive_photo"
  | "urban_street";

export type CampaignCreativeTextElement =
  | "badge"
  | "discount"
  | "restaurant"
  | "headline"
  | "body"
  | "cta";

export type CampaignCreativeTextStyle = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
};

export type CampaignCreativeConfig = {
  template: CampaignCreativeTemplate;
  text: Record<CampaignCreativeTextElement, CampaignCreativeTextStyle>;
};

export type CampaignCreativeTemplateLayer = {
  left: number;
  top: number;
  width?: number;
  align?: "left" | "center" | "right";
  className?: string;
  defaultColor?: string;
};

export type CampaignCreativeTemplateDefinition = {
  id: CampaignCreativeTemplate;
  label: string;
  description: string;
  assetSrc: string;
  isDark: boolean;
  dimensions: {
    width: number;
    height: number;
  };
  layers: Record<CampaignCreativeTextElement, CampaignCreativeTemplateLayer>;
};

const TEMPLATE_BASE = "/desig%20app";

const BASE_LAYERS: Record<CampaignCreativeTextElement, CampaignCreativeTemplateLayer> = {
  badge: {
    left: 8,
    top: 7,
    width: 25,
    align: "center",
    className: "text-[2.15%] font-black uppercase tracking-[0.18em]",
    defaultColor: "#ffffff",
  },
  discount: {
    left: 7,
    top: 30.4,
    width: 23,
    align: "center",
    className: "text-[2.9%] font-black uppercase",
    defaultColor: "#ffffff",
  },
  restaurant: {
    left: 8,
    top: 39.2,
    width: 58,
    className: "font-display text-[7.2%] font-black leading-[0.92]",
    defaultColor: "#111827",
  },
  headline: {
    left: 22,
    top: 57.3,
    width: 66,
    className: "text-[3.2%] font-black leading-tight",
    defaultColor: "#111827",
  },
  body: {
    left: 22,
    top: 63.2,
    width: 66,
    className: "text-[2.65%] font-medium leading-snug",
    defaultColor: "#334155",
  },
  cta: {
    left: 8,
    top: 83.6,
    width: 42,
    align: "center",
    className: "text-[3.35%] font-black",
    defaultColor: "#ffffff",
  },
};

function withLayers(
  overrides: Partial<Record<CampaignCreativeTextElement, Partial<CampaignCreativeTemplateLayer>>> = {},
) {
  return (Object.keys(BASE_LAYERS) as CampaignCreativeTextElement[]).reduce((acc, key) => {
    acc[key] = {
      ...BASE_LAYERS[key],
      ...overrides[key],
    };
    return acc;
  }, {} as Record<CampaignCreativeTextElement, CampaignCreativeTemplateLayer>);
}

export const CAMPAIGN_CREATIVE_TEMPLATES: CampaignCreativeTemplateDefinition[] = [
  {
    id: "classic_elegant",
    label: "01 - Classique élégant",
    description: "Template clair avec photo gourmande en tête et bloc offre lisible.",
    assetSrc: `${TEMPLATE_BASE}/1_0002_template_pub_01.png`,
    isDark: false,
    dimensions: { width: 468, height: 619 },
    layers: withLayers(),
  },
  {
    id: "modern_clean",
    label: "02 - Moderne épuré",
    description: "Photo immersive sombre, accroche haute et CTA très direct.",
    assetSrc: `${TEMPLATE_BASE}/1_0004_template_pub_02.png`,
    isDark: true,
    dimensions: { width: 458, height: 619 },
    layers: withLayers({
      restaurant: { top: 31.2, defaultColor: "#ffffff" },
      headline: { top: 56.4, defaultColor: "#ffffff" },
      body: { top: 62.8, defaultColor: "#f8fafc" },
    }),
  },
  {
    id: "warm_gourmet",
    label: "03 - Chaleureux gourmand",
    description: "Fond chaud et photo en masque arrondi pour une offre premium.",
    assetSrc: `${TEMPLATE_BASE}/1_0003_template_pub_03.png`,
    isDark: false,
    dimensions: { width: 462, height: 622 },
    layers: withLayers({
      restaurant: { top: 38.8 },
      discount: { top: 29.6, width: 25 },
    }),
  },
  {
    id: "bold_contrast",
    label: "04 - Audacieux contrasté",
    description: "Contraste noir fort avec photo diagonale et rendu flash.",
    assetSrc: `${TEMPLATE_BASE}/1_0000_template_pub_04.png`,
    isDark: true,
    dimensions: { width: 458, height: 619 },
    layers: withLayers({
      restaurant: { top: 32.2, className: "font-display text-[7.9%] font-black uppercase leading-[0.9]", defaultColor: "#ffffff" },
      headline: { top: 56.2, defaultColor: "#ffffff" },
      body: { top: 62.6, defaultColor: "#f8fafc" },
    }),
  },
  {
    id: "minimal_premium",
    label: "05 - Minimaliste premium",
    description: "Design très aéré avec encart blanc et image fondue.",
    assetSrc: `${TEMPLATE_BASE}/1_0006_template_pub_05.png`,
    isDark: false,
    dimensions: { width: 476, height: 618 },
    layers: withLayers({
      restaurant: { top: 32.5 },
      headline: { left: 15, top: 56.5, width: 58 },
      body: { left: 15, top: 63.5, width: 58 },
      cta: { left: 8.5, top: 84.2, width: 36 },
    }),
  },
  {
    id: "dynamic_color",
    label: "06 - Dynamique coloré",
    description: "Composition vive avec forme organique et bloc vert.",
    assetSrc: `${TEMPLATE_BASE}/1_0005_template_pub_06.png`,
    isDark: false,
    dimensions: { width: 476, height: 619 },
    layers: withLayers({
      badge: { left: 7, top: 5.6, width: 25 },
      discount: { left: 7.5, top: 24.4, width: 16 },
      restaurant: { left: 7.6, top: 36.5 },
      headline: { left: 12, top: 58.8, width: 66, defaultColor: "#ffffff" },
      body: { left: 12, top: 65.2, width: 66, defaultColor: "#f8fafc" },
      cta: { left: 7.5, top: 84.4, width: 36 },
    }),
  },
  {
    id: "immersive_photo",
    label: "07 - Immersif photo",
    description: "Photo plein cadre, voile sombre et texte en premier plan.",
    assetSrc: `${TEMPLATE_BASE}/1_0007_Calque-1.png`,
    isDark: true,
    dimensions: { width: 476, height: 619 },
    layers: withLayers({
      restaurant: { top: 35.2, defaultColor: "#ffffff" },
      headline: { top: 58.5, defaultColor: "#ffffff" },
      body: { top: 64.7, defaultColor: "#f8fafc" },
    }),
  },
  {
    id: "urban_street",
    label: "08 - Urbain street",
    description: "Fond brut, accents verts et encart blanc très visible.",
    assetSrc: `${TEMPLATE_BASE}/1_0001_template_pub_08.png`,
    isDark: true,
    dimensions: { width: 476, height: 612 },
    layers: withLayers({
      restaurant: { top: 31, className: "font-display text-[7.7%] font-black uppercase leading-[0.9]", defaultColor: "#ffffff" },
      headline: { left: 15, top: 59.5, width: 65 },
      body: { left: 15, top: 66, width: 65 },
      cta: { left: 7.5, top: 84.5, width: 36 },
    }),
  },
];

export const DEFAULT_CAMPAIGN_CREATIVE: CampaignCreativeConfig = {
  template: "classic_elegant",
  text: {
    badge: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#ffffff",
    },
    discount: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#ffffff",
    },
    restaurant: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#111827",
    },
    headline: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#111827",
    },
    body: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#334155",
    },
    cta: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#ffffff",
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized as T) ? normalized as T : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeHexColor(value: unknown, fallback: string) {
  const normalized = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : fallback;
}

function normalizeTextStyle(value: unknown, fallback: CampaignCreativeTextStyle): CampaignCreativeTextStyle {
  const source = isRecord(value) ? value : {};

  return {
    x: clampNumber(source.x, -120, 120, fallback.x),
    y: clampNumber(source.y, -120, 120, fallback.y),
    scale: clampNumber(source.scale, 70, 150, fallback.scale),
    rotation: clampNumber(source.rotation, -35, 35, fallback.rotation),
    color: normalizeHexColor(source.color, fallback.color),
  };
}

export function getCampaignCreativeTemplate(templateId: unknown) {
  const id = pickAllowed(
    templateId,
    CAMPAIGN_CREATIVE_TEMPLATES.map((entry) => entry.id),
    DEFAULT_CAMPAIGN_CREATIVE.template,
  );

  return CAMPAIGN_CREATIVE_TEMPLATES.find((entry) => entry.id === id) || CAMPAIGN_CREATIVE_TEMPLATES[0];
}

export function normalizeCampaignCreative(value: unknown): CampaignCreativeConfig {
  const source = isRecord(value) ? value : {};
  const textSource = isRecord(source.text) ? source.text : {};

  return {
    template: getCampaignCreativeTemplate(source.template).id,
    text: {
      badge: normalizeTextStyle(textSource.badge, DEFAULT_CAMPAIGN_CREATIVE.text.badge),
      discount: normalizeTextStyle(textSource.discount, DEFAULT_CAMPAIGN_CREATIVE.text.discount),
      restaurant: normalizeTextStyle(textSource.restaurant, DEFAULT_CAMPAIGN_CREATIVE.text.restaurant),
      headline: normalizeTextStyle(textSource.headline, DEFAULT_CAMPAIGN_CREATIVE.text.headline),
      body: normalizeTextStyle(textSource.body, DEFAULT_CAMPAIGN_CREATIVE.text.body),
      cta: normalizeTextStyle(textSource.cta, DEFAULT_CAMPAIGN_CREATIVE.text.cta),
    },
  };
}

export function getCampaignCreativeSummary(creative: CampaignCreativeConfig) {
  const normalized = normalizeCampaignCreative(creative);
  return getCampaignCreativeTemplate(normalized.template).label;
}
