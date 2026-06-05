import { readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const CANONICAL_ORIGIN = "https://www.thetok.ch";
const DEFAULT_IMAGE = `${CANONICAL_ORIGIN}/fond3.png`;
const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, "dist");
const PUBLIC_DIR = path.resolve(ROOT, "public");
const PUBLIC_ONLY = process.argv.includes("--public-only");
const MAX_DYNAMIC_RESTAURANTS = Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 500);

const STATIC_LOCAL_PAGES = [
  ["geneve", "Genève"],
  ["lausanne", "Lausanne"],
  ["geneve/pizza", "Pizza à Genève"],
  ["geneve/sushi", "Sushi à Genève"],
  ["geneve/burger", "Burger à Genève"],
  ["geneve/kebab", "Kebab à Genève"],
  ["lausanne/italien", "Restaurants italiens à Lausanne"],
  ["lausanne/asiatique", "Restaurants asiatiques à Lausanne"],
];

const PUBLIC_SEO_PAGES = [
  {
    path: "/",
    title: "TOK - Réservez, commandez et profitez des meilleures offres food à Genève",
    description:
      "Avec TOK, trouvez un restaurant, réservez, commandez, profitez d'offres locales et cumulez des Miamz solidaires en Suisse romande.",
    priority: "1.0",
    changefreq: "daily",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "TOK",
        url: CANONICAL_ORIGIN,
        logo: `${CANONICAL_ORIGIN}/logo.png`,
        areaServed: ["Genève", "Lausanne", "Suisse romande"],
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "TOK",
        url: CANONICAL_ORIGIN,
        potentialAction: {
          "@type": "SearchAction",
          target: `${CANONICAL_ORIGIN}/recherche?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  },
  {
    path: "/recherche",
    title: "Recherche restaurants à Genève et en Suisse romande | TOK",
    description:
      "Recherchez un restaurant par ville, cuisine, offre, note ou mode de service avec TOK.",
    priority: "0.9",
    changefreq: "daily",
  },
  ...STATIC_LOCAL_PAGES.map(([slug, label]) => {
    const [citySlug, categorySlug] = slug.split("/");
    const city = citySlug === "geneve" ? "Genève" : "Lausanne";
    const isCategory = Boolean(categorySlug);
    return {
      path: `/restaurants/${slug}`,
      title: isCategory ? `${label} | TOK` : `Restaurants à ${city} | TOK`,
      description: isCategory
        ? `Découvrez les meilleures adresses ${label.toLowerCase()} avec réservation, commande, offres locales et Miamz solidaires sur TOK.`
        : `Découvrez les restaurants disponibles à ${city} : réservation, commande, anti-gaspi, ventes flash et offres locales sur TOK.`,
      priority: isCategory ? "0.8" : "0.9",
      changefreq: isCategory ? "weekly" : "daily",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: isCategory ? label : `Restaurants à ${city}`,
        url: `${CANONICAL_ORIGIN}/restaurants/${slug}`,
      },
    };
  }),
  {
    path: "/anti-gaspi",
    title: "Offres anti-gaspi à Genève | TOK",
    description:
      "Sauvez des invendus, profitez d'offres limitées et aidez les restaurants locaux à réduire le gaspillage alimentaire.",
    priority: "0.8",
    changefreq: "daily",
  },
  {
    path: "/ventes-flash",
    title: "Ventes flash food en Suisse romande | TOK",
    description:
      "Retrouvez les offres limitées des restaurants partenaires TOK pour commander ou réserver au bon moment.",
    priority: "0.8",
    changefreq: "daily",
  },
  {
    path: "/tok-one",
    title: "Tok One - abonnement food, avantages et Miamz | TOK",
    description:
      "Découvrez Tok One, l'abonnement TOK pour profiter d'avantages food, d'offres locales et de Miamz solidaires.",
    priority: "0.7",
    changefreq: "weekly",
  },
  {
    path: "/packs-restaurateur",
    title: "Packs restaurateurs TOK - visibilité, photos IA et réservation",
    description:
      "Rejoignez TOK avec des packs de lancement pour créer votre fiche, améliorer vos photos, gérer vos offres et attirer plus de clients.",
    priority: "0.8",
    changefreq: "weekly",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Packs restaurateurs TOK",
      provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
      areaServed: "Suisse romande",
    },
  },
  {
    path: "/restaurateurs/geneve",
    title: "Solution de réservation et marketing pour restaurants à Genève | TOK",
    description:
      "TOK aide les restaurants genevois à recevoir des réservations, vendre leurs offres, améliorer leurs photos et réduire leurs frais.",
    priority: "0.8",
    changefreq: "weekly",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Solution de réservation et marketing pour restaurants à Genève",
      provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
      areaServed: { "@type": "City", name: "Genève", addressCountry: "CH" },
      serviceType: "Réservation, marketing local, offres restaurant et outils opérationnels",
    },
  },
  {
    path: "/zero-attente",
    title: "Zéro attente restaurant | TOK",
    description:
      "Réservez, précommandez, payez et arrivez au bon moment avec le parcours Zéro attente TOK.",
    priority: "0.7",
    changefreq: "weekly",
  },
  {
    path: "/chefs-table",
    title: "La Table du Chef - offres exclusives restaurant | TOK",
    description:
      "Découvrez les plats off-menu, menus limités et expériences exclusives des restaurants partenaires TOK.",
    priority: "0.7",
    changefreq: "weekly",
  },
  {
    path: "/abonnement",
    title: "Abonnement repas et commandes récurrentes | TOK",
    description:
      "Planifiez vos repas récurrents, gagnez du temps et profitez d'avantages TOK sur vos habitudes food.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/creneaux-garantis",
    title: "Créneaux garantis pour vos commandes | TOK",
    description:
      "TOK vous aide à commander ou réserver avec des créneaux plus fiables et un suivi plus clair.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/garantie-qualite",
    title: "Garantie qualité restaurant | TOK",
    description:
      "Un parcours pensé pour garder les commandes traçables, les restaurants responsables et les clients rassurés.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/budget-auto",
    title: "Budget auto food | TOK",
    description:
      "Trouvez des restaurants et offres compatibles avec votre budget, vos préférences et vos objectifs.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/multi-restaurant",
    title: "Commande multi-restaurant | TOK",
    description:
      "Composez une expérience food plus flexible avec plusieurs restaurants et un parcours unifié.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/multi-stop",
    title: "Multi-stop food | TOK",
    description:
      "Regroupez plusieurs étapes et adresses dans un parcours food plus pratique.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/match-groupes",
    title: "Commandes de groupe et offres partagées | TOK",
    description:
      "Commandez à plusieurs, coordonnez les choix et profitez d'avantages de groupe avec TOK.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/flex-prix-bas",
    title: "Offres flexibles et prix bas | TOK",
    description:
      "Profitez de fenêtres flexibles, d'offres locales et de prix plus doux chez les restaurants partenaires.",
    priority: "0.6",
    changefreq: "weekly",
  },
  {
    path: "/a-propos",
    title: "À propos de TOK",
    description:
      "TOK est une plateforme food suisse qui connecte clients, restaurants, livreurs et impact solidaire.",
    priority: "0.5",
    changefreq: "monthly",
  },
  {
    path: "/contact",
    title: "Contact TOK",
    description:
      "Contactez l'équipe TOK pour une question client, restaurateur, livreur, partenariat ou support.",
    priority: "0.5",
    changefreq: "monthly",
  },
  {
    path: "/aide",
    title: "Aide TOK - commandes, réservations, Miamz et restaurateurs",
    description:
      "Consultez l'aide TOK pour comprendre les commandes, réservations, paiements, Miamz, dons solidaires et packs restaurateurs.",
    priority: "0.6",
    changefreq: "weekly",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Comment fonctionne TOK ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "TOK permet de rechercher des restaurants, réserver, commander, profiter d'offres locales et cumuler des Miamz.",
          },
        },
        {
          "@type": "Question",
          name: "Comment utiliser les Miamz ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Les Miamz peuvent servir à réduire une commande, être offerts ou participer à un objectif solidaire.",
          },
        },
      ],
    },
  },
  {
    path: "/cgu",
    title: "Conditions générales d'utilisation | TOK",
    description: "Consultez les conditions générales d'utilisation de TOK.",
    priority: "0.3",
    changefreq: "monthly",
  },
  {
    path: "/politique-confidentialite",
    title: "Politique de confidentialité | TOK",
    description: "Consultez la politique de confidentialité de TOK et les traitements de données associés.",
    priority: "0.3",
    changefreq: "monthly",
  },
];

const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/courier",
  "/profil",
  "/notifications",
  "/commandes",
  "/commande/",
  "/reservations",
  "/points-cadeau",
  "/panier",
  "/auth",
];

function normalizePath(routePath) {
  if (!routePath || routePath === "/") return "/";
  return `/${String(routePath).replace(/^\/+|\/+$/g, "")}`;
}

function canonicalUrl(routePath) {
  const normalized = normalizePath(routePath);
  return normalized === "/" ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${normalized}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function isIndexablePath(routePath) {
  const normalized = normalizePath(routePath);
  return !PRIVATE_ROUTE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupePages(pages) {
  const byPath = new Map();
  for (const page of pages) {
    const normalized = normalizePath(page.path);
    if (!isIndexablePath(normalized)) continue;
    if (!byPath.has(normalized)) {
      byPath.set(normalized, { ...page, path: normalized });
    }
  }
  return [...byPath.values()].sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });
}

function loadPublicEnvFiles() {
  const candidates = [".env.production.local", ".env.production", ".env.local", ".env"];
  for (const fileName of candidates) {
    try {
      const filePath = path.resolve(ROOT, fileName);
      const content = readFileSync(filePath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // Local env files are optional. Production CI provides public VITE_* variables directly.
    }
  }
}

async function collectDynamicRestaurantPages() {
  loadPublicEnvFiles();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, city, cuisine_type, image_url, rating, review_count, updated_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(MAX_DYNAMIC_RESTAURANTS);

    if (error || !Array.isArray(data)) return [];

    const cityCategoryPages = new Map();
    const restaurantPages = data
      .filter((restaurant) => restaurant?.id && restaurant?.name)
      .flatMap((restaurant) => {
        const city = String(restaurant.city || "Genève").trim() || "Genève";
        const citySlug = slugify(city);
        const cuisine = String(restaurant.cuisine_type || "").trim();
        const cuisineSlug = slugify(cuisine);
        if (citySlug) {
          cityCategoryPages.set(`/restaurants/${citySlug}`, {
            path: `/restaurants/${citySlug}`,
            title: `Restaurants à ${city} | TOK`,
            description: `Découvrez les restaurants disponibles à ${city} avec réservation, commande, offres locales et Miamz solidaires sur TOK.`,
            priority: "0.8",
            changefreq: "daily",
            lastmod: restaurant.updated_at,
          });
        }
        if (citySlug && cuisineSlug) {
          cityCategoryPages.set(`/restaurants/${citySlug}/${cuisineSlug}`, {
            path: `/restaurants/${citySlug}/${cuisineSlug}`,
            title: `${cuisine} à ${city} | TOK`,
            description: `Découvrez les restaurants ${cuisine} à ${city} avec réservation, commande et offres locales sur TOK.`,
            priority: "0.7",
            changefreq: "weekly",
            lastmod: restaurant.updated_at,
          });
        }
        return [
          {
            path: `/restaurant/${restaurant.id}`,
            title: `${restaurant.name} | Restaurant sur TOK`,
            description: `${restaurant.name} sur TOK : ${cuisine || "restaurant"} à ${city}, réservation, commande et offres locales.`,
            priority: "0.7",
            changefreq: "weekly",
            lastmod: restaurant.updated_at,
            image: restaurant.image_url || DEFAULT_IMAGE,
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "Restaurant",
              "@id": canonicalUrl(`/restaurant/${restaurant.id}`),
              name: restaurant.name,
              image: restaurant.image_url || undefined,
              servesCuisine: cuisine || undefined,
              address: {
                "@type": "PostalAddress",
                addressLocality: city,
                addressCountry: "CH",
              },
              aggregateRating: restaurant.rating
                ? {
                  "@type": "AggregateRating",
                  ratingValue: Number(restaurant.rating),
                  reviewCount: Number(restaurant.review_count || 0),
                }
                : undefined,
              url: canonicalUrl(`/restaurant/${restaurant.id}`),
            },
          },
        ];
      });

    return [...cityCategoryPages.values(), ...restaurantPages];
  } catch {
    return [];
  }
}

async function collectSeoPages() {
  const dynamicPages = await collectDynamicRestaurantPages();
  return dedupePages([...PUBLIC_SEO_PAGES, ...dynamicPages]);
}

function renderSitemap(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = pages.map((page) => {
    const lastmod = String(page.lastmod || today).slice(0, 10);
    return `  <url>
    <loc>${escapeXml(canonicalUrl(page.path))}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>${escapeXml(page.changefreq || "weekly")}</changefreq>
    <priority>${escapeXml(page.priority || "0.5")}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join("\n")}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /courier
Disallow: /profil
Disallow: /notifications
Disallow: /commandes
Disallow: /commande/
Disallow: /reservations
Disallow: /panier
Disallow: /auth

Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml
`;
}

function upsertTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function upsertTag(html, matcher, tag) {
  if (matcher.test(html)) return html.replace(matcher, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function renderPreRenderedHtml(baseHtml, page) {
  const canonical = canonicalUrl(page.path);
  const image = page.image || DEFAULT_IMAGE;
  let html = upsertTitle(baseHtml, page.title);
  html = upsertTag(html, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(page.description)}" />`);
  html = upsertTag(html, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  html = upsertTag(html, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(page.title)}" />`);
  html = upsertTag(html, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(page.description)}" />`);
  html = upsertTag(html, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  html = upsertTag(html, /<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${escapeHtml(image)}" />`);
  html = upsertTag(html, /<meta\s+property="og:image:alt"[^>]*>/i, `<meta property="og:image:alt" content="${escapeHtml(page.title)}" />`);
  html = upsertTag(html, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`);
  html = upsertTag(html, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`);
  html = upsertTag(html, /<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${escapeHtml(image)}" />`);
  html = upsertTag(html, /<meta\s+name="twitter:image:alt"[^>]*>/i, `<meta name="twitter:image:alt" content="${escapeHtml(page.title)}" />`);
  html = html.replace(/\s*<script\s+id="tok-page-json-ld"[\s\S]*?<\/script>/i, "");
  if (page.jsonLd) {
    html = html.replace(
      /<\/head>/i,
      `  <script id="tok-page-json-ld" type="application/ld+json">${escapeJsonForHtml(page.jsonLd)}</script>\n</head>`,
    );
  }
  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root"></div><noscript><main><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p></main></noscript>`,
  );
  return html;
}

function outputPathForRoute(routePath) {
  const normalized = normalizePath(routePath);
  if (normalized === "/") return path.join(DIST_DIR, "index.html");
  return path.join(DIST_DIR, normalized.slice(1), "index.html");
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeIfDirectoryExists(directory, fileName, content) {
  if (!(await exists(directory))) return;
  await writeFile(path.join(directory, fileName), content, "utf8");
}

async function main() {
  const pages = await collectSeoPages();
  const sitemap = renderSitemap(pages);
  const robots = renderRobots();

  await writeIfDirectoryExists(PUBLIC_DIR, "sitemap.xml", sitemap);
  await writeIfDirectoryExists(PUBLIC_DIR, "robots.txt", robots);

  if (!PUBLIC_ONLY) {
    const baseIndexPath = path.join(DIST_DIR, "index.html");
    const baseHtml = await readFile(baseIndexPath, "utf8");
    await writeIfDirectoryExists(DIST_DIR, "sitemap.xml", sitemap);
    await writeIfDirectoryExists(DIST_DIR, "robots.txt", robots);

    for (const page of pages) {
      const outPath = outputPathForRoute(page.path);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, renderPreRenderedHtml(baseHtml, page), "utf8");
    }
  }

  console.log(`SEO prerender ready: ${pages.length} public route(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
