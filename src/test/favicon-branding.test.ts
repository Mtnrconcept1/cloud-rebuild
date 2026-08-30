import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, "public/manifest.json"), "utf8"),
) as {
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  shortcuts: Array<{ icons?: Array<{ src: string; sizes: string; type: string }> }>;
};

const pngDimensions = (relativePath: string) => {
  const bytes = readFileSync(resolve(repoRoot, relativePath));
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
};

describe("TOK favicon branding", () => {
  it("uses dedicated square favicon assets in the public document head", () => {
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />',
    );
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png" />',
    );
    expect(indexHtml).not.toMatch(/rel="icon"[^>]+logotok\.png/);
    expect(indexHtml).not.toMatch(/rel="apple-touch-icon"[^>]+logotok\.png/);
  });

  it("keeps every declared PNG icon square at its advertised size", () => {
    for (const [path, expected] of [
      ["public/favicon-48x48.png", 48],
      ["public/favicon-180x180.png", 180],
      ["public/favicon-192x192.png", 192],
      ["public/favicon-512x512.png", 512],
    ] as const) {
      expect(pngDimensions(path)).toEqual({ width: expected, height: expected });
    }
  });

  it("uses the square TOK badge in the web app manifest and shortcuts", () => {
    expect(manifest.icons).toEqual([
      {
        src: "/favicon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ]);

    expect(
      manifest.shortcuts.every((shortcut) =>
        shortcut.icons?.every((icon) =>
          icon.src === "/favicon-192x192.png" &&
          icon.sizes === "192x192" &&
          icon.type === "image/png",
        ),
      ),
    ).toBe(true);
  });
});
