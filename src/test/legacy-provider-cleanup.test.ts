import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SKIPPED_DIRS = new Set([
  ".git",
  ".vercel",
  "dist",
  "node_modules",
  "outputs",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function isTextFile(filePath: string) {
  const basename = path.basename(filePath);
  if (basename.startsWith(".env")) return true;
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function collectTextFiles(dir: string, files: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        collectTextFiles(path.join(dir, entry.name), files);
      }
      continue;
    }

    if (entry.isFile()) {
      const filePath = path.join(dir, entry.name);
      if (isTextFile(filePath)) files.push(filePath);
    }
  }

  return files;
}

describe("retired provider cleanup", () => {
  it("does not keep references to the retired app-builder provider", () => {
    const retiredProviderPattern = new RegExp(["lo", "vable"].join(""), "i");
    const matches = collectTextFiles(ROOT)
      .filter((filePath) => retiredProviderPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(ROOT, filePath));

    expect(matches).toEqual([]);
  });
});
