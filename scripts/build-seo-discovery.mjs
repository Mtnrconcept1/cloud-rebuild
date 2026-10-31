import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { inspectSitemap } from "./seo-artifact-audit.mjs";

const ORIGIN = "https://www.thetok.ch";
const HUB = `${ORIGIN}/decouvrir`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const PRIVATE = /^\/(?:admin|marketing|dashboard|courier|commercial|profil|auth|oauth|panier|commandes?|reservations|compte|notifications|mon-espace|espaces)(?:\/|$)/;
const NAV = '<nav id="tok-public-discovery" aria-label="Toutes les adresses TOK" style="padding:24px;text-align:center;background:#fff;color:#222"><a href="/decouvrir" style="color:inherit;text-decoration:underline">Explorer toutes les adresses et les lieux couverts par TOK</a></nav>';

export async function buildSeoDiscovery(root = process.cwd()) {
  const dist = path.resolve(root, "dist");
  const urls = new Set(), visited = new Set();
  async function visit(url) {
    if (visited.has(url)) throw new Error("Cyclic sitemap reference");
    visited.add(url);
    const map = inspectSitemap(await readFile(path.join(dist, new URL(url).pathname), "utf8"));
    if (map.kind === "sitemapindex") for (const child of map.urls) await visit(child);
    else for (const page of map.urls) if (page !== HUB) urls.add(page);
  }
  await visit(`${ORIGIN}/sitemap.xml`);
  const pages = [];
  for (const url of urls) {
    const route = new URL(url).pathname;
    if (PRIVATE.test(route)) throw new Error(`Private route in public discovery: ${route}`);
    const file = path.join(dist, route, "index.html");
    const html = await readFile(file, "utf8");
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document;
      const canonical = [...doc.querySelectorAll('link[rel~="canonical" i]')];
      if (canonical.length !== 1 || canonical[0].getAttribute("href") !== url) throw new Error(`Noncanonical discovery target: ${url}`);
      if ([...doc.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]')].some((m) => /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(m.getAttribute("content") || ""))) {
        throw new Error(`Noindex discovery target: ${url}`);
      }
      pages.push({ route, title: (doc.title || route).replace(/\s*\|\s*TOK\s*$/i, ""), file, html });
    } finally { dom.window.close(); }
  }
  pages.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  const restaurants = pages.filter((p) => /^\/restaurants\/[^/]+\/r\/[^/]+$/.test(p.route));
  const venues = pages.filter((p) => p.route.startsWith("/restaurants-pres/"));
  const other = pages.filter((p) => !restaurants.includes(p) && !venues.includes(p));
  const list = (items) => `<ul>${items.map((p) => `<li><a href="${escape(p.route)}">${escape(p.title)}</a></li>`).join("")}</ul>`;
  const groups = new Map();
  for (const item of restaurants) {
    const city = item.route.split("/")[2];
    const current = groups.get(city) || []; current.push(item); groups.set(city, current);
  }
  const cityTitle = (slug) => pages.find((p) => p.route === `/restaurants/${slug}`)?.title.replace(/\s*:.*$/, "")
    || slug.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join(" ");
  const groupedRestaurants = [...groups].sort(([a], [b]) => a.localeCompare(b, "fr"))
    .map(([city, items]) => `<details><summary>${escape(cityTitle(city))} · ${items.length} adresse${items.length > 1 ? "s" : ""}</summary>${list(items)}</details>`).join("");
  const html = `<!doctype html><html lang="fr-CH"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Toutes les adresses et lieux couverts | TOK</title><meta name="description" content="Explorez les restaurants référencés sur TOK par commune et les bonnes adresses près des lieux couverts. Retrouvez nos services et informations pratiques."><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${HUB}"><link rel="icon" href="/favicon.ico"><style>body{margin:0;background:#fff;color:#242424;font:17px/1.65 system-ui,sans-serif}header,main,footer{max-width:1040px;margin:auto;padding:24px}header{border-bottom:1px solid #eee;display:flex;justify-content:space-between;gap:20px}a{color:inherit;text-underline-offset:4px}header>a{color:#F15D22;font-weight:900}h1{font-family:Georgia,serif;font-size:clamp(2rem,5vw,3.8rem);line-height:1.1}h2{margin-top:44px}p{max-width:75ch}details{border:1px solid #eee;border-radius:12px;padding:14px 18px;margin:12px 0}summary{cursor:pointer;font-weight:650;min-height:32px}li{padding:7px 0;overflow-wrap:anywhere}a:focus-visible,summary:focus-visible{outline:3px solid #F15D22;outline-offset:5px}footer{border-top:1px solid #eee}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style></head><body><header><a href="/" aria-label="Accueil TOK">TOK</a><a href="/recherche">Rechercher un restaurant</a></header><main><nav aria-label="Fil d’Ariane"><a href="/">Accueil</a> › Découvrir</nav><h1>Toutes les adresses et les lieux couverts par TOK</h1><p>Choisissez une commune ou un lieu pour découvrir les adresses référencées. La réservation et la commande sont proposées uniquement quand ces services sont activés sur la fiche du restaurant.</p><h2>Restaurants par commune</h2><p>${restaurants.length} fiches publiques, regroupées par commune.</p>${groupedRestaurants}<h2>Manger près d’un lieu</h2><p>Préparez votre sortie en consultant les restaurants autour des lieux ci-dessous. Consultez chaque fiche pour les informations disponibles.</p><details><summary>Voir les ${venues.length} lieux couverts</summary>${list(venues)}</details><h2>Villes, cuisines, services et informations</h2>${list(other)}</main><footer><a href="/contact">Contact</a> · <a href="/politique-confidentialite">Confidentialité</a> · <a href="/cgu">Conditions</a></footer></body></html>`;
  await mkdir(path.join(dist, "decouvrir"), { recursive: true });
  await writeFile(path.join(dist, "decouvrir/index.html"), html, "utf8");
  const sitemapFile = path.join(dist, "sitemap-pages.xml");
  let sitemap = await readFile(sitemapFile, "utf8");
  sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/www\.thetok\.ch\/decouvrir<\/loc>[\s\S]*?<\/url>/g, "");
  sitemap = sitemap.replace("</urlset>", `  <url><loc>${HUB}</loc></url>\n</urlset>`);
  await writeFile(sitemapFile, sitemap, "utf8");
  for (const page of pages) {
    const cleaned = page.html.replace(/<nav id="tok-public-discovery"[^>]*>[\s\S]*?<\/nav>/g, "");
    await writeFile(page.file, cleaned.replace(/<\/body>/i, `${NAV}\n</body>`), "utf8");
  }
  return { pages: pages.length, restaurants: restaurants.length, venues: venues.length };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  console.log("SEO public discovery:", await buildSeoDiscovery());
}
