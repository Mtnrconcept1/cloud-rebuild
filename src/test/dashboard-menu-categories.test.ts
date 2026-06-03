import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("dashboard menu category presets", () => {
  it("offers predefined food and drink categories while preserving custom labels", () => {
    const source = readProjectFile("src/pages/dashboard/DashboardMenu.tsx");

    for (const category of [
      "Entrées",
      "Plats",
      "Desserts",
      "Boissons soft",
      "Vins rouges",
      "Vins blancs",
      "Bières",
      "Apéritifs",
      "Cocktails",
      "Anti-gaspi",
      "Ventes flash",
      "Table du chef",
    ]) {
      expect(source).toContain(category);
    }

    expect(source).toContain("MENU_CATEGORY_PRESETS");
    expect(source).toContain("Categorie personnalisee");
    expect(source).toContain("isPresetCategory");
    expect(source).toContain('setCategoryMode(category && !isPresetCategory(category) ? "custom" : "preset")');
  });
});
