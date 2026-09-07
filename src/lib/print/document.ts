export type PrintImageAsset = {
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  widthPx: number;
  heightPx: number;
};

export type PrintTextElement = {
  id: string;
  kind: "title" | "subtitle" | "price" | "date" | "address" | "cta" | "body";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: "left" | "center" | "right";
  fontSizeMm?: number;
  weight?: "normal" | "bold";
  color?: string;
};

export type PrintQrElement = {
  value: string;
  x: number;
  y: number;
  size: number;
};

export type MarketingPrintDocument = {
  version: 1;
  title: string;
  sourceGenerationId?: string | null;
  background: PrintImageAsset;
  logo?: PrintImageAsset | null;
  texts: PrintTextElement[];
  qr?: PrintQrElement | null;
  layout: {
    orientation: "portrait" | "landscape" | "square";
    backgroundPosition?: "cover" | "contain";
    overlayOpacity?: number;
  };
};

export type PrintProductSpec = {
  productId: string;
  providerProductId: string;
  providerReference: string;
  displayName: string;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMarginMm: number;
  printableSides: number;
  orientation: string | null;
  printTechnology: string | null;
  minimumQuantity: number;
  quantityStep: number;
  options: Array<Record<string, unknown>>;
};

export type PrintPreflightIssue = {
  code: string;
  message: string;
  field?: string;
};

export type PrintPreflightResult = {
  blocking: PrintPreflightIssue[];
  warnings: PrintPreflightIssue[];
  effectiveResolutionDpi: { x: number; y: number };
  ready: boolean;
};

export function createMarketingPrintDocument(input: {
  title: string;
  background: PrintImageAsset;
  sourceGenerationId?: string | null;
  logo?: PrintImageAsset | null;
  texts?: PrintTextElement[];
  qr?: PrintQrElement | null;
  orientation?: "portrait" | "landscape" | "square";
}): MarketingPrintDocument {
  return {
    version: 1,
    title: input.title.trim() || "Création Marketing Studio",
    sourceGenerationId: input.sourceGenerationId || null,
    background: input.background,
    logo: input.logo || null,
    texts: input.texts || [],
    qr: input.qr || null,
    layout: {
      orientation: input.orientation || "portrait",
      backgroundPosition: "cover",
      overlayOpacity: 0,
    },
  };
}
