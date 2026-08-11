import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const iconDir = resolve(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
const defaultIcon = "AppIcon-512@2x.png";

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
  it("defines one universal 1024px App Store icon", () => {
    const contents = JSON.parse(
      readFileSync(resolve(iconDir, "Contents.json"), "utf8"),
    ) as {
      images: Array<{
        filename?: string;
        idiom?: string;
        platform?: string;
        size?: string;
        appearances?: Array<{ appearance?: string; value?: string }>;
      }>;
    };

    expect(contents.images).toEqual([
      {
        filename: defaultIcon,
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
    ]);
  });

  it("keeps the generated App Store icon opaque and 1024x1024", () => {
    expect(existsSync(resolve(iconDir, defaultIcon))).toBe(true);
    expect(pngHeader(defaultIcon)).toEqual({
      width: 1024,
      height: 1024,
      colorType: 2,
    });
  });

  it("does not keep independent dark or tinted logo variants", () => {
    expect(existsSync(resolve(iconDir, "AppIcon-512@2x-dark.png"))).toBe(false);
    expect(existsSync(resolve(iconDir, "AppIcon-512@2x-tinted.png"))).toBe(false);
  });

  it("generates the native icon from public/logotok.png", () => {
    const workflow = readFileSync(
      resolve(root, ".github/workflows/prepare-logotok-app-icon.yml"),
      "utf8",
    );
    const generator = readFileSync(
      resolve(root, "scripts/prepare-ios-app-icon.sh"),
      "utf8",
    );

    expect(workflow).toContain("public/logotok.png");
    expect(workflow).toContain(defaultIcon);
    expect(generator).toContain("public/logotok.png");
    expect(generator).toContain("-p 1024 1024");
    expect(generator).toContain("-s format jpeg");
  });
});
