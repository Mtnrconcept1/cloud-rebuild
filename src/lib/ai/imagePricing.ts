import type { TokImageFormat } from "@/lib/ai/tokAiClient";

export type TokImageOutputResolution = "web" | "studio" | "print";
export type TokImageOutputQuality = "medium";
export type TokImageModel = "gpt-image-2";

export type TokImageOutputOption = {
  value: TokImageOutputResolution;
  label: string;
  quality: TokImageOutputQuality;
  description: string;
};

export const TOK_PHOTO_CREDIT_CHF = 0.009;
export const TOK_IMAGE_BASE_COST_CHF = 0.05;
export const TOK_IMAGE_DEFAULT_MODEL: TokImageModel = "gpt-image-2";

export const TOK_IMAGE_OUTPUT_OPTIONS: TokImageOutputOption[] = [
  {
    value: "studio",
    label: "Studio",
    quality: "medium",
    description: "GPT Image 2 medium, configuration unique TOK.",
  },
];

const FORMAT_SIZES: Record<TokImageFormat, "1024x1024" | "1024x1536" | "1536x1024"> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

export function getTokImageOutputOption(value: TokImageOutputResolution | null | undefined) {
  return TOK_IMAGE_OUTPUT_OPTIONS.find((option) => option.value === value) || TOK_IMAGE_OUTPUT_OPTIONS[0]!;
}

export function getTokImageOutputPricing(
  format: TokImageFormat,
  resolution: TokImageOutputResolution | null | undefined,
  _imageModel: TokImageModel | string | null | undefined = TOK_IMAGE_DEFAULT_MODEL,
) {
  const option = getTokImageOutputOption(resolution);
  const size = FORMAT_SIZES[format] || FORMAT_SIZES.landscape;
  const outputCostUsd = Number((TOK_IMAGE_BASE_COST_CHF / 0.81).toFixed(6));
  const outputCostChf = TOK_IMAGE_BASE_COST_CHF;
  const photoCredits = Math.max(1, Math.ceil(outputCostChf / TOK_PHOTO_CREDIT_CHF));

  return {
    ...option,
    model: TOK_IMAGE_DEFAULT_MODEL,
    modelLabel: "GPT Image 2 medium",
    creditMultiplier: 1,
    size,
    outputCostUsd,
    outputCostChf,
    photoCredits,
  };
}
