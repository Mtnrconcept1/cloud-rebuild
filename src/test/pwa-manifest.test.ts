import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const publicRoot = join(root, "public");
const MOJIBAKE_PATTERN = /[\u00c2\u00c3\ufffd]|\u00e2[\u0080-\u009d]|\u00f0[\u0080-\u017f]/;

type ManifestImage = {
  src: string;
  sizes?: string;
  type?: string;
};

type PwaManifest = {
  name: string;
  description?: string;
  icons?: ManifestImage[];
  screenshots?: ManifestImage[];
  shortcuts?: Array<{
    name: string;
    icons?: ManifestImage[];
  }>;
};

function publicFileFromUrl(url: string) {
  return join(publicRoot, url.replace(/^\//, ""));
}

function getPngSize(filePath: string) {
  const buffer = readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;

  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

function extractIndexAssetUrls() {
  const html = readFileSync(join(root, "index.html"), "utf8");
  return [...html.matchAll(/\b(?:href|src)="(\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((url) => !url.startsWith("//"));
}

describe("PWA manifest assets", () => {
  it("keeps install metadata readable and asset references valid", () => {
    const manifestText = readFileSync(join(publicRoot, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestText) as PwaManifest;

    expect(MOJIBAKE_PATTERN.test(manifestText)).toBe(false);
    expect(manifest.name).toContain("Réservez");

    const indexMissingAssets = extractIndexAssetUrls()
      .filter((url) => url !== "/src/main.tsx")
      .filter((url) => !existsSync(publicFileFromUrl(url)));

    expect(indexMissingAssets).toEqual([]);

    const manifestImages = [
      ...(manifest.icons ?? []),
      ...(manifest.screenshots ?? []),
      ...(manifest.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? []),
    ];

    const invalidImages = manifestImages.flatMap((image) => {
      const filePath = publicFileFromUrl(image.src);
      if (!existsSync(filePath)) return [`${image.src}: missing`];

      if (image.sizes && image.type === "image/png" && extname(filePath).toLowerCase() === ".png") {
        const actualSize = getPngSize(filePath);
        if (actualSize !== image.sizes) return [`${image.src}: expected ${image.sizes}, got ${actualSize}`];
      }

      return [];
    });

    expect(invalidImages).toEqual([]);
  });
});
