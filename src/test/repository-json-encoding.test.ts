import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  ".playwright-mcp",
  ".tmp",
  ".tools",
  ".turbo",
  ".vercel",
  ".vite",
  ".vs",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "outputs",
  "screenshots",
]);

function collectJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (EXCLUDED_DIRS.has(entry.name)) return [];

    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(absolutePath);
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".json") return [];

    return [absolutePath];
  });
}

function hasUtf16Bom(buffer: Buffer) {
  return (
    (buffer[0] === 0xff && buffer[1] === 0xfe) ||
    (buffer[0] === 0xfe && buffer[1] === 0xff)
  );
}

describe("repository JSON encoding", () => {
  it("keeps checked-in JSON assets readable as UTF-8 text", () => {
    const offenders = collectJsonFiles(root)
      .filter((file) => {
        const buffer = readFileSync(file);
        const firstBytes = buffer.subarray(0, Math.min(buffer.length, 512));
        return hasUtf16Bom(buffer) || firstBytes.includes(0);
      })
      .map((file) => relative(root, file).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });
});
