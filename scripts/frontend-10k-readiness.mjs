#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAX_PUBLIC_RASTER_BYTES = 2_500_000;
const MAX_SUPABASE_FETCHED_ROWS = 500;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const PUBLIC_RASTER_RE = /\.(png|jpe?g|webp|avif)$/i;
const PUBLIC_RASTER_BUDGET_EXEMPTIONS = [
  /^public\/desig app\//,
  /^public\/images\/section-headers\//,
  /^public\/(?:5a64288a-9712-4aae-8293-b0570ecd8668|ChatGPT Image 8 juin 2026, 02_46_54|ChatGPT Image 8 juin 2026, 02_57_38|aide|logo-watermark)\.png$/i,
];
const SKIPPED_WALK_DIRS = new Set([
  ".git",
  ".pnpm-store",
  ".tmp",
  ".vercel",
  ".vs",
  "dist",
  "node_modules",
  "outputs",
  "screenshots",
  "tmp",
  "tmp-screenshots",
]);

export function inspectFrontendReadiness(options = {}) {
  const root = options.root || process.cwd();
  const files = listProjectFiles(root);
  const errors = [];
  const warnings = [];
  const summary = {
    trackedFiles: files.length,
    publicRasterAssets: 0,
    budgetedPublicRasterAssets: 0,
    exemptPublicRasterAssets: 0,
    maxPublicRasterBytes: 0,
    maxBudgetedPublicRasterBytes: 0,
    maxExemptPublicRasterBytes: 0,
    maxSupabaseFetchedRows: 0,
    projectPageFiles: 0,
    pageFiles: 0,
    lazyRouteImports: 0,
  };

  inspectPublicAssets(root, files, errors, warnings, summary);
  inspectSupabaseRowCaps(root, files, errors, summary);
  inspectRouteLazyLoading(root, files, errors, warnings, summary);
  if (options.inspectBuiltBundle !== false) {
    inspectBuiltBundle(root, errors, warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary,
  };
}

function listProjectFiles(root) {
  try {
    const safeDirectory = path.resolve(root).replace(/\\/g, "/");
    const output = execFileSync("git", ["-c", `safe.directory=${safeDirectory}`, "-C", root, "ls-files"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = output.split(/\r?\n/).filter(Boolean);
    if (files.length > 0) return files;
  } catch {
    // Fixtures used by tests are not Git worktrees.
  }

  return walk(root)
    .map((file) => path.relative(root, file).replace(/\\/g, "/"))
    .filter((file) => !SKIPPED_WALK_DIRS.has(file.split("/")[0]));
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_WALK_DIRS.has(entry.name)) continue;
      files.push(...walk(absolute));
    } else {
      files.push(absolute);
    }
  }

  return files;
}

function inspectPublicAssets(root, files, errors, warnings, summary) {
  for (const file of files) {
    if (!file.startsWith("public/") || !PUBLIC_RASTER_RE.test(file)) continue;

    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;

    const size = fs.statSync(absolute).size;
    summary.publicRasterAssets += 1;
    summary.maxPublicRasterBytes = Math.max(summary.maxPublicRasterBytes, size);

    if (isPublicRasterBudgetExempt(file)) {
      summary.exemptPublicRasterAssets += 1;
      summary.maxExemptPublicRasterBytes = Math.max(summary.maxExemptPublicRasterBytes, size);
      if (size > MAX_PUBLIC_RASTER_BYTES) {
        warnings.push(`Large exempt public raster asset should be optimized before heavy traffic: ${file} (${formatBytes(size)}).`);
      }
      continue;
    }

    summary.budgetedPublicRasterAssets += 1;
    summary.maxBudgetedPublicRasterBytes = Math.max(summary.maxBudgetedPublicRasterBytes, size);

    if (size > MAX_PUBLIC_RASTER_BYTES) {
      errors.push(`Large public raster asset must be optimized or removed: ${file} (${formatBytes(size)}).`);
    }
  }
}

function isPublicRasterBudgetExempt(file) {
  return PUBLIC_RASTER_BUDGET_EXEMPTIONS.some((pattern) => pattern.test(file));
}

function inspectSupabaseRowCaps(root, files, errors, summary) {
  for (const file of files) {
    if (!file.startsWith("src/") || !SOURCE_EXTENSIONS.has(path.extname(file)) || isTestSourceFile(file)) continue;

    const source = readFile(path.join(root, file));
    if (!source) continue;
    const constants = extractNumericConstants(source);

    for (const match of source.matchAll(/\.limit\(\s*([A-Z][A-Z0-9_]*|\d+)\s*\)/g)) {
      const label = match[1];
      const rows = resolveNumericToken(label, constants);
      if (rows === null) continue;
      recordSupabaseRowCap(file, `limit(${label})`, rows, errors, summary);
    }

    for (const match of source.matchAll(/\.range\(\s*0\s*,\s*(\d+|[A-Z][A-Z0-9_]*\s*-\s*1)\s*\)/g)) {
      const label = match[1].replace(/\s+/g, " ");
      const rows = label.endsWith(" - 1")
        ? resolveNumericToken(label.slice(0, -4), constants)
        : addOne(resolveNumericToken(label, constants));
      if (rows === null) continue;
      recordSupabaseRowCap(file, `range(0, ${label})`, rows, errors, summary);
    }
  }
}

