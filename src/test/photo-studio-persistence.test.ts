import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TOK photo studio persistence", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/dashboard/TokAiPhotoStudioV2.tsx"), "utf8");
  const dashboardPhotos = readFileSync(resolve(process.cwd(), "src/pages/dashboard/DashboardPhotos.tsx"), "utf8");
  const imageUpload = readFileSync(resolve(process.cwd(), "src/components/ImageUpload.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

  it("persists the generated result across component remounts and tab focus changes", () => {
    expect(source).toContain("useSessionStorageState");
    expect(source).toContain("tok-ai-photo-studio-v2:");
    expect(source).toContain("result: TokImageGenerationResult | null");
    expect(source).toContain("updateDraft({ result: data })");
    expect(app).toContain("refetchOnWindowFocus: false");
    expect(app).toContain("refetchOnReconnect: false");
    expect(app).toContain("focusManager.setEventListener");
  });

  it("keeps technical source URLs hidden in the simplified studio", () => {
    expect(source).toContain("showUrlInput={false}");
    expect(source).not.toContain("storage_path");
    expect(source).not.toContain("reference_folder");
    expect(source).not.toContain("assetId");
  });

  it("keeps the restaurateur-facing photo studio copy readable in French", () => {
    for (const file of [source, dashboardPhotos, imageUpload]) {
      expect(file).not.toMatch(/Ã|Â|â€™|â€œ|â€|�/);
    }

    expect(source).toContain("Retouche TOK premium: garder le plat, améliorer la composition");
    expect(source).toContain("Visuel TOK prêt");
    expect(source).toContain("Après TOK");
    expect(dashboardPhotos).toContain("Préparez la couverture");
    expect(imageUpload).toContain("Vous devez sélectionner une image.");
  });

  it("adds generated images to the gallery through a stable public gallery URL", () => {
    expect(source).toContain("result.gallery_image_url");
    expect(source).toContain("media_url: result.gallery_image_url");
    expect(source).not.toContain("media_url: result.generated_image_url");
  });

  it("keeps dashboard photo uploads focused on files instead of manual image URLs", () => {
    expect(dashboardPhotos).toContain("showUrlInput={false}");
  });

  it("shows a wine glass filling animation while a TOK photo is being generated", () => {
    expect(source).toContain("WineGlassGenerationLoader");
    expect(source).toContain("tokWineFill");
    expect(source).toContain("tokWineWave");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("Verre de vin en cours de remplissage");
    expect(source).toContain("<WineGlassGenerationLoader />");
    expect(source).toContain("loading ? (");
  });
});
