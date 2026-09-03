import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const TEMPLATE_RELEASE_DATE = "2026-09-03";
const ROOT_TITLE = "TOK - Restaurants à Genève : adresses, réservation et commande";
const ROOT_DESCRIPTION = "Trouvez des restaurants à Genève et dans les communes genevoises. Comparez cuisines et adresses, puis réservez ou commandez lorsque le service est activé.";
const SEARCH_TITLE = "Recherche de restaurants à Genève | TOK";
const SEARCH_DESCRIPTION = "Recherchez un restaurant à Genève et dans les communes genevoises par ville, cuisine, note, offre ou service réellement disponible sur TOK.";
const GENERIC_STRUCTURED_IMAGE_PATHS = new Set([
  "/fond3.png",
  "/images/kebab-box-spread.jpeg",
  "/placeholder.svg",
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function canonicalRoute(html) {
  const match = String(html).match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || String(html).match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (!match) return null;
  try {
    return new URL(match[1], "https://www.thetok.ch").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

function replaceTitle(html, value) {
  const safe = escapeAttribute(value);
  return String(html).replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
}

function replaceMetaContent(html, attribute, key, value) {
  const wanted = new RegExp(`${escapeRegExp(attribute)}=["']${escapeRegExp(key)}["']`, "i");
  return String(html).replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!wanted.test(tag)) return tag;
    const safe = escapeAttribute(value);
    if (/\bcontent=["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\bcontent=["'][^"']*["']/i, `content="${safe}"`);
    }
    return tag.replace(/\s*\/>$/, ` content="${safe}" />`).replace(/>$/, ` content="${safe}">`);
  });
}

function replaceSeoCopy(html, title, description) {
  let output = replaceTitle(html, title);
  for (const [attribute, key] of [
    ["name", "description"],
    ["property", "og:title"],
    ["property", "og:description"],
    ["name", "twitter:title"],
    ["name", "twitter:description"],
  ]) {
    output = replaceMetaContent(
      output,
      attribute,
      key,
      key.endsWith("title") ? title : description,
    );
  }
  output = replaceMetaContent(output, "property", "og:image:alt", title);
  output = replaceMetaContent(output, "name", "twitter:image:alt", title);
  return output;
}

function isGenericStructuredImage(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value, "https://www.thetok.ch");
    return url.hostname === "www.thetok.ch" && GENERIC_STRUCTURED_IMAGE_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function sanitizeImageValue(value) {
  if (typeof value === "string") return isGenericStructuredImage(value) ? undefined : value;
  if (Array.isArray(value)) {
    const filtered = value
      .map((item) => sanitizeImageValue(item))
      .filter((item) => item !== undefined && item !== null);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (value && typeof value === "object") {
    if (isGenericStructuredImage(value.url)) return undefined;
    return sanitizeStructuredData(value);
  }
  return value;
}

export function sanitizeStructuredData(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredData(item)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "image" || key === "primaryImageOfPage") {
      const sanitized = sanitizeImageValue(item);
      if (sanitized !== undefined) output[key] = sanitized;
      continue;
    }
    if (key === "priceRange" && typeof item === "string" && /^CHF(?: CHF){0,3}$/.test(item.trim())) {
      output[key] = "$".repeat(item.trim().split(/\s+/).length);
      continue;
    }
    output[key] = sanitizeStructuredData(item);
  }
  return output;
}

function sanitizeJsonLdScript(html) {
  return String(html).replace(
    /(<script\b[^>]*id=["']tok-page-json-ld["'][^>]*>)([\s\S]*?)(<\/script>)/i,
    (full, opening, body, closing) => {
      try {
        const parsed = JSON.parse(body);
        return `${opening}${JSON.stringify(sanitizeStructuredData(parsed))}${closing}`;
      } catch {
        return full;
      }
    },
  );
}

function neutralizeLocalCopy(html, route) {
  if (!/^\/restaurants\/[^/]+(?:\/[^/]+)?$/.test(route) || /\/r\//.test(route)) return html;

  let output = String(html);
  const segment = route.split("/").filter(Boolean)[2] || "";
  const isIntent = ["reservation", "pas-cher", "meilleurs"].includes(segment);

  if (!segment) {
    const titleMatch = output.match(/<title>Restaurant à ([^<]+?) : réserver une table \| TOK<\/title>/i);
    if (titleMatch) {
      const city = titleMatch[1].trim();
      const title = `Restaurants à ${city} : bonnes adresses | TOK`;
      const description = `Trouvez des restaurants à ${city} : cuisines, adresses et services renseignés. Réservation ou commande uniquement lorsque ces services sont activés sur TOK.`;
      output = replaceSeoCopy(output, title, description);
    }
    output = output.replace(
      /Restaurants à ([^<]+?) : réservation, commande et bonnes adresses/g,
      "Restaurants à $1 : adresses, cuisines et services disponibles",
    );
  } else if (!isIntent) {
    const pizzaTitle = output.match(/<title>Pizzeria à ([^<]+?) : les meilleures adresses \| TOK<\/title>/i);
    if (pizzaTitle) {
      const city = pizzaTitle[1].trim();
      output = replaceSeoCopy(
        output,
        `Pizzerias à ${city} : adresses et services | TOK`,
        `Trouvez une pizzeria à ${city}, comparez les adresses et consultez les services réellement renseignés sur TOK.`,
      );
    } else {
      output = output.replace(
        /(content=["'])Trouvez les restaurants ([^"']+?) à ([^"']+?) sur TOK : réservation, commande, retrait, livraison et offres locales\.(["'])/gi,
        "$1Trouvez les restaurants $2 à $3 sur TOK : adresses et services réellement renseignés.$4",
      );
      output = output.replace(
        /(content=["'])Découvrez les restaurants proches de ([^"']+?) à ([^"']+?) : bonnes adresses, réservation, commande et offres locales sur TOK\.(["'])/gi,
        "$1Découvrez les restaurants proches de $2 à $3 : adresses et services réellement renseignés sur TOK.$4",
      );
    }

    output = output
      .replace(/Pizzerias à ([^<]+?) : les meilleures adresses à réserver/g, "Pizzerias à $1 : adresses et services disponibles")
      .replace(/Restaurants ([^<]+?) à ([^<]+?) : commander et réserver/g, "Restaurants $1 à $2 : adresses et services disponibles");
  }

  return output;
}

function hardenNoindexLocalPage(html, route) {
  if (!route.startsWith("/restaurants/") || /\/r\//.test(route)) return html;
  if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["']noindex,[^"']*["'][^>]*>/i.test(html)
    && !/<meta\b[^>]*content=["']noindex,[^"']*["'][^>]*name=["']robots["'][^>]*>/i.test(html)) {
    return html;
  }
  return replaceMetaContent(html, "name", "robots", "noindex,nofollow,noarchive");
}

export function applySeoTrustSignalsToHtml(html, explicitRoute) {
  const route = explicitRoute || canonicalRoute(html);
  if (!route) return String(html);

  let output = String(html);
  if (route === "/") {
    output = replaceSeoCopy(output, ROOT_TITLE, ROOT_DESCRIPTION);
    output = output.replace(
      /Réservez un restaurant à Genève et dans les communes couvertes par TOK/g,
      "Restaurants à Genève et dans les communes genevoises",
    );
  } else if (route === "/recherche") {
    output = replaceSeoCopy(output, SEARCH_TITLE, SEARCH_DESCRIPTION);
  }

  output = neutralizeLocalCopy(output, route);
  output = hardenNoindexLocalPage(output, route);
  output = sanitizeJsonLdScript(output);
  return output;
}

function maxIsoDate(left, right) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(left || "")) return right;
  return left >= right ? left : right;
}

function floorLastmodInBlock(block, floor) {
  if (/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/i.test(block)) {
    return block.replace(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/i, (_full, date) => `<lastmod>${maxIsoDate(date, floor)}</lastmod>`);
  }
  return block.replace(/(<loc>[^<]+<\/loc>)/i, `$1\n    <lastmod>${floor}</lastmod>`);
}

export function applyTemplateLastmodFloor(xml, { allUrls = false, locPatterns = [] } = {}) {
  const patterns = locPatterns.map((pattern) => pattern instanceof RegExp ? pattern : new RegExp(escapeRegExp(pattern)));
  return String(xml).replace(/<(url|sitemap)>[\s\S]*?<\/\1>/gi, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1] || "";
    if (!allUrls && !patterns.some((pattern) => pattern.test(loc))) return block;
    return floorLastmodInBlock(block, TEMPLATE_RELEASE_DATE);
  });
}

async function listHtmlFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listHtmlFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(absolute);
  }
  return files;
}

async function rewriteFile(filePath, transform) {
  try {
    const before = await readFile(filePath, "utf8");
    const after = transform(before);
    if (after === before) return false;
    await writeFile(filePath, after, "utf8");
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function hardenSeoTrustSignals({ distDir = DIST_DIR } = {}) {
  const htmlFiles = await listHtmlFiles(distDir);
  let changedHtml = 0;
  for (const filePath of htmlFiles) {
    if (await rewriteFile(filePath, (html) => applySeoTrustSignalsToHtml(html))) changedHtml += 1;
  }

  const restaurantSitemap = path.join(distDir, "sitemap-restaurants.xml");
  const pagesSitemap = path.join(distDir, "sitemap-pages.xml");
  const sitemapIndex = path.join(distDir, "sitemap.xml");

  const restaurantChanged = await rewriteFile(
    restaurantSitemap,
    (xml) => applyTemplateLastmodFloor(xml, { allUrls: true }),
  );
  const pagesChanged = await rewriteFile(
    pagesSitemap,
    (xml) => applyTemplateLastmodFloor(xml, {
      locPatterns: [
        /^https:\/\/www\.thetok\.ch\/$/,
        /^https:\/\/www\.thetok\.ch\/recherche$/,
      ],
    }),
  );
  const indexChanged = await rewriteFile(
    sitemapIndex,
    (xml) => applyTemplateLastmodFloor(xml, {
      locPatterns: [
        /\/sitemap-restaurants\.xml$/,
        /\/sitemap-pages\.xml$/,
      ],
    }),
  );

  console.log(
    `[seo-trust] ${changedHtml} HTML file(s) updated; sitemap restaurants=${restaurantChanged}, pages=${pagesChanged}, index=${indexChanged}.`,
  );
  return { changedHtml, restaurantChanged, pagesChanged, indexChanged };
}

export const __seoTrustInternals = {
  ROOT_TITLE,
  ROOT_DESCRIPTION,
  SEARCH_TITLE,
  SEARCH_DESCRIPTION,
  TEMPLATE_RELEASE_DATE,
  canonicalRoute,
  isGenericStructuredImage,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenSeoTrustSignals().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
