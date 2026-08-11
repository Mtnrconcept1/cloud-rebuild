import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const iconDir = resolve(
  process.cwd(),
  "ios/App/App/Assets.xcassets/AppIcon.appiconset",
);

function pngHeader(fileName: string) {
  const filePath = resolve(iconDir, fileName);
  const buffer = readFileSync(filePath);

  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer.readUInt8(25),
  };
}

describe("iOS TOK app icon", () => {
  it("defines explicit Any, Dark and Tinted 1024px variants", () => {
    const contents = JSON.parse(
      readFileSync(resolve(iconDir, "Contents.json"), "utf8"),
    ) as {
      images: Array<{
        filename?: string;
        size?: string;
        appearances?: Array<{ appearance?: string; value?: string }>;
      }>;
    };

    const byFile = new Map(
      contents.images.map((image) => [image.filename, image]),
    );

    expect(byFile.get("AppIcon-512@2x.png")?.size).toBe("1024x1024");
    expect(
      byFile.get("AppIcon-512@2x-dark.png")?.appearances,
    ).toEqual([{ appearance: "luminosity", value: "dark" }]);
    expect(
      byFile.get("AppIcon-512@2x-tinted.png")?.appearances,
    ).toEqual([{ appearance: "luminosity", value: "tinted" }]);
  });

  it("keeps the default App Store icon opaque and all variants 1024x1024", () => {
    const defaults = pngHeader("AppIcon-512@2x.png");
    const dark = pngHeader("AppIcon-512@2x-dark.png");
    const tinted = pngHeader("AppIcon-512@2x-tinted.png");

    expect(defaults).toEqual({ width: 1024, height: 1024, colorType: 2 });
    expect(dark.width).toBe(1024);
    expect(dark.height).toBe(1024);
    expect(tinted.width).toBe(1024);
    expect(tinted.height).toBe(1024);
  });

  it("tracks all icon files referenced by the asset catalog", () => {
    for (const fileName of [
      "AppIcon-512@2x.png",
      "AppIcon-512@2x-dark.png",
      "AppIcon-512@2x-tinted.png",
    ]) {
      expect(existsSync(resolve(iconDir, fileName))).toBe(true);
    }
  });
});
