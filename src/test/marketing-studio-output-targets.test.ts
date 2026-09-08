import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyMarketingOutputTargetToImageRequest,
  getActiveMarketingOutputTarget,
  setActiveMarketingOutputTarget,
} from "@/lib/marketing/outputSession";
import { DIGITAL_MARKETING_OUTPUT_TARGETS } from "@/lib/marketing/outputGeometry";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Marketing Studio exact output targets", () => {
  it("overrides only Marketing Studio image requests with the active final target", () => {
    const story = DIGITAL_MARKETING_OUTPUT_TARGETS.find((item) => item.id === "social-story");
    if (!story) throw new Error("story target missing");
    setActiveMarketingOutputTarget(story);

    const marketing = applyMarketingOutputTargetToImageRequest({
      restaurantId: "restaurant-demo",
      prompt: "Visuel de campagne",
      format: "landscape",
      marketingAssetMode: true,
    });
    expect(marketing.format).toBe("portrait");
    expect(marketing.prompt).toContain("1080×1920");
    expect(marketing.prompt).toContain("9:16");
    expect(marketing.prompt).toContain("recadrage cover");

    const photoPro = applyMarketingOutputTargetToImageRequest({
      restaurantId: "restaurant-demo",
      prompt: "Photo plat",
      format: "landscape",
      marketingAssetMode: false,
    });
    expect(photoPro).toMatchObject({ prompt: "Photo plat", format: "landscape" });
    expect(getActiveMarketingOutputTarget()?.id).toBe("social-story");
  });

  it("keeps provider access in the print shell and out of the legacy Studio core", () => {
    const shell = read("src/components/dashboard/TokAiMarketingStudioPrintShell.tsx");
    const controls = read("src/components/dashboard/marketing-print/MarketingOutputControls.tsx");
    const core = read("src/components/dashboard/TokAiMarketingStudio.tsx");
    const vite = read("vite.config.ts");

    expect(controls).toContain("TheTok / réseaux sociaux");
    expect(controls).toContain("Impression Cloudprinter");
    expect(controls).toContain("DIGITAL_MARKETING_OUTPUT_TARGETS");
    expect(controls).toContain("buildPrintMarketingOutputTargets");
    expect(controls).toContain("getPrintGenerationCatalog");
    expect(controls).not.toContain("getPrintCatalog(String(restaurantId))");
    expect(controls).toContain("downloadMarketingOutput");
    expect(shell).toContain("<MarketingOutputControls");
    expect(core).not.toContain("getPrintCatalog");
    expect(core).not.toContain("CloudprinterProvider");
    expect(vite).toContain('"@/lib/ai/tokAiClient"');
    expect(vite).toContain("tokAiClientMarketingOutputShell.ts");
  });
});
