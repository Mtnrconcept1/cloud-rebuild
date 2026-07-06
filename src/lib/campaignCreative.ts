export type CampaignCreativeTemplate = "tok_spotlight";
export type CampaignBannerTextPlacement = "left" | "right" | "top" | "bottom";
export type CampaignBannerSeparator = "fade" | "wave" | "curve" | "straight";

export type CampaignCreativeTextElement =
  | "badge"
  | "discount"
  | "eyebrow"
  | "restaurant"
  | "tagline"
  | "address"
  | "headline"
  | "body"
  | "sealTop"
  | "sealMain"
  | "sealBottom"
  | "cta";

export type CampaignCreativeFont = "display" | "sans" | "serif" | "rounded" | "mono";

export type CampaignCreativeTextStyle = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
  font: CampaignCreativeFont;
  style: "normal" | "bold" | "italic";
};

export type CampaignCreativeConfig = {
  template: CampaignCreativeTemplate;
  bannerTextPlacement: CampaignBannerTextPlacement;
  bannerSeparator: CampaignBannerSeparator;
  text: Record<CampaignCreativeTextElement, CampaignCreativeTextStyle>;
  copy: Record<CampaignCreativeTextElement, string>;
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

const BASE_LAYERS: Record<CampaignCreativeTextElement, CampaignCreativeTemplateLayer> = {
  badge: {
    left: 4.8,
    top: 3.8,
    width: 31,
    align: "center",
    className: "text-[2.15%] font-black uppercase tracking-[0.18em]",
    defaultColor: "#ffffff",
  },
  discount: {
    left: 4.8,
    top: 37.8,
    width: 31,
    align: "center",
    className: "text-[2.9%] font-black uppercase",
    defaultColor: "#ffffff",
  },
  eyebrow: {
    left: 6.4,
    top: 24,
    width: 56,
    className: "text-[2.15%] font-black uppercase tracking-[0.24em]",
    defaultColor: "#64748b",
  },
  restaurant: {
    left: 6.4,
    top: 52.3,
    width: 61,
    className: "font-display text-[7.2%] font-black leading-[0.92]",
    defaultColor: "#111827",
  },
  tagline: {
    left: 6.4,
    top: 63,
    width: 55,
    className: "font-serif text-[4%] italic leading-none",
    defaultColor: "#f97316",
  },
  address: {
    left: 6.4,
    top: 68,
    width: 52,
    className: "text-[2.2%] font-medium",
    defaultColor: "#64748b",
  },
  headline: {
    left: 19.2,
    top: 69.3,
    width: 66,
    className: "text-[3.2%] font-black leading-tight",
    defaultColor: "#111827",
  },
  body: {
    left: 19.2,
    top: 74.8,
    width: 66,
    className: "text-[2.65%] font-medium leading-snug",
    defaultColor: "#334155",
  },
  cta: {
    left: 7.5,
    top: 90.4,
    width: 46,
    align: "center",
    className: "text-[3.35%] font-black",
    defaultColor: "#ffffff",
  },
  sealTop: {
    left: 50,
    top: 42,
    width: 18,
    align: "center",
    className: "text-[2.25%] font-black uppercase tracking-[0.14em]",
    defaultColor: "#f97316",
  },
  sealMain: {
    left: 50,
    top: 48,
    width: 20,
    align: "center",
    className: "font-display text-[6%] font-black uppercase leading-none",
    defaultColor: "#f97316",
  },
  sealBottom: {
    left: 50,
    top: 60,
    width: 18,
    align: "center",
    className: "text-[1.75%] font-black uppercase tracking-[0.18em]",
    defaultColor: "#f97316",
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
    id: "tok_spotlight",
    label: "Modèle TOK Spotlight",
    description: "Carte, bannière et push sponsorisés avec photo forte, promo visible, encart lisible et CTA direct.",
    assetSrc: "/pub.jpg",
    isDark: false,
    dimensions: { width: 380, height: 470 },
    layers: withLayers(),
  },
];

export const DEFAULT_CAMPAIGN_CREATIVE: CampaignCreativeConfig = {
  template: "tok_spotlight",
  bannerTextPlacement: "left",
  bannerSeparator: "fade",
  text: {
    badge: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#ffffff",
      font: "sans",
      style: "bold",
    },
    discount: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#ffffff",
      font: "sans",
      style: "bold",
    },
    eyebrow: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#64748b",
      font: "sans",
      style: "bold",
    },
    restaurant: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#111827",
      font: "display",
      style: "bold",
    },
    tagline: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#f97316",
      font: "serif",
      style: "italic",
    },
    address: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#64748b",
      font: "sans",
      style: "normal",
    },
    headline: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#111827",
      font: "sans",
      style: "bold",
    },
    body: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#334155",
      font: "sans",
      style: "normal",
    },
    cta: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#ffffff",
      font: "sans",
      style: "bold",
    },
    sealTop: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#f97316",
      font: "sans",
      style: "bold",
    },
    sealMain: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#f97316",
      font: "display",
      style: "bold",
    },
    sealBottom: {
      x: 0,
      y: 0,
      scale: 100,
      rotation: 0,
      color: "#f97316",
      font: "sans",
      style: "bold",
    },
  },
  copy: {
    badge: "",
    discount: "",
    eyebrow: "",
    restaurant: "",
    tagline: "Savourez l'instant",
    address: "",
    headline: "",
    body: "",
    cta: "",
    sealTop: "Offres",
    sealMain: "Flash",
    sealBottom: "Quantités limitées",
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
  const font = pickAllowed(source.font, ["display", "sans", "serif", "rounded", "mono"] as const, fallback.font);
  const style = pickAllowed(source.style, ["normal", "bold", "italic"] as const, fallback.style);

  return {
    x: clampNumber(source.x, -120, 120, fallback.x),
    y: clampNumber(source.y, -120, 120, fallback.y),
    scale: clampNumber(source.scale, 70, 150, fallback.scale),
    rotation: clampNumber(source.rotation, -35, 35, fallback.rotation),
    color: normalizeHexColor(source.color, fallback.color),
    font,
    style,
  };
}

