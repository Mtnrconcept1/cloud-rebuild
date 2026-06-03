import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOME_ASSET_LIMIT_BYTES = 800_000;
const root = process.cwd();

const optimizedHomeAssets = [
  "public/chefbg.webp",
  "public/chefbg2.webp",
  "public/Miamz2.webp",
  "public/Miamz3.webp",
  "public/images/tokone.webp",
];

const obsoleteHomePngAssets = [
  "public/chefbg.png",
  "public/chefbg2.png",
  "public/Miamz2.png",
  "public/Miamz3.png",
  "public/images/tokone.png",
];

describe("home public assets", () => {
  it("serves optimized home artwork instead of multi-megabyte PNGs", () => {
    for (const asset of optimizedHomeAssets) {
      const absolutePath = path.join(root, asset);
      expect(existsSync(absolutePath), `${asset} should exist`).toBe(true);
      expect(statSync(absolutePath).size, `${asset} should stay below ${HOME_ASSET_LIMIT_BYTES} bytes`).toBeLessThanOrEqual(HOME_ASSET_LIMIT_BYTES);
    }

    for (const asset of obsoleteHomePngAssets) {
      expect(existsSync(path.join(root, asset)), `${asset} should be removed once replaced`).toBe(false);
    }
  });
});
