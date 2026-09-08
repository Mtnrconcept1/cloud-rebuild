import type { TokImageGenerationRequest } from "../ai/tokAiClient";
import {
  DIGITAL_MARKETING_OUTPUT_TARGETS,
  MAX_PRINT_UPSCALE_FACTOR,
  calculateMarketingOutputPlan,
  type MarketingOutputDestination,
  type MarketingOutputTarget,
} from "@/lib/marketing/outputGeometry";

const DEFAULT_OUTPUT_TARGET_ID = "thetok-hero";
const defaultTarget = DIGITAL_MARKETING_OUTPUT_TARGETS.find((target) => target.id === DEFAULT_OUTPUT_TARGET_ID)
  || DIGITAL_MARKETING_OUTPUT_TARGETS[0]
  || null;

export type MarketingOutputSessionSnapshot = {
  destination: MarketingOutputDestination;
  target: MarketingOutputTarget | null;
  targets: MarketingOutputTarget[];
};

let outputSessionSnapshot: MarketingOutputSessionSnapshot = {
  destination: "digital",
  target: defaultTarget,
  targets: DIGITAL_MARKETING_OUTPUT_TARGETS,
};
const listeners = new Set<() => void>();

function sameTargetList(left: MarketingOutputTarget[], right: MarketingOutputTarget[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((target, index) => target.id === right[index]?.id);
}

export function setMarketingOutputSession(next: MarketingOutputSessionSnapshot) {
  const normalizedTarget = next.target && next.targets.some((target) => target.id === next.target?.id)
    ? next.target
    : null;
  const unchanged = outputSessionSnapshot.destination === next.destination
    && outputSessionSnapshot.target?.id === normalizedTarget?.id
    && sameTargetList(outputSessionSnapshot.targets, next.targets);
  if (unchanged) return;
  outputSessionSnapshot = {
    destination: next.destination,
    target: normalizedTarget,
    targets: next.targets,
  };
  for (const listener of listeners) listener();
}

export function getMarketingOutputSessionSnapshot() {
  return outputSessionSnapshot;
}

export function subscribeMarketingOutputSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setActiveMarketingOutputTarget(target: MarketingOutputTarget | null) {
  setMarketingOutputSession({
    ...outputSessionSnapshot,
    destination: target?.destination || outputSessionSnapshot.destination,
    target,
  });
}

export function getActiveMarketingOutputTarget() {
  return outputSessionSnapshot.target;
}

export function applyMarketingOutputTargetToImageRequest<T extends TokImageGenerationRequest>(
  request: T,
): T {
  if (request.marketingAssetMode !== true) return request;
  const target = outputSessionSnapshot.target;
  if (!target) throw new Error("MARKETING_OUTPUT_TARGET_REQUIRED");

  const expectedPlan = calculateMarketingOutputPlan(
    target.nativeWidthPx,
    target.nativeHeightPx,
    target,
  );
  if (target.destination === "print" && expectedPlan.upscaleFactor > MAX_PRINT_UPSCALE_FACTOR) {
    throw new Error("MARKETING_OUTPUT_UPSCALE_BLOCKED");
  }

  const printInstruction = target.destination === "print" && target.print
    ? [
      `Support imprimé à plat ${target.print.widthMm}×${target.print.heightMm} mm, fond perdu ${target.print.bleedMm} mm, cible ${target.targetDpi} DPI.`,
      `MARGE DE SÉCURITÉ IMPRESSION : conserver AUCUN texte, logo, prix, QR code, CTA, visage ou élément essentiel dans les ${target.print.safeMarginMm} mm proches des bords du format fini.`,
      `Le fond perdu doit rester visuellement continu : seuls les fonds, textures, motifs ou images de fond pouvant être tronqués à l’impression sans gravité peuvent aller jusqu’aux bords et déborder dans le fond perdu de ${target.print.bleedMm} mm.`,
      "Ne jamais placer de texte ni d’information importante dans le fond perdu ; garder une respiration nette autour de tous les contenus utiles.",
    ].join(" ")
    : "";
  const outputInstruction = [
    "CIBLE FINALE PRIORITAIRE POUR LA COMPOSITION :",
    `${target.label}, ratio ${target.ratioLabel}, fichier final ${target.widthPx}×${target.heightPx} px.`,
    printInstruction,
    "Le modèle produit son bucket natif ; composer le sujet, le texte et les éléments critiques pour supporter un recadrage cover centré vers ce ratio final, sans élément essentiel au bord.",
  ].filter(Boolean).join(" ");

  return {
    ...request,
    format: target.nativeFormat,
    prompt: `${request.prompt.trim()}\n\n${outputInstruction}`,
  };
}
