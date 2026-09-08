import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyMarketingOutputTargetToImageRequest,
  getMarketingOutputSessionSnapshot,
  setMarketingOutputSession,
} from "@/lib/marketing/outputSession";
import { DIGITAL_MARKETING_OUTPUT_TARGETS, type MarketingOutputTarget } from "@/lib/marketing/outputGeometry";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const printTarget: MarketingOutputTarget = {
  id: "print:flyer-a6",
  destination: "print",
  label: "Flyer A6",
  group: "Impression Cloudprinter",
  widthPx: 1311,
  heightPx: 1819,
  ratioLabel: "105:148",
  nativeFormat: "portrait",
  nativeWidthPx: 1024,
  nativeHeightPx: 1536,
  targetDpi: 300,
  print: {
    productId: "flyer-a6",
    providerProductId: "provider-a6",
    providerReference: "card_flat_105x148_mm_single_fc_tnr",
    marketingToolId: "flyer",
    category: "flyer",
    widthMm: 105,
    heightMm: 148,
    bleedMm: 3,
    safeMarginMm: 5,
    foldedWidthMm: null,
    foldedHeightMm: null,
    printableSides: 1,
    minimumQuantity: 1,
    quantityStep: 10,
  },
};

describe("Marketing Studio Cloudprinter destination", () => {
  it("injects print-only bleed and safety rules without contaminating social prompts", () => {
    setMarketingOutputSession({ destination: "print", targets: [printTarget], target: printTarget });
    const printRequest = applyMarketingOutputTargetToImageRequest({
      restaurantId: "restaurant-demo",
      prompt: "Promotion du brunch",
      format: "landscape",
      marketingAssetMode: true,
    });

    expect(printRequest.prompt).toContain("MARGE DE SÉCURITÉ IMPRESSION");
    expect(printRequest.prompt).toContain("5 mm");
    expect(printRequest.prompt).toContain("AUCUN texte");
    expect(printRequest.prompt).toContain("fond perdu");
    expect(printRequest.prompt).toContain("fonds, textures, motifs ou images de fond");

    const story = DIGITAL_MARKETING_OUTPUT_TARGETS.find((target) => target.id === "social-story");
    if (!story) throw new Error("story target missing");
    setMarketingOutputSession({ destination: "digital", targets: [story], target: story });
    const digitalRequest = applyMarketingOutputTargetToImageRequest({
      restaurantId: "restaurant-demo",
      prompt: "Story du brunch",
      format: "portrait",
      marketingAssetMode: true,
    });
    expect(digitalRequest.prompt).not.toContain("MARGE DE SÉCURITÉ IMPRESSION");
    expect(digitalRequest.prompt).not.toContain("AUCUN texte");
  });

  it("publishes the provider-backed target list so the Studio can replace generic print supports", () => {
    setMarketingOutputSession({ destination: "print", targets: [printTarget], target: printTarget });
    expect(getMarketingOutputSessionSnapshot()).toMatchObject({
      destination: "print",
      target: { id: "print:flyer-a6" },
      targets: [{ id: "print:flyer-a6" }],
    });
  });

  it("renders mapped Cloudprinter products through the shell bridge and keeps provider access out of the legacy core", () => {
    const studio = read("src/components/dashboard/TokAiMarketingStudio.tsx");
    const shell = read("src/components/dashboard/TokAiMarketingStudioPrintShell.tsx");
    const bridge = read("src/components/dashboard/marketing-print/MarketingStudioPrintCatalogBridge.tsx");
    const composer = read("src/components/dashboard/marketing-print/PrintComposerDialog.tsx");

    expect(bridge).toContain("subscribeMarketingOutputSession");
    expect(bridge).toContain('outputSession.destination === "print"');
    expect(bridge).toContain("printSupportTargets");
    expect(bridge).toContain("printSupportTargets.map");
    expect(bridge).toContain('button.style.display = "none"');
    expect(bridge).toContain("marketing-format");
    expect(bridge).toContain("marketing-orientation");
    expect(bridge).toContain("Imprimer une création");
    expect(bridge).toContain("createPortal");
    expect(shell).toContain("MarketingStudioPrintCatalogBridge");
    expect(shell).toContain("printComposerOpen");
    expect(shell).toContain("showTrigger={false}");
    expect(shell).not.toContain("Du visuel à l’imprimé, sans quitter TheTok");
    expect(composer).toContain("showTrigger");
    expect(studio).not.toContain("getPrintGenerationCatalog");
    expect(studio).not.toContain("CloudprinterProvider");
  });
});
