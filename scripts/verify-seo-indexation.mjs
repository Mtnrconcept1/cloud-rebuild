import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const ORIGIN = "https://www.thetok.ch";

async function readRequired(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Artefact SEO absent : ${path.relative(ROOT, filePath)} (${error.message})`);
  }
}

function xmlLocs(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

function htmlMeta(html, name) {
  const tag = String(html).match(new RegExp(`<meta\\b[^>]*\\bname=["']${name}["'][^>]*>`, "i"))?.[0] || "";
  return tag.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || "";
}

function canonicalHref(html) {
  const tag = String(html).match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0]
    || String(html).match(/<link\b(?=[^>]*\bhref=["'][^"']+["'])[^>]*\brel=["']canonical["'][^>]*>/i)?.[0]
    || "";
  return tag.match(/href=["']([^"']+)["']/i)?.[1]?.trim() || "";
}

function routeFile(url, distDir) {
  const parsed = new URL(url);
  const route = parsed.pathname.replace(/\/+$/, "") || "/";
  return route === "/"
    ? path.join(distDir, "index.html")
    : path.join(distDir, route.slice(1), "index.html");
}

function hasNoindex(html) {
  return /(?:^|,)\s*(?:noindex|none)\s*(?:,|$)/i.test(htmlMeta(html, "robots"));
}

function visibleTextLength(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export async function verifySeoIndexation({ distDir = DIST_DIR } = {}) {
  const indexPath = path.join(distDir, "sitemap.xml");
  const index = await readRequired(indexPath);
  const sitemapUrls = xmlLocs(index);
  if (sitemapUrls.length === 0) throw new Error("Le sitemap index ne référence aucun sitemap.");

  const seen = new Set();
  const issues = [];
  let pages = 0;

  for (const sitemapUrl of sitemapUrls) {
    const parsedSitemap = new URL(sitemapUrl);
    if (parsedSitemap.origin !== ORIGIN || !/^\/sitemap-[a-z0-9-]+\.xml$/i.test(parsedSitemap.pathname)) {
      issues.push(`Sitemap non canonique : ${sitemapUrl}`);
      continue;
    }
    const sitemap = await readRequired(path.join(distDir, parsedSitemap.pathname.slice(1)));
    for (const pageUrl of xmlLocs(sitemap)) {
      pages += 1;
      let parsed;
      try {
        parsed = new URL(pageUrl);
      } catch {
        issues.push(`URL invalide dans sitemap : ${pageUrl}`);
        continue;
      }
      if (parsed.origin !== ORIGIN || parsed.search || parsed.hash || /\/$/.test(parsed.pathname) && parsed.pathname !== "/") {
        issues.push(`URL non canonique dans sitemap : ${pageUrl}`);
        continue;
      }
      if (seen.has(pageUrl)) {
        issues.push(`URL dupliquée dans les sitemaps : ${pageUrl}`);
        continue;
      }
      seen.add(pageUrl);

      const filePath = routeFile(pageUrl, distDir);
      let html;
      try {
        html = await readFile(filePath, "utf8");
      } catch {
        issues.push(`URL de sitemap sans page générée : ${pageUrl}`);
        continue;
      }
      if (hasNoindex(html)) issues.push(`URL noindex publiée dans sitemap : ${pageUrl}`);
      if (canonicalHref(html) !== pageUrl) issues.push(`Canonical incohérent pour ${pageUrl}`);
      if (!/<h1\b[^>]*>\s*\S[\s\S]*?<\/h1>/i.test(html)) issues.push(`H1 absent pour ${pageUrl}`);
      if (visibleTextLength(html) < 180) issues.push(`Contenu trop faible pour ${pageUrl}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Contrôle SEO bloquant (${issues.length}) :\n- ${issues.slice(0, 30).join("\n- ")}`);
  }
  console.log(`SEO indexation vérifiée : ${pages} URL(s) canoniques, indexables et pré-rendues.`);
  return { pages, sitemaps: sitemapUrls.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifySeoIndexation().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
