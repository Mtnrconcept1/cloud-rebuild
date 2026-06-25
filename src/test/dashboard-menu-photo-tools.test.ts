import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("dashboard menu photo tools", () => {
  const dashboardMenu = read("src/pages/dashboard/DashboardMenu.tsx");
  const imageUpload = read("src/components/ImageUpload.tsx");

  it("hides manual URL input by default and keeps it hidden in the dish modal", () => {
    expect(imageUpload).toContain("showUrlInput = false");
    expect(dashboardMenu).toContain("showUrlInput={false}");
    expect(dashboardMenu).not.toContain("placeholder=\"Ou collez l'URL HTTPS");
  });

  it("lets restaurateurs select dish images from the restaurant gallery", () => {
    expect(dashboardMenu).toContain('queryKey: ["restaurant-media-picker", restaurant?.id]');
    expect(dashboardMenu).toContain('from("restaurant_media")');
    expect(dashboardMenu).toContain('.in("media_type", ["photo", "photo_ai_tok"])');
    expect(dashboardMenu).toContain(".limit(24)");
    expect(dashboardMenu).toContain("selectDishImage(item.media_url)");
  });

  it("generates a menu visual from the modal photo studio and applies it to the dish form", () => {
    expect(dashboardMenu).toContain("startTokImageCreationJob");
    expect(dashboardMenu).toContain('tool: "menu_photo"');
    expect(dashboardMenu).toContain("requestAiCreationNotificationPermission");
    expect(dashboardMenu).toContain('assetType: "menu_visual"');
    expect(dashboardMenu).toContain('format: "square"');
    expect(dashboardMenu).toContain("sourceImageUrl: form.image_url.trim() || null");
    expect(dashboardMenu).toContain("const generatedImageUrl = result.gallery_image_url || result.generated_image_url");
    expect(dashboardMenu).toContain("setForm((previous) => ({ ...previous, image_url: generatedImageUrl }))");
  });
});
