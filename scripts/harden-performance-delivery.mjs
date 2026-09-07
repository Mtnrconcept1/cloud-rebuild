import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const GOOGLE_FONTS_IMPORT_RE = /@import\s+(?:url\(\s*)?(["']?)https:\/\/fonts\.googleapis\.com\/css2\?[^"')]+(?:\1\s*)?\)?\s*;?\s*/gi;

async function collectCssFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectCssFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".css")) files.push(absolute);
  }
  return files;
}

export function removeBlockingGoogleFontImport(css) {
  return String(css || "").replace(GOOGLE_FONTS_IMPORT_RE, "");
}

export async function hardenPerformanceDelivery() {
  const cssFiles = await collectCssFiles(path.join(DIST_DIR, "assets"));
  let changed = 0;
  for (const filePath of cssFiles) {
    const css = await readFile(filePath, "utf8");
    const next = removeBlockingGoogleFontImport(css);
    if (next === css) continue;
    await writeFile(filePath, next, "utf8");
    changed += 1;
  }
  console.log(`Performance delivery ready: ${changed}/${cssFiles.length} CSS asset(s) débarrassé(s) de l'import Google Fonts bloquant.`);
  return { cssFiles: cssFiles.length, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenPerformanceDelivery().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
