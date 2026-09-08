import type { TokImageGenerationRequest } from "../ai/tokAiClient";
import {
  DIGITAL_MARKETING_OUTPUT_TARGETS,
  MAX_PRINT_UPSCALE_FACTOR,
  calculateMarketingOutputPlan,
  type MarketingOutputTarget,
} from "@/lib/marketing/outputGeometry";

const DEFAULT_OUTPUT_TARGET_ID = "thetok-hero";
let activeOutputTarget: MarketingOutputTarget | null =
  DIGITAL_MARKETING_OUTPUT_TARGETS.find((target) => target.id === DEFAULT_OUTPUT_TARGET_ID)
  || DIGITAL_MARKETING_OUTPUT_TARGETS[0]
  || null;

export function setActiveMarketingOutputTarget(target: MarketingOutputTarget | null) {
  activeOutputTarget = target;
}

export function getActiveMarketingOutputTarget() {
  return activeOutputTarget;
}

export function applyMarketingOutputTargetToImageRequest<T extends TokImageGenerationRequest>(
  request: T,
): T {
  if (request.marketingAssetMode !== true || !activeOutputTarget) return request;

  const target = activeOutputTarget;
  const expectedPlan = calculateMarketingOutputPlan(
    target.nativeWidthPx,
    target.nativeHeightPx,
    target,
  );
  if (target.destination === "print" && expectedPlan.upscaleFactor > MAX_PRINT_UPSCALE_FACTOR) {
    throw new Error("MARKETING_OUTPUT_UPSCALE_BLOCKED");
  }

  const printInstruction = target.print
    ? ` Support imprimé à plat ${target.print.widthMm}×${target.print.heightMm} mm, fond perdu ${target.print.bleedMm} mm, cible ${target.targetDpi} DPI.`
    : "";
  const outputInstruction = [
    "CIBLE FINALE PRIORITAIRE POUR LA COMPOSITION :",
    `${target.label}, ratio ${target.ratioLabel}, fichier final ${target.widthPx}×${target.heightPx} px.`,
    printInstruction.trim(),
    "Le modèle produit son bucket natif ; composer le sujet, le texte et les éléments critiques pour supporter un recadrage cover centré vers ce ratio final, sans élément essentiel au bord.",
  ].filter(Boolean).join(" ");

  return {
    ...request,
    format: target.nativeFormat,
    prompt: `${request.prompt.trim()}\n\n${outputInstruction}`,
  };
}
