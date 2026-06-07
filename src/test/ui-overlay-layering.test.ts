import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function extractZIndexes(source: string) {
  const bracketed = Array.from(source.matchAll(/z-\[(\d+)\]/g), ([, value]) => Number(value));
  const numeric = Array.from(source.matchAll(/z-(\d+)/g), ([, value]) => Number(value));
  return [...bracketed, ...numeric];
}

function maxZIndex(source: string) {
  const zIndexes = extractZIndexes(source);
  expect(zIndexes.length).toBeGreaterThan(0);
  return Math.max(...zIndexes);
}

describe("ui overlay layering", () => {
  it("keeps portaled floating controls above dialog overlays", () => {
    const dialogLayer = maxZIndex(readProjectFile("src/components/ui/dialog.tsx"));

    for (const componentPath of [
      "src/components/ui/select.tsx",
      "src/components/ui/popover.tsx",
      "src/components/ui/dropdown-menu.tsx",
    ]) {
      const floatingLayer = maxZIndex(readProjectFile(componentPath));

      expect(floatingLayer, `${componentPath} should render above dialogs`).toBeGreaterThan(dialogLayer);
    }
  });

  it("passes an explicit z-index to Radix select content so the Popper wrapper inherits the dialog-safe layer", () => {
    const selectSource = readProjectFile("src/components/ui/select.tsx");

    expect(selectSource).toContain("SELECT_CONTENT_Z_INDEX");
    expect(selectSource).toMatch(/style=\{\{\s*zIndex:\s*SELECT_CONTENT_Z_INDEX,/s);
  });
});
