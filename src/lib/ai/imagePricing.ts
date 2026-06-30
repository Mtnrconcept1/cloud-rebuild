import type { TokImageFormat } from "@/lib/ai/tokAiClient";

export type TokImageOutputResolution = "web" | "studio" | "print";
export type TokImageOutputQuality = "low" | "medium" | "high";
export type TokImageModel = "gpt-image-1.5" | "gpt-image-2";

export type TokImageOutputOption = {
  value: TokImageOutputResolution;
  label: string;
  quality: TokImageOutputQuality;
  description: string;
};

export type TokImageModelOption = {
  value: TokImageModel;
  label: string;
  description: string;
  creditMultiplier: number;
};

export const TOK_IMAGE_USD_TO_CHF_RATE = 0.81;
export const TOK_PHOTO_CREDIT_CHF = 0.009;
export const TOK_IMAGE_DEFAULT_MODEL: TokImageModel = "gpt-image-2";

export const TOK_IMAGE_MODEL_OPTIONS: TokImageModelOption[] = [
  {
    value: "gpt-image-2",
    label: "GPT Image 2",
    description: "Modèle image par défaut, aligné sur les crédits TOK x10.",
    creditMultiplier: 1,
  },
  {
    value: "gpt-image-1.5",
    label: "GPT Image 1.5 legacy",
    description: "Ancien modèle, conservé pour compatibilité jusqu'à sa dépréciation.",
    creditMultiplier: 32 / 30,
  },
];

export const TOK_IMAGE_OUTPUT_OPTIONS: TokImageOutputOption[] = [
  {
    value: "web",
    label: "Web",
    quality: "low",
    description: "Apercu, reseaux sociaux, tests rapides.",
  },
  {
    value: "studio",
    label: "Studio",
    quality: "medium",
    description: "Usage quotidien avec rendu propre.",
  },
  {
    value: "print",
    label: "Impression",
    quality: "high",
    description: "Rendu premium pour supports visibles.",
  },
];

const FORMAT_SIZES: Record<TokImageFormat, "1024x1024" | "1024x1536" | "1536x1024"> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

const OUTPUT_COST_USD: Record<TokImageOutputQuality, Record<string, number>> = {
  low: {
    "1024x1024": 0.006,
    "1024x1536": 0.005,
    "1536x1024": 0.005,
  },
  medium: {
    "1024x1024": 0.053,
    "1024x1536": 0.041,
    "1536x1024": 0.041,
  },
  high: {
    "1024x1024": 0.211,
    "1024x1536": 0.165,
    "1536x1024": 0.165,
  },
};

export function getTokImageOutputOption(value: TokImageOutputResolution | null | undefined) {
  return TOK_IMAGE_OUTPUT_OPTIONS.find((option) => option.value === value) || TOK_IMAGE_OUTPUT_OPTIONS[1]!;
}

export function getTokImageModelOption(value: TokImageModel | string | null | undefined) {
  return TOK_IMAGE_MODEL_OPTIONS.find((option) => option.value === value) || TOK_IMAGE_MODEL_OPTIONS[0]!;
}

export function getTokImageOutputPricing(
  format: TokImageFormat,
  resolution: TokImageOutputResolution | null | undefined,
  imageModel: TokImageModel | string | null | undefined = TOK_IMAGE_DEFAULT_MODEL,
) {
  const option = getTokImageOutputOption(resolution);
  const modelOption = getTokImageModelOption(imageModel);
  const size = FORMAT_SIZES[format] || FORMAT_SIZES.landscape;
  const outputCostUsd = OUTPUT_COST_USD[option.quality][size] ?? OUTPUT_COST_USD.medium["1536x1024"];
  const outputCostChf = outputCostUsd * TOK_IMAGE_USD_TO_CHF_RATE * modelOption.creditMultiplier;
  const photoCredits = Math.max(1, Math.ceil(outputCostChf / TOK_PHOTO_CREDIT_CHF));

  return {
    ...option,
    model: modelOption.value,
    modelLabel: modelOption.label,
    creditMultiplier: modelOption.creditMultiplier,
    size,
    outputCostUsd,
    outputCostChf,
    photoCredits,
  };
}
