import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const publicRoot = join(root, "public");
const STATIC_ASSET_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".json",
  ".mp4",
  ".png",
  ".svg",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);
const SCANNED_TEXT_EXTENSIONS = new Set([".css", ".html", ".json", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const SCANNED_ROOTS = ["src", "index.html", "vercel.json"];
const EXCLUDED_DIRECTORIES = new Set([".git", "dist", "node_modules", "src/test"]);

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/");
}

function walk(pathFromRoot: string): string[] {
  const absolutePath = join(root, pathFromRoot);
  if (!existsSync(absolutePath)) return [];

  const normalizedPathFromRoot = normalizeRelativePath(pathFromRoot);
  if (EXCLUDED_DIRECTORIES.has(normalizedPathFromRoot)) return [];

  const stat = statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const nextPath = normalizeRelativePath(join(pathFromRoot, entry.name));
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(nextPath)) return [];
    return walk(nextPath);
  });
}

function decodeJsStringPath(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value;
  }
}

function decodeUrlPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function publicPathFor(reference: string) {
  return join(publicRoot, decodeUrlPath(reference).replace(/^\//, ""));
}

function getVercelRewritePaths() {
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    rewrites?: Array<{ source?: string; destination?: string }>;
  };

  const sources = new Set<string>();
  const destinations = new Set<string>();

  for (const rewrite of config.rewrites || []) {
    if (rewrite.source) sources.add(rewrite.source);
    if (rewrite.destination) destinations.add(rewrite.destination);
  }

  return { sources, destinations };
}

function collectStaticPublicReferences() {
  const candidateFiles = SCANNED_ROOTS
    .flatMap(walk)
    .filter((file) => SCANNED_TEXT_EXTENSIONS.has(extname(file).toLowerCase()));
  const references: Array<{ file: string; ref: string }> = [];
  const publicReferencePattern = /["'`(]\s*(\/(?:images|higgsfield|tok-slot-machine|fondacceuil\.png|favicon[^"'`)\s]*|logo[^"'`)\s]*|manifest\.json|robots\.txt|sitemap\.xml)[^"'`)\s]*)/g;

  for (const file of candidateFiles) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(publicReferencePattern)) {
      const rawReference = decodeJsStringPath(match[1]).split(/[?#]/)[0];
      if (!STATIC_ASSET_EXTENSIONS.has(extname(rawReference).toLowerCase())) continue;
      references.push({
        file: normalizeRelativePath(relative(root, file)),
        ref: rawReference,
      });
    }
  }

  return references;
}

describe("public asset references", () => {
  it("keeps static app references pointed at existing public files or explicit rewrites", () => {
    const rewrites = getVercelRewritePaths();
    const missing = collectStaticPublicReferences()
      .filter((reference) => {
        if (rewrites.sources.has(reference.ref) || rewrites.destinations.has(reference.ref)) return false;
        return !existsSync(publicPathFor(reference.ref));
      });

    expect(missing).toEqual([]);
  });
});
