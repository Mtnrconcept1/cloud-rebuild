#!/usr/bin/env node
/**
 * Generates the error-code -> throw-site map shipped to the incident analyser.
 *
 * The analyser runs inside an Edge Function with no access to the repository, and
 * its prompt forbids naming a file that is not literally present in the evidence.
 * Without this map it can only describe an error code in the abstract; with it,
 * `ai_empty_response` resolves to the exact file and line that raises it, and the
 * repair plan can point at real code.
 *
 * Run via `pnpm run generate:error-code-map`. A test fails if the committed file
 * drifts from the source, so the map cannot silently go stale.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");
const OUTPUT = join(FUNCTIONS_DIR, "_shared", "error-code-map.ts");

// `new HttpError(502, "ai_empty_response"` — status then a literal code.
const THROW_PATTERN = /new HttpError\(\s*\d{3}\s*,\s*["']([a-z][a-z0-9_]{2,79})["']/g;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

export function buildErrorCodeMap() {
  const sites = new Map();

  for (const file of walk(FUNCTIONS_DIR).sort()) {
    const relativePath = relative(ROOT, file).split("\\").join("/");
    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((line, index) => {
      THROW_PATTERN.lastIndex = 0;
      let match;
      while ((match = THROW_PATTERN.exec(line)) !== null) {
        const code = match[1];
        if (!sites.has(code)) sites.set(code, []);
        const entries = sites.get(code);
        // Cap per code: a code raised in many places is a category, and listing
        // every occurrence would crowd out the rest of the evidence.
        if (entries.length < 12) entries.push({ file: relativePath, line: index + 1 });
      }
    });
  }

  return Object.fromEntries([...sites.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function renderModule(map) {
  const generatedAt = Object.keys(map).length;
  return `// GENERATED FILE — do not edit by hand.
// Run \`pnpm run generate:error-code-map\` after adding or moving an HttpError.
// ${generatedAt} error codes mapped from supabase/functions/**.

export type ErrorCodeSite = { file: string; line: number };

export const ERROR_CODE_SITES: Record<string, ErrorCodeSite[]> = ${JSON.stringify(map, null, 2)};

/**
 * Resolves an error code to the source locations that raise it.
 *
 * Returns an empty array for an unknown code rather than guessing, so the
 * analyser never receives a path that does not exist.
 */
export function lookupErrorCodeSites(code: string | null | undefined): ErrorCodeSite[] {
  if (!code) return [];
  const normalized = code.trim().toLowerCase();
  return ERROR_CODE_SITES[normalized] ?? [];
}
`;
}

if (import.meta.filename === process.argv[1]) {
  const map = buildErrorCodeMap();
  writeFileSync(OUTPUT, renderModule(map), "utf8");
  console.log(`Wrote ${relative(ROOT, OUTPUT)} with ${Object.keys(map).length} error codes.`);
}
