// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";

const root = process.cwd();
const menuSource = readFileSync(resolve(root, "src/pages/dashboard/DashboardMenu.tsx"), "utf8");

function functionSlice(start: string, end: string) {
  return menuSource.slice(menuSource.indexOf(start), menuSource.indexOf(end, menuSource.indexOf(start)));
}

describe("commercial demo menu mutations", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("persists records per demo session without sharing them", () => {
    writeCommercialDemoToolState("session-a", "menu-items", [{ id: "dish-a" }]);

    expect(readCommercialDemoToolState("session-a", "menu-items", [])).toEqual([{ id: "dish-a" }]);
    expect(readCommercialDemoToolState("session-b", "menu-items", [])).toEqual([]);
  });

  it("hydrates menu and gallery data locally before any production read", () => {
    const menuQuery = functionSlice("const { data: items }", "const { data: galleryItems");
    const galleryQuery = functionSlice("const { data: galleryItems", "const openNew");

    expect(menuQuery).toContain("readCommercialDemoMenu()");
    expect(menuQuery.indexOf("readCommercialDemoMenu()"))
      .toBeLessThan(menuQuery.indexOf('.from("menu_items")'));
    expect(galleryQuery).toContain('"photos-gallery"');
    expect(galleryQuery.indexOf('"photos-gallery"'))
      .toBeLessThan(galleryQuery.indexOf('.from("restaurant_media")'));
  });

  it("returns from every menu mutation before reaching Supabase", () => {
    const save = functionSlice("const handleSave", "const handleDelete");
    const remove = functionSlice("const handleDelete", "const toggleAvailability");
    const toggle = functionSlice("const toggleAvailability", "const selectDishImage");
    const importMenu = functionSlice("const saveImportedMenu", "return (");

    for (const source of [save, remove, toggle]) {
      expect(source).toContain("persistCommercialDemoMenu");
      expect(source.indexOf("persistCommercialDemoMenu"))
        .toBeLessThan(source.indexOf("supabase"));
    }
    expect(importMenu).toContain("persistCommercialDemoMenu");
    expect(importMenu.indexOf("persistCommercialDemoMenu"))
      .toBeLessThan(importMenu.indexOf('supabase.from("menu_items").insert'));
  });

  it("analyzes menu photos through the authenticated commercial demo OpenAI gateway", () => {
    const analyze = functionSlice("const analyzeMenuPhotos", "const updateImportedMenuItem");

    expect(analyze).toContain("askCommercialDemoAi");
    expect(analyze).toContain("referenceImages: images");
    expect(analyze).toContain("parseCommercialDemoAiJson");
    expect(analyze.indexOf("askCommercialDemoAi"))
      .toBeLessThan(analyze.indexOf('supabase.functions.invoke<MenuImportResponse>("menu-image-import"'));
  });

  it("generates menu visuals through the dedicated zero-cost demo RPC client", () => {
    const generate = functionSlice("const generateMenuPhoto", "const openMenuImport");

    expect(generate).toContain("generateCommercialDemoVisual");
    expect(generate).toContain('surface: "restaurant"');
    expect(generate.indexOf("generateCommercialDemoVisual"))
      .toBeLessThan(generate.indexOf("startTokImageCreationJob"));
  });
});
