import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isVenueSlug } from "./lib/stoppin-venue-dedupe.mjs";

const ORIGIN = "https://www.thetok.ch";
const MAX_REDIRECTS = 1000; // Never opt into additional bulk capacity automatically.
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export async function writeAliasReport(targetDir, aliasToCanonical) {
  await mkdir(targetDir, { recursive: true });
  const aliases = Object.fromEntries([...aliasToCanonical].sort(([a], [b]) => compare(a, b)));
  // Always replace the file, even for an empty/unavailable feed.
  await writeFile(path.join(targetDir, "stoppin-venue-aliases.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), aliases }, null, 2)}\n`, "utf8");
}

export function flattenAliases(aliases) {
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) {
    throw new Error("Invalid Stoppin alias manifest: expected an object");
  }
  const entries = Object.entries(aliases).sort(([a], [b]) => compare(a, b));
  if (entries.length > MAX_REDIRECTS) throw new Error("Stoppin redirects exceed the reviewed 1000-rule budget");
  for (const [source, destination] of entries) {
    if (!isVenueSlug(source) || !isVenueSlug(destination)) throw new Error("Unsafe Stoppin redirect slug");
  }
  const mapping = new Map(entries);
  const flattened = new Map();
  for (const [source, destination] of entries) {
    const seen = new Set([source]);
    let target = destination;
    while (mapping.has(target)) {
      if (seen.has(target)) throw new Error(`Stoppin redirect cycle at ${source}`);
      seen.add(target);
      target = mapping.get(target);
    }
    if (target === source) throw new Error(`Stoppin self redirect at ${source}`);
    flattened.set(source, target);
  }
  return flattened;
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)]
    .map(([, key, double, single, unquoted]) => [key.toLowerCase(), double ?? single ?? unquoted]));
}

async function isCanonicalPage(dist, slug) {
  let html;
  try {
    html = await readFile(path.join(dist, "restaurants-pres", slug, "index.html"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const canonicals = [...head.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => attributes(tag))
    .filter((tag) => tag.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  if (canonicals.length !== 1 || canonicals[0].href !== `${ORIGIN}/restaurants-pres/${slug}`) return false;
  if (!/data-seo-prerender=["']stoppin-nearby["']/.test(html)) return false;
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    if (attrs["http-equiv"]?.toLowerCase() === "refresh") return false;
    if (["robots", "googlebot"].includes(attrs.name?.toLowerCase())
      && /(?:^|[\s,])(noindex|none)(?:$|[\s,])/i.test(attrs.content || "")) return false;
  }
  return true;
}

export async function applyVenueRedirects(root = process.cwd()) {
  const dist = path.resolve(root, "dist");
  let report = { aliases: {} };
  try {
    report = JSON.parse(await readFile(path.join(dist, "stoppin-venue-aliases.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const aliases = flattenAliases(report?.aliases);
  const eligibility = new Map();
  const redirects = [];
  const redirectedSlugs = new Set();
  for (const [source, target] of aliases) {
    if (!eligibility.has(target)) eligibility.set(target, await isCanonicalPage(dist, target));
    if (!eligibility.get(target)) continue;
    // Cover old URLs with and without a trailing slash; never redirect outside TOK.
    for (const suffix of ["", "/"]) {
      redirects.push({ source: `/restaurants-pres/${source}${suffix}`, destination: `/restaurants-pres/${target}`,
        statusCode: 301, caseSensitive: true, preserveQueryParams: true });
    }
    redirectedSlugs.add(source);
  }
  if (redirects.length > MAX_REDIRECTS) throw new Error("Stoppin redirects exceed the reviewed 1000-rule budget");
  // Only touch generated files, and only after validation. A removed/noindex
  // canonical never causes deletion of an existing alias page.
  for (const slug of redirectedSlugs) {
    await rm(path.join(dist, "restaurants-pres", slug, "index.html"), { force: true });
  }
  const aliasUrls = new Set([...redirectedSlugs].map((slug) => `${ORIGIN}/restaurants-pres/${slug}`));
  if (aliasUrls.size) {
    for (const file of await readdir(dist)) {
      if (!/^sitemap.*\.xml$/.test(file)) continue;
      const filePath = path.join(dist, file);
      const xml = await readFile(filePath, "utf8");
      const cleaned = xml.replace(/<url\b[^>]*>[\s\S]*?<\/url>/g, (entry) => {
        const url = entry.match(/<loc>\s*([^<]+)\s*<\/loc>/)?.[1]?.trim().replace(/\/$/, "");
        return aliasUrls.has(url) ? "" : entry;
      });
      if (cleaned !== xml) await writeFile(filePath, cleaned, "utf8");
    }
  }
  const output = path.resolve(root, ".vercel", "stoppin-venue-redirects.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(redirects, null, 2)}\n`, "utf8");
  return redirects;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const redirects = await applyVenueRedirects();
  console.log(`SEO Stoppin: ${redirects.length} redirection(s) HTTP 301 prête(s) pour Vercel.`);
}