function isTestSourceFile(file) {
  return (
    file.startsWith("src/test/") ||
    file.includes("/__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
}

function extractNumericConstants(source) {
  const constants = new Map();

  for (const match of source.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*;/g)) {
    constants.set(match[1], Number(match[2]));
  }

  return constants;
}

function resolveNumericToken(token, constants) {
  const trimmed = token.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return constants.has(trimmed) ? constants.get(trimmed) : null;
}

function addOne(value) {
  return value === null ? null : value + 1;
}

function recordSupabaseRowCap(file, expression, rows, errors, summary) {
  summary.maxSupabaseFetchedRows = Math.max(summary.maxSupabaseFetchedRows, rows);
  if (rows > MAX_SUPABASE_FETCHED_ROWS) {
    errors.push(`${file} uses ${expression}; keep default interactive Supabase fetches <= ${MAX_SUPABASE_FETCHED_ROWS} rows.`);
  }
}

function inspectRouteLazyLoading(root, files, errors, warnings, summary) {
  const appPath = path.join(root, "src", "App.tsx");
  if (!fs.existsSync(appPath)) return;

  const app = readFile(appPath) || "";
  const projectPageSpecifiers = files
    .map(toAppPageSpecifier)
    .filter(Boolean);
  const routePageImports = extractAppPageImports(app);
  const lazyPageImports = extractLazyAppPageImports(app);
  const appRoutePageFiles = projectPageSpecifiers.filter((specifier) => routePageImports.has(specifier));

  summary.projectPageFiles = projectPageSpecifiers.length;
  summary.pageFiles = appRoutePageFiles.length;
  summary.lazyRouteImports = lazyPageImports.size;

  if (appRoutePageFiles.length > 0 && lazyPageImports.size < appRoutePageFiles.length - 3) {
    errors.push(`Route lazy-loading coverage is too low: ${lazyPageImports.size} lazy page imports for ${appRoutePageFiles.length} App route page modules.`);
  }

  if (!app.includes("staleTime:")) {
    warnings.push("QueryClient has no default staleTime; this can increase repeated Supabase reads.");
  }
}

function toAppPageSpecifier(file) {
  if (!file.startsWith("src/pages/") || path.extname(file) !== ".tsx") return null;
  return `./${file.slice("src/".length, -".tsx".length)}`;
}

function extractAppPageImports(app) {
  const imports = new Set();

  for (const match of app.matchAll(/from\s+["'](\.\/pages\/[^"']+)["']/g)) {
    imports.add(match[1]);
  }

  for (const match of app.matchAll(/import\(\s*["'](\.\/pages\/[^"']+)["']\s*\)/g)) {
    imports.add(match[1]);
  }

  return imports;
}

function extractLazyAppPageImports(app) {
  const imports = new Set();

  for (const match of app.matchAll(/lazy\(\(\)\s*=>\s*import\(\s*["'](\.\/pages\/[^"']+)["']\s*\)/g)) {
    imports.add(match[1]);
  }

  return imports;
}

function inspectBuiltBundle(root, errors, warnings) {
  const assetsDir = path.join(root, "dist", "assets");
  if (!fs.existsSync(assetsDir)) return;

  for (const file of walk(assetsDir)) {
    const relative = path.relative(root, file).replace(/\\/g, "/");
    const ext = path.extname(file);
    const size = fs.statSync(file).size;

    if (ext === ".js" && size > 750_000) {
      errors.push(`Built JavaScript chunk exceeds 750 KB: ${relative} (${formatBytes(size)}).`);
    }

    if (ext === ".css" && size > 400_000) {
      warnings.push(`Built CSS chunk exceeds 400 KB: ${relative} (${formatBytes(size)}).`);
    }
  }
}

function readFile(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function formatBytes(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${value} B`;
}

function printResult(result) {
  console.log("Frontend 10k readiness");
  console.log("======================");
  console.log(`Result: ${result.ok ? "OK" : "FAIL"}`);
  console.log(JSON.stringify(result.summary, null, 2));

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  for (const warning of result.warnings) {
    console.log(`- Warning: ${warning}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = inspectFrontendReadiness();
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}
