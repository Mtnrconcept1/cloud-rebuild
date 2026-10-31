import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ORIGIN = "https://www.thetok.ch";
const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const PRIVATE = /^\/(?:admin|marketing|dashboard|courier|commercial|profil|notifications|commandes?|reservations|panier|auth|oauth|compte|espace-client|mon-espace|mes-avis|memoire-tok|espaces|r)(?:\/|$)/;
const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

// No network, no script execution: only the deployable artifact is inspected.
export function inspectSitemap(xml, now = new Date()) {
  const dom = new JSDOM(xml, { contentType: "application/xml" });
  try {
    const root = dom.window.document.documentElement;
    if (root.namespaceURI !== NS || !["sitemapindex", "urlset"].includes(root.localName)) {
      throw new Error("Invalid sitemap root or namespace");
    }
    const entries = [...root.children];
    if (entries.length > 50000 || Buffer.byteLength(xml, "utf8") > 50 * 1024 * 1024) {
      throw new Error("Sitemap exceeds the 50,000 URL / 50 MiB limit");
    }
    const values = entries.map((entry) => {
      const expected = root.localName === "sitemapindex" ? "sitemap" : "url";
      if (entry.localName !== expected || entry.namespaceURI !== NS) throw new Error("Invalid sitemap entry");
      const locs = [...entry.children].filter((e) => e.localName === "loc" && e.namespaceURI === NS);
      if (locs.length !== 1) throw new Error("Each sitemap entry needs exactly one loc");
      const loc = text(locs[0]);
      const url = new URL(loc);
      if (url.origin !== ORIGIN || url.search || url.hash || url.username || url.password) {
        throw new Error(`Non-canonical sitemap URL: ${loc}`);
      }
      for (const lastmod of [...entry.children].filter((e) => e.localName === "lastmod" && e.namespaceURI === NS)) {
        const value = text(lastmod);
        const datePart = value.slice(0, 10);
        const date = new Date(value);
        const calendarDate = new Date(`${datePart}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(date.getTime())
          || !Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart || date > now) {
          throw new Error(`Invalid/future lastmod: ${value}`);
        }
      }
      return loc;
    });
    return { kind: root.localName, urls: values };
  } finally { dom.window.close(); }
}

function localFile(directory, url, xml = false) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const file = path.resolve(directory, `.${pathname}`, ...(xml ? [] : ["index.html"]));
  if (!file.startsWith(`${directory}${path.sep}`)) throw new Error("Path outside artifact");
  return file;
}

export async function auditSeoArtifact(directory = "dist") {
  const root = path.resolve(directory);
  const errors = [], warnings = [], pages = [], sitemapFiles = [];
  const issue = (url, message) => errors.push({ url, message });
  const urls = new Set(), visited = new Set();
  async function visit(url) {
    if (visited.has(url)) { issue(url, "Repeated or cyclic sitemap reference"); return; }
    visited.add(url);
    try {
      const xml = await readFile(localFile(root, url, true), "utf8");
      const map = inspectSitemap(xml);
      sitemapFiles.push({ url, kind: map.kind, entries: map.urls.length });
      if (map.kind === "sitemapindex") {
        for (const child of map.urls) await visit(child);
      } else for (const loc of map.urls) {
        if (urls.has(loc)) issue(loc, "Duplicate sitemap URL");
        urls.add(loc);
      }
    } catch (error) { issue(url, error.message); }
  }
  await visit(`${ORIGIN}/sitemap.xml`);
  if (!urls.size) issue(`${ORIGIN}/sitemap.xml`, "Empty public inventory");
  try {
    const robots = await readFile(path.join(root, "robots.txt"), "utf8");
    let agents = [], rulesStarted = false;
    for (const raw of robots.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const match = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
      if (!match) continue;
      if (match[1].toLowerCase() === "user-agent") {
        if (rulesStarted) { agents = []; rulesStarted = false; }
        agents.push(match[2].toLowerCase());
      } else {
        rulesStarted = true;
        if (match[1].toLowerCase() === "disallow" && ["/", "/*"].includes(match[2])
          && agents.some((agent) => ["*", "googlebot"].includes(agent))) {
          issue(`${ORIGIN}/robots.txt`, `Global crawl disallow for ${agents.join(", ")}`);
        }
      }
    }
    if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) issue(`${ORIGIN}/robots.txt`, "Missing canonical sitemap declaration");
  } catch (error) { issue(`${ORIGIN}/robots.txt`, error.message); }

  const titles = new Map();
  for (const url of urls) {
    if (PRIVATE.test(new URL(url).pathname)) issue(url, "Private route in sitemap");
    let dom;
    try {
      dom = new JSDOM(await readFile(localFile(root, url), "utf8"), { url });
      const doc = dom.window.document;
      const title = text(doc.querySelector("title"));
      if (!title || doc.querySelectorAll("title").length !== 1) issue(url, "Missing/duplicate title");
      const previous = titles.get(title);
      if (previous) issue(url, `Duplicate title with ${previous}`);
      titles.set(title, url);
      const headings = [...doc.querySelectorAll("body h1")];
      if (headings.length !== 1 || !text(headings[0])) issue(url, "Expected one nonempty H1 in initial HTML");
      if (!doc.querySelector('meta[name="description" i]')?.getAttribute("content")?.trim()) issue(url, "Missing description");
      const canonicals = [...doc.querySelectorAll('link[rel~="canonical" i]')];
      if (canonicals.length !== 1 || canonicals[0].getAttribute("href") !== url) issue(url, "Canonical differs from sitemap URL");
      for (const meta of doc.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]')) {
        if (/(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(meta.getAttribute("content") || "")) issue(url, "Noindex page in sitemap");
      }
      for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
        try { JSON.parse(script.textContent); } catch { issue(url, "Invalid JSON-LD"); }
      }
      const links = [...doc.querySelectorAll("a[href]")].flatMap((a) => {
        try { const link = new URL(a.getAttribute("href"), url); return link.origin === ORIGIN ? [link.origin + link.pathname.replace(/\/$/, "").replace(/^$/, "/")] : []; }
        catch { return []; }
      });
      const missingAlt = doc.querySelectorAll("img:not([alt])").length;
      if (missingAlt) warnings.push({ url, message: `${missingAlt} images without alt` });
      pages.push({ url, title, h1: text(headings[0]), links });
    } catch (error) { issue(url, error.message); }
    finally { dom?.window.close(); }
  }
  const graph = new Map(pages.map((page) => [page.url, page.links]));
  const reached = new Set(), queue = [`${ORIGIN}/`];
  for (let i = 0; i < queue.length; i++) {
    const url = queue[i];
    if (reached.has(url)) continue;
    reached.add(url);
    for (const link of graph.get(url) || []) if (graph.has(link) && !reached.has(link)) queue.push(link);
  }
  for (const page of pages) if (!reached.has(page.url)) warnings.push({ url: page.url, message: "Not reachable from homepage in initial HTML graph" });
  return { ok: errors.length === 0, generatedAt: new Date().toISOString(), sitemapFiles, pageCount: pages.length, errors, warnings, pages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const result = await auditSeoArtifact(value("--dir") || "dist");
  if (value("--output")) await writeFile(value("--output"), JSON.stringify(result, null, 2) + "\n");
  console.log(`SEO artifact: ${result.pageCount} pages, ${result.errors.length} errors, ${result.warnings.length} warnings`);
  for (const error of result.errors) console.error(`${error.url}: ${error.message}`);
  process.exitCode = result.ok ? 0 : 1;
}
