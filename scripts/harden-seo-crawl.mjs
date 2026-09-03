import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const MAX_HOME_CITIES = 32;
const MAX_SEARCH_CITIES = 60;
const MAX_SEARCH_SPECIALIZED = 60;
const MAX_ACTUALITES_LINKS = 24;

function normalizeRoute(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";
  try {
    const parsed = new URL(raw, "https://www.thetok.ch");
    if (parsed.origin !== "https://www.thetok.ch") return null;
    return `/${parsed.pathname.replace(/^\/+|\/+$/g, "")}` || "/";
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function readMeta(html, attribute, key) {
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html.match(pattern)?.[0] || "";
  return tag.match(/content=["']([^"']*)["']/i)?.[1] || "";
}

function readTitle(html) {
  return stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function readHeading(html) {
  return stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
}

function readRobots(html) {
  return readMeta(html, "name", "robots").toLowerCase();
}

function isNoindex(html) {
  return /(?:^|,)\s*noindex\s*(?:,|$)/i.test(readRobots(html));
}

function inventoryFromJsonLd(html) {
  const raw = html.match(/<script\s+id=["']tok-page-json-ld["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length > 0) {
      const current = stack.shift();
      if (!current || typeof current !== "object") continue;
      if (current["@type"] === "ItemList" && Number.isFinite(Number(current.numberOfItems))) {
        return Number(current.numberOfItems);
      }
      for (const value of Object.values(current)) {
        if (Array.isArray(value)) stack.push(...value);
        else if (value && typeof value === "object") stack.push(value);
      }
    }
  } catch {
    return 0;
  }
  return 0;
}

function routeFromFile(filePath) {
  const relative = path.relative(DIST_DIR, filePath).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (!relative.endsWith("/index.html")) return null;
  return normalizeRoute(relative.slice(0, -"/index.html".length));
}

async function collectIndexFiles(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectIndexFiles(absolute));
      continue;
    }
    if (entry.isFile() && entry.name === "index.html") result.push(absolute);
  }
  return result;
}

function isCityRoute(route) {
  return /^\/restaurants\/[^/]+$/.test(route);
}

function isRestaurantRoute(route) {
  return /^\/restaurants\/[^/]+\/r\/[^/]+$/.test(route) || /^\/restaurant\/[^/]+$/.test(route);
}

function isSpecializedLocalRoute(route) {
  return /^\/restaurants\/[^/]+\/[^/]+$/.test(route) && !route.includes("/r/");
}

function isActualiteRoute(route) {
  return /^\/actualites\/[^/]+$/.test(route);
}

function cityLabelFromDocument(document) {
  const fromTitle = document.title.match(/^Restaurant à (.+?)\s*:/i)?.[1];
  if (fromTitle) return fromTitle.trim();
  const fromHeading = document.heading.match(/^Restaurants? à (.+?)(?:\s*:|$)/i)?.[1];
  return (fromHeading || document.heading || document.route).trim();
}

function localLabelFromDocument(document) {
  return (document.heading || document.title.replace(/\s*\|\s*TOK\s*$/i, "") || document.route).trim();
}

