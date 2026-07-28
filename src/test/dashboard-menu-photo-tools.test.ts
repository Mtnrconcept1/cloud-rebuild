import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("dashboard menu photo tools", () => {
  const dashboardMenu = read("src/pages/dashboard/DashboardMenu.tsx");
  const imageUpload = read("src/components/ImageUpload.tsx");
  const menuImageImport = read("supabase/functions/menu-image-import/index.ts");

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

  it("extracts a photographed menu into an editable preview before batch creation", () => {
    expect(dashboardMenu).toContain("Importer une photo du menu");
    expect(dashboardMenu).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(dashboardMenu).toContain('invokeSupabaseFunction<MenuImportResponse>("menu-image-import"');
    expect(dashboardMenu).toContain("optimizeImageUpload(file)");
    expect(dashboardMenu).toContain("updateImportedMenuItem");
    expect(dashboardMenu).toContain('from("menu_items").insert(selectedItems)');
    expect(dashboardMenu).toContain("Les plats ne sont créés qu'après votre validation.");

    // Unreadable prices (0) must never reach the menu_items price > 0 check:
    // they stay visible but deselected until the restaurateur fixes them.
    expect(dashboardMenu).toContain("selected: price > 0");
    expect(dashboardMenu).toContain("Math.round(item.price * 100) < 1");
    expect(dashboardMenu).toContain("getMenuImportErrorMessage");
    expect(dashboardMenu).toContain("getMenuItemSaveErrorMessage");

    expect(menuImageImport).toContain('const FUNCTION_NAME = "menu-image-import"');
    expect(menuImageImport).toContain("requireRestaurantAccess(actor, restaurantId)");
    expect(menuImageImport).toContain('type: "input_image"');
    expect(menuImageImport).toContain('name: "restaurant_menu_extraction"');
    expect(menuImageImport).toContain("Fusionne les doublons");
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
