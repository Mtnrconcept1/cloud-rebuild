import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const GENERATED_PREFIXES = [
  "android/app/build/",
  "android/app/src/main/assets/public/",
  "ios/App/App/public/",
];

const COMMON_MOJIBAKE_PATTERN = /[\u00c2\u00c3\ufffd]|\u00e2[\u0080-\u00bf\u20ac]/;

function trackedTextFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()))
    .filter((file) => !GENERATED_PREFIXES.some((prefix) => file.replace(/\\/g, "/").startsWith(prefix)))
    .filter((file) => existsSync(join(root, file)));
}

describe("repository text encoding", () => {
  it("keeps tracked text files UTF-8 readable without mojibake markers", () => {
    const offenders = trackedTextFiles().flatMap((file) => {
      const buffer = readFileSync(join(root, file));
      const firstBytes = buffer.subarray(0, Math.min(buffer.length, 4096));
      if (firstBytes.includes(0)) return [`${file}: contains NUL bytes near the start`];

      const text = buffer.toString("utf8");
      const lines = text.split(/\r?\n/);
      const badLine = lines.findIndex((line) => COMMON_MOJIBAKE_PATTERN.test(line));
      if (badLine < 0) return [];

      return [`${file}:${badLine + 1}: contains mojibake marker`];
    });

    expect(offenders).toEqual([]);
  });
});
