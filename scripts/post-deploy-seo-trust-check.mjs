import { pathToFileURL } from "node:url";

const ORIGIN = String(process.env.TOK_PUBLIC_ORIGIN || "https://www.thetok.ch").replace(/\/+$/, "");
const TIMEOUT_MS = Math.max(2000, Number(process.env.POST_DEPLOY_TIMEOUT_MS || 15000) || 15000);

async function fetchHtml(route) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ORIGIN}${route}`, {
      redirect: "follow",
      headers: { "user-agent": "TOK-SEO-Trust-PostDeploy/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) throw new Error(`${label}: missing ${JSON.stringify(needle)}`);
}

function assertExcludes(haystack, needle, label) {
  if (haystack.includes(needle)) throw new Error(`${label}: unexpected ${JSON.stringify(needle)}`);
}

function jsonLdPayload(html) {
  const match = html.match(/<script\b[^>]*id=["']tok-page-json-ld["'][^>]*>([\s\S]*?)<\/script>/i);
  return match?.[1] || "";
}

export async function runSeoTrustPostDeployCheck() {
  const [home, search, carouge, lausanne, detail, sitemap] = await Promise.all([
    fetchHtml("/"),
    fetchHtml("/recherche"),
    fetchHtml("/restaurants/carouge"),
    fetchHtml("/restaurants/lausanne"),
    fetchHtml("/restaurants/carouge/r/le-jardin-de-pinchat"),
    fetchHtml("/sitemap.xml"),
  ]);

  assertIncludes(home, "TOK - Restaurants à Genève : adresses, réservation et commande", "home title");
  assertIncludes(home, "Restaurants à Genève et dans les communes genevoises", "home heading");
  assertExcludes(home, "restaurant en Suisse", "home scope");

  assertIncludes(search, "Recherche de restaurants à Genève | TOK", "search title");
  assertExcludes(search, "Suisse romande", "search scope");

  assertIncludes(carouge, "Restaurants à Carouge : bonnes adresses | TOK", "Carouge title");
  assertIncludes(carouge, "adresses, cuisines et services disponibles", "Carouge heading");
  assertExcludes(carouge, "réserver une table | TOK", "Carouge claim");

  assertIncludes(lausanne, 'content="noindex,nofollow,noarchive"', "empty local robots");

  const detailJsonLd = jsonLdPayload(detail);
  if (!detailJsonLd) throw new Error("restaurant detail: JSON-LD missing");
  assertExcludes(detailJsonLd, "fond3.png", "restaurant structured image");
  assertExcludes(detailJsonLd, "kebab-box-spread.jpeg", "restaurant structured image fallback");
  assertExcludes(detailJsonLd, "CHF CHF", "restaurant priceRange");
  assertIncludes(detailJsonLd, '"priceRange":"$$"', "restaurant priceRange");

  assertIncludes(sitemap, "<lastmod>2026-09-03</lastmod>", "sitemap template lastmod floor");

  console.log("[post-deploy-seo-trust] OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeoTrustPostDeployCheck().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