function normalizeCopyText(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : fallback;
  return normalized.slice(0, 90);
}

function normalizeCreativeCopy(raw: unknown) {
  const source = isRecord(raw) ? raw : {};

  return (Object.keys(DEFAULT_CAMPAIGN_CREATIVE.copy) as CampaignCreativeTextElement[]).reduce((acc, key) => {
    acc[key] = normalizeCopyText(source[key], DEFAULT_CAMPAIGN_CREATIVE.copy[key]);
    return acc;
  }, {} as Record<CampaignCreativeTextElement, string>);
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
    bannerTextPlacement: pickAllowed(source.bannerTextPlacement, ["left", "right", "top", "bottom"] as const, DEFAULT_CAMPAIGN_CREATIVE.bannerTextPlacement),
    bannerSeparator: pickAllowed(source.bannerSeparator, ["fade", "wave", "curve", "straight"] as const, DEFAULT_CAMPAIGN_CREATIVE.bannerSeparator),
    text: {
      badge: normalizeTextStyle(textSource.badge, DEFAULT_CAMPAIGN_CREATIVE.text.badge),
      discount: normalizeTextStyle(textSource.discount, DEFAULT_CAMPAIGN_CREATIVE.text.discount),
      eyebrow: normalizeTextStyle(textSource.eyebrow, DEFAULT_CAMPAIGN_CREATIVE.text.eyebrow),
      restaurant: normalizeTextStyle(textSource.restaurant, DEFAULT_CAMPAIGN_CREATIVE.text.restaurant),
      tagline: normalizeTextStyle(textSource.tagline, DEFAULT_CAMPAIGN_CREATIVE.text.tagline),
      address: normalizeTextStyle(textSource.address, DEFAULT_CAMPAIGN_CREATIVE.text.address),
      headline: normalizeTextStyle(textSource.headline, DEFAULT_CAMPAIGN_CREATIVE.text.headline),
      body: normalizeTextStyle(textSource.body, DEFAULT_CAMPAIGN_CREATIVE.text.body),
      sealTop: normalizeTextStyle(textSource.sealTop, DEFAULT_CAMPAIGN_CREATIVE.text.sealTop),
      sealMain: normalizeTextStyle(textSource.sealMain, DEFAULT_CAMPAIGN_CREATIVE.text.sealMain),
      sealBottom: normalizeTextStyle(textSource.sealBottom, DEFAULT_CAMPAIGN_CREATIVE.text.sealBottom),
      cta: normalizeTextStyle(textSource.cta, DEFAULT_CAMPAIGN_CREATIVE.text.cta),
    },
    copy: normalizeCreativeCopy(source.copy),
  };
}

export function getCampaignCreativeSummary(creative: CampaignCreativeConfig) {
  const normalized = normalizeCampaignCreative(creative);
  return getCampaignCreativeTemplate(normalized.template).label;
}