function renderList(items) {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderLinks(links) {
  if (!links.length) return "";
  return `<nav aria-label="Liens utiles TOK">${links
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join("")}</nav>`;
}

function renderPrerenderedContent({ heading, paragraphs = [], sections = [], links = [] }) {
  const renderedParagraphs = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const renderedSections = sections
    .filter((section) => Array.isArray(section.items) && section.items.length > 0)
    .map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${renderList(section.items)}</section>`)
    .join("");
  return `<section id="tok-prerendered-content" data-prerendered="true" aria-label="Contenu public TOK" style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px 24px;max-width:1080px;margin:0 auto;color:#111827;background:#ffffff">
  <h1 style="font-size:clamp(2rem,5vw,4rem);line-height:1.02;margin:0 0 20px;font-weight:900">${escapeHtml(heading)}</h1>
  <div style="font-size:1rem;line-height:1.7;color:#4b5563;max-width:760px">${renderedParagraphs}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-top:32px">${renderedSections}</div>
  ${renderLinks(links)}
</section>`;
}

function replaceSectionById(html, id, replacement) {
  const idIndex = html.indexOf(`id="${id}"`);
  if (idIndex < 0) return html;
  const start = html.lastIndexOf("<section", idIndex);
  if (start < 0) return html;

  const token = /<section\b[^>]*>|<\/section>/gi;
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    if (/^<section\b/i.test(match[0])) depth += 1;
    else depth -= 1;
    if (depth === 0) {
      return `${html.slice(0, start)}${replacement}${html.slice(token.lastIndex)}`;
    }
  }
  return html;
}

function pruneKnownNoindexLinks(html, noindexRoutes) {
  return html.replace(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (match, before, href, after, body) => {
    const route = normalizeRoute(href);
    if (route && noindexRoutes.has(route)) return "";
    return match;
  });
}

function pruneKnownNoindexJsonLd(html, noindexRoutes) {
  return html.replace(
    /(<script\s+id=["']tok-page-json-ld["'][^>]*>)([\s\S]*?)(<\/script>)/i,
    (match, opening, rawJson, closing) => {
      try {
        const parsed = JSON.parse(rawJson);
        const visit = (value) => {
          if (!value || typeof value !== "object") return value;
          if (Array.isArray(value)) return value.map(visit);

          const next = { ...value };
          if (next["@type"] === "ItemList" && Array.isArray(next.itemListElement)) {
            const originalLength = next.itemListElement.length;
            const filtered = next.itemListElement.filter((item) => {
              const candidate = item?.url || item?.item?.["@id"] || item?.item?.url;
              const route = normalizeRoute(candidate);
              return !route || !noindexRoutes.has(route);
            }).map((item, index) => ({ ...item, position: index + 1 }));
            next.itemListElement = filtered.map(visit);
            if (Number(next.numberOfItems) <= originalLength) next.numberOfItems = filtered.length;
          }
          for (const [key, child] of Object.entries(next)) {
            if (key === "itemListElement" && next["@type"] === "ItemList") continue;
            next[key] = visit(child);
          }
          return next;
        };
        return `${opening}${JSON.stringify(visit(parsed)).replace(/</g, "\\u003c")}${closing}`;
      } catch {
        return match;
      }
    },
  );
}

function correctRenderedFrench(html) {
  return html
    .replace(/(\d+) adresses actives est répertoriées sur cette page\./g, "$1 adresses actives sont répertoriées sur cette page.")
    .replace(/(\d+) adresses actives est répertoriée sur cette page\./g, "$1 adresses actives sont répertoriées sur cette page.");
}

function upsertJsonLd(html, value) {
  const tag = `<script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
  if (/<script\s+id=["']tok-page-json-ld["'][^>]*>[\s\S]*?<\/script>/i.test(html)) {
    return html.replace(/<script\s+id=["']tok-page-json-ld["'][^>]*>[\s\S]*?<\/script>/i, tag);
  }
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function enrichHome(html, cityDocuments, restaurantCount) {
  const topCities = cityDocuments.slice(0, MAX_HOME_CITIES);
  const cityItems = topCities.map((document) => {
    const label = cityLabelFromDocument(document);
    return document.inventory > 0 ? `${label} — ${document.inventory} adresses` : label;
  });
  const links = topCities.map((document) => ({
    href: document.route,
    label: `Restaurants à ${cityLabelFromDocument(document)}`,
  }));
  return replaceSectionById(html, "tok-prerendered-content", renderPrerenderedContent({
    heading: "Réservez un restaurant à Genève et dans les communes couvertes par TOK",
    paragraphs: [
      `TOK publie uniquement les pages locales qui disposent d'un inventaire suffisamment riche. ${cityDocuments.length} communes sont actuellement éligibles à l'indexation.`,
      `${restaurantCount} fiches restaurant indexables sont reliées aux pages de ville, de cuisine et de recherche afin d'aider Google comme les utilisateurs à découvrir les bonnes adresses.`,
    ],
    sections: [
      {
        heading: "Recherches populaires",
        items: ["Réservation restaurant", "Restaurant à Genève", "Meilleurs restaurants", "Restaurant pas cher", "Pizzeria", "Restaurant italien", "Sushi", "Brunch"],
      },
      { heading: "Communes avec inventaire public", items: cityItems },
    ],
    links,
  }));
}

function enrichSearch(html, cityDocuments, specializedDocuments, restaurantCount) {
  const cities = cityDocuments.slice(0, MAX_SEARCH_CITIES);
  const specialized = specializedDocuments.slice(0, MAX_SEARCH_SPECIALIZED);
  const links = [
    ...cities.map((document) => ({ href: document.route, label: `Restaurants à ${cityLabelFromDocument(document)}` })),
    ...specialized.map((document) => ({ href: document.route, label: localLabelFromDocument(document) })),
  ];
  const rendered = replaceSectionById(html, "tok-prerendered-content", renderPrerenderedContent({
    heading: "Trouvez un restaurant par commune, cuisine et besoin",
    paragraphs: [
      `Le catalogue TOK relie ${restaurantCount} fiches indexables à ${cityDocuments.length} pages de communes disposant d'un inventaire public suffisant.`,
      "Commencez par une commune, puis affinez avec une cuisine ou une intention locale. Les pages sans inventaire suffisant restent volontairement hors de l'index Google.",
    ],
    sections: [
      {
        heading: "Communes disponibles",
        items: cities.map((document) => `${cityLabelFromDocument(document)} — ${document.inventory} adresses`),
      },
      {
        heading: "Cuisines et recherches locales",
        items: specialized.map((document) => `${localLabelFromDocument(document)} — ${document.inventory} adresses`),
      },
    ],
    links,
  }));
  return upsertJsonLd(rendered, {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Recherche restaurants TOK",
    url: "https://www.thetok.ch/recherche",
    description: "Annuaire public TOK par commune, cuisine et intention locale.",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: cities.length,
      itemListElement: cities.slice(0, 50).map((document, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `Restaurants à ${cityLabelFromDocument(document)}`,
        url: `https://www.thetok.ch${document.route}`,
      })),
    },
  });
}

function enrichActualites(html, actualiteDocuments) {
  const latest = actualiteDocuments.slice(0, MAX_ACTUALITES_LINKS);
  const links = latest.map((document) => ({ href: document.route, label: document.title.replace(/\s*\|\s*TOK\s*$/i, "") }));
  const rendered = replaceSectionById(html, "tok-prerendered-content", renderPrerenderedContent({
    heading: "Actualités des restaurants sur TOK",
    paragraphs: [
      `${actualiteDocuments.length} publications suffisamment détaillées sont actuellement ouvertes à l'indexation.`,
      "Les publications trop courtes restent hors de l'index afin de privilégier des pages utiles, contextualisées et reliées à l'écosystème restaurant TOK.",
    ],
    sections: latest.length > 0 ? [{
      heading: "Publications récentes",
      items: latest.map((document) => document.title.replace(/\s*\|\s*TOK\s*$/i, "")),
    }] : [],
    links: [...links, { href: "/recherche", label: "Rechercher un restaurant" }],
  }));
  return upsertJsonLd(rendered, {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Actualités des restaurants TOK",
    url: "https://www.thetok.ch/actualites",
    description: "Les publications, nouveautés, offres et événements des restaurants présents sur TOK.",
    hasPart: latest.map((document) => ({
      "@type": "Article",
      url: `https://www.thetok.ch${document.route}`,
      name: document.title.replace(/\s*\|\s*TOK\s*$/i, ""),
    })),
  });
}

export async function optimizeSeoCrawl({ distDir = DIST_DIR } = {}) {
  const effectiveDist = path.resolve(distDir);
  if (effectiveDist !== DIST_DIR) {
    throw new Error("SEO_DIST_DIR doit être défini avant le chargement du module pour utiliser un autre dossier.");
  }

  const files = await collectIndexFiles(DIST_DIR);
  const documents = [];
  for (const filePath of files) {
    const route = routeFromFile(filePath);
    if (!route) continue;
    const html = await readFile(filePath, "utf8");
    documents.push({
      filePath,
      route,
      html,
      title: readTitle(html),
      heading: readHeading(html),
      inventory: inventoryFromJsonLd(html),
      noindex: isNoindex(html),
      publishedAt: readMeta(html, "property", "article:published_time"),
    });
  }

  const noindexRoutes = new Set(documents.filter((document) => document.noindex).map((document) => document.route));
  const indexable = documents.filter((document) => !document.noindex);
  const cityDocuments = indexable
    .filter((document) => isCityRoute(document.route))
    .sort((left, right) => right.inventory - left.inventory || left.route.localeCompare(right.route));
  const specializedDocuments = indexable
    .filter((document) => isSpecializedLocalRoute(document.route))
    .sort((left, right) => right.inventory - left.inventory || left.route.localeCompare(right.route));
  const actualiteDocuments = indexable
    .filter((document) => isActualiteRoute(document.route))
    .sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) || left.route.localeCompare(right.route));
  const restaurantCount = indexable.filter((document) => isRestaurantRoute(document.route)).length;

  for (const document of documents) {
    let html = document.html;
    if (document.route === "/") html = enrichHome(html, cityDocuments, restaurantCount);
    if (document.route === "/recherche") html = enrichSearch(html, cityDocuments, specializedDocuments, restaurantCount);
    if (document.route === "/actualites") html = enrichActualites(html, actualiteDocuments);
    html = pruneKnownNoindexLinks(html, noindexRoutes);
    html = pruneKnownNoindexJsonLd(html, noindexRoutes);
    html = correctRenderedFrench(html);
    if (html !== document.html) await writeFile(document.filePath, html, "utf8");
  }

  console.log(
    `SEO crawl hardening ready: ${documents.length} route(s), ${noindexRoutes.size} noindex route(s), `
      + `${cityDocuments.length} indexable city page(s), ${restaurantCount} indexable restaurant page(s).`,
  );
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href
  : false;

if (invokedDirectly) {
  optimizeSeoCrawl().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
