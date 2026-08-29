#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return updated


page_path = ROOT / "src/pages/RestaurantDetail.tsx"
page = page_path.read_text(encoding="utf-8")

page = replace_once(
    page,
    'import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";',
    'import { Link, useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";',
    "react-router Link import",
)
page = replace_once(
    page,
    'import { buildCanonicalUrl, useSeoMeta } from "@/hooks/useSeoMeta";',
    'import { useSeoMeta } from "@/hooks/useSeoMeta";',
    "remove duplicate canonical helper",
)
page = replace_once(
    page,
    'import { buildRestaurantSeoPath } from "@/lib/restaurantSlugs";',
    'import { buildRestaurantSeoPath } from "@/lib/restaurantSlugs";\nimport { buildRestaurantSeoModel } from "@/lib/seo/restaurantEntity.mjs";',
    "shared restaurant entity import",
)
page = regex_replace_once(
    page,
    r'\nfunction buildRestaurantDetailJsonLd\(\{.*?\n\}\n\ntype RestaurantDetailProps',
    '\n\ntype RestaurantDetailProps',
    "remove legacy restaurant JSON-LD builder",
)
page = regex_replace_once(
    page,
    r'  const seoTitle = restaurant\n.*?  useSeoMeta\(\{.*?\n  \}\);\n\n  useEffect\(\(\) => \{',
    '  const restaurantSeoModel = useMemo(\n    () => buildRestaurantSeoModel({\n      restaurant,\n      canonicalPath: restaurantCanonicalPath,\n      heroImage,\n      images: mediaPhotos || [],\n      menuItems: menuItems || [],\n      reviews: reviews || [],\n      amenities: amenityOptions,\n      averageRating: avgRating10,\n      reviewCount,\n    }),\n    [\n      amenityOptions,\n      avgRating10,\n      heroImage,\n      mediaPhotos,\n      menuItems,\n      restaurant,\n      restaurantCanonicalPath,\n      reviewCount,\n      reviews,\n    ],\n  );\n  const seoTitle = restaurantSeoModel?.title\n    || (restaurantNotFound ? "Restaurant introuvable | TOK" : "Restaurant TOK | TheTok");\n  const seoDescription = restaurantSeoModel?.description\n    || (restaurantNotFound\n      ? "Ce restaurant n\'est pas disponible sur TOK."\n      : "Fiche restaurant TOK avec les informations et services réellement disponibles.");\n  const restaurantOpeningHoursRows = restaurantSeoModel?.openingHoursRows || [];\n  const restaurantLastUpdatedLabel = restaurantSeoModel?.lastUpdatedLabel;\n  const restaurantCityPath = restaurantSeoModel?.cityPath || "/recherche";\n\n  useSeoMeta({\n    title: seoTitle,\n    description: seoDescription,\n    path: restaurantCanonicalPath,\n    image: restaurantSeoModel?.image || heroImage,\n    robots: restaurantNotFound || isCommercialDemoClient\n      ? "noindex,nofollow,noarchive"\n      : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",\n    jsonLd: restaurantSeoModel?.jsonLd || null,\n  });\n\n  useEffect(() => {',
    "replace restaurant SEO model",
)
page = replace_once(
    page,
    '      <div className="container py-6 pb-24 md:py-8 lg:pb-8">\n        <div className="flex flex-col lg:flex-row gap-8">',
    '      <div className="container py-6 pb-24 md:py-8 lg:pb-8">\n        <nav aria-label="Fil d\'Ariane" className="mb-5 overflow-x-auto text-sm text-muted-foreground">\n          <ol className="flex min-w-max items-center gap-1.5">\n            <li><Link to="/" className="transition-colors hover:text-primary">Accueil</Link></li>\n            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>\n            <li>\n              <Link to={restaurantCityPath} className="transition-colors hover:text-primary">\n                {restaurant.city ? `Restaurants à ${restaurant.city}` : "Restaurants"}\n              </Link>\n            </li>\n            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>\n            <li className="max-w-[18rem] truncate font-medium text-foreground" aria-current="page">\n              {restaurant.name}\n            </li>\n          </ol>\n        </nav>\n        <div className="flex flex-col lg:flex-row gap-8">',
    "visible breadcrumb",
)
page = replace_once(
    page,
    '            <div className="rounded-2xl border bg-card/70 p-4 md:p-5">',
    '            <section\n              aria-labelledby="restaurant-data-freshness"\n              className="rounded-xl border bg-card/70 p-4"\n            >\n              <div className="flex items-start gap-3">\n                <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />\n                <div className="min-w-0 space-y-2">\n                  <h2 id="restaurant-data-freshness" className="font-semibold">\n                    Provenance et fraîcheur des informations\n                  </h2>\n                  <p className="text-sm text-muted-foreground">\n                    Informations issues de la fiche TOK et des contenus publiés pour cet établissement.\n                    {" "}\n                    {restaurantLastUpdatedLabel\n                      ? `Dernière mise à jour le ${restaurantLastUpdatedLabel}.`\n                      : "La date de dernière mise à jour n\'est pas renseignée."}\n                  </p>\n                  <p className="text-xs text-muted-foreground">\n                    {menuItems?.length || 0} plat{(menuItems?.length || 0) > 1 ? "s" : ""} ·{" "}\n                    {galleryPhotos.length} photo{galleryPhotos.length > 1 ? "s" : ""} ·{" "}\n                    {reviewCount} avis publié{reviewCount > 1 ? "s" : ""}.\n                    Les horaires et services sont affichés uniquement lorsqu\'ils sont renseignés.\n                  </p>\n                </div>\n              </div>\n            </section>\n            <div className="rounded-2xl border bg-card/70 p-4 md:p-5">',
    "visible freshness block",
)
page = regex_replace_once(
    page,
    r'\{\(\(\) => \{\n\s+const oh = restaurant\.opening_hours.*?\n\s+return <p className="text-sm text-muted-foreground">Lundi - Dimanche : 11h30 - 22h30</p>;\n\s+\}\)\(\)\}',
    '{restaurantOpeningHoursRows.length > 0 ? (\n                  <div className="space-y-1">\n                    {restaurantOpeningHoursRows.map((entry) => (\n                      <p key={entry.key} className="text-sm text-muted-foreground">\n                        <span className="font-medium text-foreground">{entry.label}</span> : {entry.hours}\n                      </p>\n                    ))}\n                  </div>\n                ) : (\n                  <p className="text-sm text-muted-foreground">\n                    Horaires non renseignés par l\'établissement.\n                  </p>\n                )}',
    "real restaurant hours",
)
page = replace_once(
    page,
    '                      <div className="flex-1 space-y-2">\n                        {[\n                          { label: "Ambiance", value: (Number(avgRating) * 0.95).toFixed(1) },\n                          { label: "Plats", value: avgRating },\n                          { label: "Service", value: (Number(avgRating) * 1.02 > 10 ? 10 : Number(avgRating) * 1.02).toFixed(1) },\n                        ].map((cat) => (\n                          <div key={cat.label} className="flex items-center gap-3">\n                            <span className="text-xs font-medium w-16">{cat.label}</span>\n                            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">\n                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(Number(cat.value) / 10) * 100}%` }} />\n                            </div>\n                            <span className="text-xs font-bold w-6 text-right">{cat.value}</span>\n                          </div>\n                        ))}\n                      </div>',
    '                      <div className="flex-1 space-y-3">\n                        <p className="text-sm leading-relaxed text-muted-foreground">\n                          Cette note globale est calculée uniquement à partir des avis publiés ci-dessous.\n                          TOK n\'affiche aucune sous-note lorsque les clients n\'ont pas évalué séparément\n                          l\'ambiance, les plats ou le service.\n                        </p>\n                        <div className="flex items-center gap-3">\n                          <span className="text-xs font-medium">Note globale</span>\n                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">\n                            <div\n                              className="h-full rounded-full bg-primary"\n                              style={{ width: `${Math.min(Math.max(Number(avgRating), 0), 10) * 10}%` }}\n                            />\n                          </div>\n                          <span className="text-xs font-bold">{avgRating}/10</span>\n                        </div>\n                        <button\n                          type="button"\n                          onClick={() => setActiveTab("avis")}\n                          className="text-sm font-semibold text-primary hover:underline"\n                        >\n                          Lire les avis publiés\n                        </button>\n                      </div>',
    "remove fabricated review sub-scores",
)
page = page.replace("avis vérifiés", "avis publiés")
page_path.write_text(page, encoding="utf-8")

prerender_path = ROOT / "scripts/prerender-seo.mjs"
prerender = prerender_path.read_text(encoding="utf-8")
prerender = replace_once(
    prerender,
    'import { createClient } from "@supabase/supabase-js";',
    'import { createClient } from "@supabase/supabase-js";\n\nimport { buildRestaurantSeoModel } from "../src/lib/seo/restaurantEntity.mjs";',
    "prerender shared entity import",
)
prerender = regex_replace_once(
    prerender,
    r'\nfunction buildPriceRange\(value\) \{.*?\n\}\n\nconst STRICT_DYNAMIC_SEO',
    '\nconst STRICT_DYNAMIC_SEO',
    "remove legacy price range builder",
)
prerender = replace_once(
    prerender,
    '"id, name, slug, city, cuisine_type, image_url, rating, review_count, updated_at, description, address, phone, price_range, opening_hours, supports_reservation, delivery_available, supports_pickup",',
    '"id, name, slug, city, cuisine_type, image_url, rating, review_count, updated_at, description, address, phone, price_range, opening_hours, supports_reservation, delivery_available, supports_pickup, supports_dinein, latitude, longitude, amenities",',
    "restaurant SEO source fields",
)
prerender = regex_replace_once(
    prerender,
    r'      const restaurantDescription = restaurant\.description \|\|\n.*?\n      \};\n    \}\);',
    '      const restaurantSeo = buildRestaurantSeoModel({\n        restaurant,\n        canonicalPath: restaurantPath,\n        heroImage: restaurant.image_url || DEFAULT_IMAGE,\n        amenities: Array.isArray(restaurant.amenities) ? restaurant.amenities : [],\n        averageRating: restaurant.rating,\n        reviewCount: restaurant.review_count,\n      });\n      if (!restaurantSeo) {\n        throw new Error(`Fiche restaurant SEO invalide pour ${restaurant.id}`);\n      }\n\n      const sourceDescription = String(restaurant.description || "").replace(/\\s+/g, " ").trim();\n      const openingHoursItems = restaurantSeo.openingHoursRows.map(\n        (entry) => `${entry.label} : ${entry.hours}`,\n      );\n      const serviceItems = restaurantSeo.serviceLabels.length > 0\n        ? [`Services renseignés : ${restaurantSeo.serviceLabels.join(", ")}`]\n        : [];\n\n      return {\n        path: restaurantPath,\n        title: restaurantSeo.title,\n        description: restaurantSeo.description,\n        priority: "0.7",\n        changefreq: "weekly",\n        lastmod: restaurant.updated_at,\n        image: restaurantSeo.image || DEFAULT_IMAGE,\n        staticContent: {\n          heading: `${restaurant.name}, restaurant à ${city}`,\n          paragraphs: [\n            sourceDescription || restaurantSeo.description,\n            restaurantSeo.lastUpdatedLabel\n              ? `Informations issues de la fiche TOK. Dernière mise à jour le ${restaurantSeo.lastUpdatedLabel}.`\n              : "Informations issues de la fiche TOK. La date de dernière mise à jour n\'est pas renseignée.",\n          ],\n          sections: [\n            {\n              heading: "Informations pratiques",\n              items: [cuisine, restaurant.address, restaurant.phone, ...serviceItems].filter(Boolean),\n            },\n            openingHoursItems.length > 0\n              ? {\n                heading: "Horaires renseignés",\n                items: openingHoursItems,\n              }\n              : null,\n            {\n              heading: "Provenance et fraîcheur",\n              items: [\n                "Les horaires et services ne sont publiés que lorsqu\'ils sont renseignés.",\n                restaurantSeo.lastUpdatedLabel\n                  ? `Fiche actualisée le ${restaurantSeo.lastUpdatedLabel}`\n                  : "Date d\'actualisation non renseignée",\n              ],\n            },\n          ].filter(Boolean),\n          links: [\n            { href: `/restaurants/${citySlug}`, label: `Restaurants à ${city}` },\n            { href: "/recherche", label: "Rechercher un restaurant" },\n          ],\n        },\n        jsonLd: [restaurantSeo.jsonLd],\n      };\n    });',
    "shared prerender restaurant entity",
)
prerender_path.write_text(prerender, encoding="utf-8")

seo_dir = ROOT / "src/lib/seo"
seo_dir.mkdir(parents=True, exist_ok=True)
(seo_dir / "restaurantEntity.mjs").write_text("""const CANONICAL_ORIGIN = "https://www.thetok.ch";

const DAY_DEFINITIONS = [
  { keys: ["monday", "lundi"], label: "Lundi", schema: "https://schema.org/Monday" },
  { keys: ["tuesday", "mardi"], label: "Mardi", schema: "https://schema.org/Tuesday" },
  { keys: ["wednesday", "mercredi"], label: "Mercredi", schema: "https://schema.org/Wednesday" },
  { keys: ["thursday", "jeudi"], label: "Jeudi", schema: "https://schema.org/Thursday" },
  { keys: ["friday", "vendredi"], label: "Vendredi", schema: "https://schema.org/Friday" },
  { keys: ["saturday", "samedi"], label: "Samedi", schema: "https://schema.org/Saturday" },
  { keys: ["sunday", "dimanche"], label: "Dimanche", schema: "https://schema.org/Sunday" },
];

const SERVICE_DEFINITIONS = [
  { key: "lunch", label: "Déjeuner" },
  { key: "dinner", label: "Dîner" },
];

const MAX_META_TITLE_LENGTH = 68;
const MAX_META_DESCRIPTION_LENGTH = 158;
const MAX_SCHEMA_MENU_ITEMS = 36;
const MAX_SCHEMA_REVIEWS = 10;

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function truncateAtWord(value, maxLength) {
  const clean = cleanText(value);
  if (clean.length <= maxLength) return clean;
  const slice = clean.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = slice.lastIndexOf(" ");
  const shortened = lastSpace > Math.floor(maxLength * 0.65) ? slice.slice(0, lastSpace) : slice;
  return `${shortened.trimEnd()}…`;
}

function slugify(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toAbsoluteUrl(value) {
  const clean = cleanText(value);
  if (!clean) return null;

  try {
    const url = new URL(clean, `${CANONICAL_ORIGIN}/`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  const clean = cleanText(value);
  if (!clean) return null;
  const date = new Date(clean);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function formatUpdatedDate(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return null;

  return new Intl.DateTimeFormat("fr-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(new Date(normalized));
}

function parseTime(value) {
  const clean = cleanText(value);
  const match = clean.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function readTimeRange(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const clean = cleanText(value);
    if (!clean) return null;
    if (/^(ferme|fermé|closed)$/i.test(clean)) {
      return { label: "Fermé", closed: true, opens: null, closes: null };
    }

    const match = clean.match(/([01]\d|2[0-3]):([0-5]\d)\s*(?:-|–|—|à)\s*([01]\d|2[0-3]):([0-5]\d)/i);
    if (match) {
      const opens = `${match[1]}:${match[2]}`;
      const closes = `${match[3]}:${match[4]}`;
      return { label: `${opens}–${closes}`, closed: false, opens, closes };
    }

    return { label: clean, closed: false, opens: null, closes: null };
  }

  if (typeof value !== "object" || Array.isArray(value)) return null;

  const closed = value.closed === true
    || value.is_closed === true
    || value.service_closed === true
    || value.open === false;

  if (closed) {
    return { label: "Fermé", closed: true, opens: null, closes: null };
  }

  const opens = parseTime(value.opens ?? value.open ?? value.start_time ?? value.start);
  const closes = parseTime(value.closes ?? value.close ?? value.end_time ?? value.end);
  if (opens && closes) {
    return { label: `${opens}–${closes}`, closed: false, opens, closes };
  }

  const label = cleanText(value.label ?? value.hours ?? value.value);
  return label ? { label, closed: false, opens: null, closes: null } : null;
}

function parseOpeningHours(openingHours) {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) {
    return { rows: [], specifications: [] };
  }

  const rows = [];
  const specifications = [];

  for (const day of DAY_DEFINITIONS) {
    const key = day.keys.find((candidate) => Object.prototype.hasOwnProperty.call(openingHours, candidate));
    if (!key) continue;

    const rawRanges = Array.isArray(openingHours[key]) ? openingHours[key] : [openingHours[key]];
    const ranges = rawRanges.map(readTimeRange).filter(Boolean);
    if (ranges.length === 0) continue;

    rows.push({
      key: day.keys[0],
      label: day.label,
      hours: ranges.map((range) => range.label).join(", "),
    });

    for (const range of ranges) {
      if (!range.closed && range.opens && range.closes) {
        specifications.push({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: day.schema,
          opens: range.opens,
          closes: range.closes,
        });
      }
    }
  }

  const serviceSettings = openingHours.service_settings;
  if (serviceSettings && typeof serviceSettings === "object" && !Array.isArray(serviceSettings)) {
    for (const service of SERVICE_DEFINITIONS) {
      if (!Object.prototype.hasOwnProperty.call(serviceSettings, service.key)) continue;
      const range = readTimeRange(serviceSettings[service.key]);
      if (!range) continue;
      rows.push({
        key: `service-${service.key}`,
        label: service.label,
        hours: range.label,
      });
    }
  }

  return {
    rows,
    specifications,
  };
}

function parseCuisineLabels(value) {
  const source = Array.isArray(value) ? value : [value];
  const labels = source
    .flatMap((entry) => cleanText(entry).split(/[,;|/]/g))
    .map((entry) => entry.replace(/\s*\+\d+\s*$/, "").trim())
    .filter((entry) => entry && !/^\+\d+$/.test(entry));

  return unique(labels);
}

function normalizeAmenityLabels(value) {
  const source = Array.isArray(value) ? value : [];
  return unique(source.map((entry) => {
    if (typeof entry === "string") return cleanText(entry);
    if (entry && typeof entry === "object") return cleanText(entry.label ?? entry.name);
    return "";
  }));
}

function normalizeImageUrls(heroImage, images) {
  const candidates = [
    heroImage,
    ...(Array.isArray(images) ? images.map((image) => {
      if (typeof image === "string") return image;
      if (image && typeof image === "object") return image.media_url ?? image.image_url ?? image.url;
      return null;
    }) : []),
  ];

  return unique(candidates.map(toAbsoluteUrl).filter(Boolean));
}

function getPriceRange(value) {
  const numeric = toFiniteNumber(value);
  if (!numeric || numeric <= 0) return null;
  const level = Math.min(Math.max(Math.round(numeric), 1), 4);
  return Array.from({ length: level }, () => "CHF").join(" ");
}

function getServiceLabels(restaurant) {
  const services = [];
  if (restaurant.supports_reservation === true) services.push("réservation");
  if (restaurant.delivery_available === true) services.push("livraison");
  if (restaurant.supports_pickup === true) services.push("commande à emporter");
  if (restaurant.supports_dinein === true) services.push("service sur place");
  return services;
}

function buildTitle(restaurant, cuisines) {
  const name = cleanText(restaurant.name) || "Restaurant";
  const city = cleanText(restaurant.city);
  const cuisine = cuisines[0];
  const location = city ? ` à ${city}` : "";
  const qualifier = cuisine ? ` – ${cuisine}` : "";
  return truncateAtWord(`${name}${location}${qualifier} | TOK`, MAX_META_TITLE_LENGTH);
}

function buildDescription(restaurant, cuisines, services, menuItemCount, reviewCount) {
  const name = cleanText(restaurant.name) || "Ce restaurant";
  const city = cleanText(restaurant.city);
  const cuisine = cuisines[0];
  const lead = `${name}, ${cuisine ? `restaurant ${cuisine.toLowerCase()}` : "restaurant"}${city ? ` à ${city}` : " sur TOK"}`;

  const details = [];
  if (menuItemCount > 0) details.push(`${menuItemCount} plat${menuItemCount > 1 ? "s" : ""} publié${menuItemCount > 1 ? "s" : ""}`);
  if (reviewCount > 0) details.push(`${reviewCount} avis`);
  details.push(...services);

  const detailSentence = details.length > 0
    ? `Consultez ${new Intl.ListFormat("fr-CH", { style: "long", type: "conjunction" }).format(details)}.`
    : "Consultez la fiche et les services réellement renseignés.";

  return truncateAtWord(`${lead}. ${detailSentence}`, MAX_META_DESCRIPTION_LENGTH);
}

function cleanMenuItems(menuItems) {
  if (!Array.isArray(menuItems)) return [];

  return menuItems
    .filter((item) => item && item.is_available !== false && cleanText(item.name))
    .slice(0, MAX_SCHEMA_MENU_ITEMS)
    .map((item) => {
      const price = toFiniteNumber(item.price);
      return {
        id: cleanText(item.id),
        name: cleanText(item.name),
        description: truncateAtWord(item.description, 300) || null,
        category: cleanText(item.category) || "Carte",
        image: toAbsoluteUrl(item.image_url),
        price: price !== null && price >= 0 ? price : null,
      };
    });
}

function buildMenuSchema(menuItems, canonicalUrl) {
  const cleanedItems = cleanMenuItems(menuItems);
  if (cleanedItems.length === 0) return null;

  const grouped = new Map();
  for (const item of cleanedItems) {
    const items = grouped.get(item.category) || [];
    items.push(item);
    grouped.set(item.category, items);
  }

  return {
    "@type": "Menu",
    "@id": `${canonicalUrl}#menu`,
    name: "Menu",
    url: `${canonicalUrl}#menu`,
    hasMenuSection: [...grouped.entries()].map(([category, items], sectionIndex) => ({
      "@type": "MenuSection",
      "@id": `${canonicalUrl}#menu-section-${sectionIndex + 1}`,
      name: category,
      hasMenuItem: items.map((item, itemIndex) => ({
        "@type": "MenuItem",
        "@id": `${canonicalUrl}#menu-item-${encodeURIComponent(item.id || `${sectionIndex + 1}-${itemIndex + 1}`)}`,
        name: item.name,
        description: item.description,
        image: item.image,
        offers: item.price === null ? null : {
          "@type": "Offer",
          price: item.price.toFixed(2),
          priceCurrency: "CHF",
          availability: "https://schema.org/InStock",
        },
      })),
    })),
  };
}

function buildReviewSchemas(reviews, canonicalUrl) {
  if (!Array.isArray(reviews)) return [];

  return reviews
    .filter((review) => {
      const status = cleanText(review?.status).toLowerCase();
      return review && (!status || status === "published");
    })
    .map((review) => {
      const rating = toFiniteNumber(review.rating);
      const authorName = cleanText(review.user_name ?? review.author_name);
      const datePublished = normalizeDate(review.created_at ?? review.date_published);
      if (!rating || rating <= 0 || !authorName || !datePublished) return null;

      return {
        "@type": "Review",
        "@id": `${canonicalUrl}#review-${encodeURIComponent(cleanText(review.id) || datePublished)}`,
        author: {
          "@type": "Person",
          name: authorName,
        },
        datePublished,
        reviewBody: truncateAtWord(review.comment ?? review.review_body, 1000) || null,
        reviewRating: {
          "@type": "Rating",
          ratingValue: Math.min(Math.max(rating, 1), 10),
          bestRating: 10,
          worstRating: 1,
        },
      };
    })
    .filter(Boolean)
    .slice(0, MAX_SCHEMA_REVIEWS);
}

function compact(value) {
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => item !== null && item !== undefined);
    return items.length > 0 ? items : null;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compact(item)])
      .filter(([, item]) => item !== null && item !== undefined && item !== "");
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }

  return value === undefined || value === null || value === "" ? null : value;
}

export function buildRestaurantSeoModel({
  restaurant,
  canonicalPath,
  heroImage,
  images = [],
  menuItems = [],
  reviews = [],
  amenities = [],
  averageRating,
  reviewCount,
} = {}) {
  const restaurantId = cleanText(restaurant?.id);
  const restaurantName = cleanText(restaurant?.name);
  if (!restaurant || !restaurantId || !restaurantName) return null;

  const fallbackPath = `/restaurant/${encodeURIComponent(restaurantId)}`;
  const canonicalUrl = toAbsoluteUrl(canonicalPath || fallbackPath) || `${CANONICAL_ORIGIN}${fallbackPath}`;
  const cuisines = parseCuisineLabels(restaurant.cuisine_type);
  const services = getServiceLabels(restaurant);
  const menu = buildMenuSchema(menuItems, canonicalUrl);
  const openingHours = parseOpeningHours(restaurant.opening_hours);
  const imageUrls = normalizeImageUrls(heroImage ?? restaurant.image_url, images);
  const amenityLabels = normalizeAmenityLabels(amenities);
  const normalizedReviewCount = Math.max(
    0,
    Math.round(toFiniteNumber(reviewCount) ?? toFiniteNumber(restaurant.review_count) ?? 0),
  );
  const normalizedAverageRating = toFiniteNumber(averageRating) ?? toFiniteNumber(restaurant.rating);
  const reviewSchemas = buildReviewSchemas(reviews, canonicalUrl);
  const title = buildTitle(restaurant, cuisines);
  const description = buildDescription(
    restaurant,
    cuisines,
    services,
    cleanMenuItems(menuItems).length,
    normalizedReviewCount,
  );
  const dateModified = normalizeDate(restaurant.updated_at);
  const city = cleanText(restaurant.city);
  const citySlug = slugify(city);
  const restaurantEntityId = `${canonicalUrl}#restaurant`;
  const webpageId = `${canonicalUrl}#webpage`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;
  const latitude = toFiniteNumber(restaurant.latitude);
  const longitude = toFiniteNumber(restaurant.longitude);
  const hasValidGeo = latitude !== null
    && longitude !== null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;

  const hasAddressDetails = Boolean(
    cleanText(restaurant.address)
    || city
    || cleanText(restaurant.postal_code)
    || cleanText(restaurant.region),
  );
  const address = hasAddressDetails
    ? compact({
      "@type": "PostalAddress",
      streetAddress: cleanText(restaurant.address),
      addressLocality: city,
      postalCode: cleanText(restaurant.postal_code),
      addressRegion: cleanText(restaurant.region),
      addressCountry: "CH",
    })
    : null;

  const aggregateRating = normalizedReviewCount > 0
    && normalizedAverageRating !== null
    && normalizedAverageRating > 0
    ? {
      "@type": "AggregateRating",
      ratingValue: Math.min(Math.max(normalizedAverageRating, 1), 10),
      reviewCount: normalizedReviewCount,
      bestRating: 10,
      worstRating: 1,
    }
    : null;

  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Accueil",
      item: `${CANONICAL_ORIGIN}/`,
    },
    city && citySlug
      ? {
        "@type": "ListItem",
        position: 2,
        name: `Restaurants à ${city}`,
        item: `${CANONICAL_ORIGIN}/restaurants/${citySlug}`,
      }
      : {
        "@type": "ListItem",
        position: 2,
        name: "Restaurants",
        item: `${CANONICAL_ORIGIN}/recherche`,
      },
    {
      "@type": "ListItem",
      position: 3,
      name: restaurantName,
      item: canonicalUrl,
    },
  ];

  const restaurantSchema = compact({
    "@type": "Restaurant",
    "@id": restaurantEntityId,
    name: restaurantName,
    description,
    url: canonicalUrl,
    mainEntityOfPage: { "@id": webpageId },
    image: imageUrls,
    servesCuisine: cuisines,
    priceRange: getPriceRange(restaurant.price_range),
    telephone: cleanText(restaurant.phone),
    address,
    geo: hasValidGeo
      ? {
        "@type": "GeoCoordinates",
        latitude,
        longitude,
      }
      : null,
    openingHoursSpecification: openingHours.specifications,
    acceptsReservations: restaurant.supports_reservation === true,
    aggregateRating,
    review: reviewSchemas,
    hasMenu: menu ? { "@id": menu["@id"] } : null,
    amenityFeature: amenityLabels.map((label) => ({
      "@type": "LocationFeatureSpecification",
      name: label,
      value: true,
    })),
    potentialAction: restaurant.supports_reservation === true
      ? {
        "@type": "ReserveAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${canonicalUrl}?reserve=true`,
          actionPlatform: [
            "https://schema.org/DesktopWebPlatform",
            "https://schema.org/MobileWebPlatform",
          ],
        },
        result: {
          "@type": "Reservation",
          name: `Réservation chez ${restaurantName}`,
        },
      }
      : null,
  });

  const graph = compact({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": webpageId,
        url: canonicalUrl,
        name: title,
        description,
        inLanguage: "fr-CH",
        isPartOf: { "@id": `${CANONICAL_ORIGIN}/#website` },
        mainEntity: { "@id": restaurantEntityId },
        breadcrumb: { "@id": breadcrumbId },
        primaryImageOfPage: imageUrls[0] ? { "@type": "ImageObject", url: imageUrls[0] } : null,
        dateModified,
      },
      restaurantSchema,
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: breadcrumbItems,
      },
      menu,
    ],
  });

  return {
    title,
    description,
    canonicalUrl,
    image: imageUrls[0] || null,
    jsonLd: graph,
    openingHoursRows: openingHours.rows,
    openingHoursSpecifications: openingHours.specifications,
    cuisines,
    serviceLabels: services,
    lastUpdatedIso: dateModified,
    lastUpdatedLabel: formatUpdatedDate(dateModified),
    cityPath: city && citySlug ? `/restaurants/${citySlug}` : "/recherche",
  };
}

export const __restaurantSeoInternals = {
  parseCuisineLabels,
  parseOpeningHours,
  toAbsoluteUrl,
};
""", encoding="utf-8")
(seo_dir / "restaurantEntity.d.mts").write_text("""export type RestaurantSeoOpeningHoursRow = {
  key: string;
  label: string;
  hours: string;
};

export type RestaurantSeoModel = {
  title: string;
  description: string;
  canonicalUrl: string;
  image: string | null;
  jsonLd: Record<string, unknown>;
  openingHoursRows: RestaurantSeoOpeningHoursRow[];
  openingHoursSpecifications: Record<string, unknown>[];
  cuisines: string[];
  serviceLabels: string[];
  lastUpdatedIso: string | null;
  lastUpdatedLabel: string | null;
  cityPath: string;
};

export type RestaurantSeoInput = {
  restaurant?: unknown;
  canonicalPath?: string | null;
  heroImage?: string | null;
  images?: unknown[];
  menuItems?: unknown[];
  reviews?: unknown[];
  amenities?: unknown[];
  averageRating?: string | number | null;
  reviewCount?: string | number | null;
};

export function buildRestaurantSeoModel(input?: RestaurantSeoInput): RestaurantSeoModel | null;

export const __restaurantSeoInternals: {
  parseCuisineLabels(value: unknown): string[];
  parseOpeningHours(value: unknown): {
    rows: RestaurantSeoOpeningHoursRow[];
    specifications: Record<string, unknown>[];
  };
  toAbsoluteUrl(value: unknown): string | null;
};
""", encoding="utf-8")
(ROOT / "src/test/restaurant-entity-seo.test.ts").write_text("""import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  __restaurantSeoInternals,
  buildRestaurantSeoModel,
} from "../lib/seo/restaurantEntity.mjs";

function getGraphNode(model: NonNullable<ReturnType<typeof buildRestaurantSeoModel>>, type: string) {
  const graph = model.jsonLd["@graph"] as Array<Record<string, unknown>>;
  return graph.find((node) => node["@type"] === type);
}

describe("restaurant entity SEO", () => {
  it("builds one coherent Restaurant/WebPage/Breadcrumb/Menu graph from real data", () => {
    const model = buildRestaurantSeoModel({
      restaurant: {
        id: "restaurant-1",
        name: "La Table Test",
        city: "Genève",
        address: "Rue du Rhône 1",
        postal_code: "1204",
        cuisine_type: "Italien, Brunch +3",
        price_range: 2,
        phone: "+41 22 000 00 00",
        latitude: 46.2044,
        longitude: 6.1432,
        supports_reservation: true,
        supports_pickup: true,
        delivery_available: false,
        supports_dinein: true,
        opening_hours: {
          lundi: { open: "12:00", close: "14:30" },
        },
        updated_at: "2026-08-29T00:00:00Z",
      },
      canonicalPath: "/restaurant/la-table-test-restaurant-1",
      heroImage: "/images/restaurant.jpg",
      images: [{ media_url: "https://cdn.example.com/dining-room.webp" }],
      menuItems: [
        {
          id: "dish-1",
          name: "Risotto",
          description: "Risotto aux légumes de saison",
          price: 28,
          category: "Plats",
          is_available: true,
        },
      ],
      reviews: [
        {
          id: "review-1",
          user_name: "Camille",
          rating: 9,
          comment: "Très bonne adresse.",
          created_at: "2026-08-20T10:00:00Z",
          status: "published",
        },
      ],
      amenities: [{ label: "Terrasse" }],
      averageRating: 9,
      reviewCount: 1,
    });

    expect(model).not.toBeNull();
    expect(model?.title).toContain("La Table Test");
    expect(model?.description).toContain("réservation");
    expect(model?.cuisines).toEqual(["Italien", "Brunch"]);
    expect(model?.lastUpdatedLabel).toBe("29 août 2026");

    const webPage = getGraphNode(model!, "WebPage");
    const restaurant = getGraphNode(model!, "Restaurant");
    const breadcrumb = getGraphNode(model!, "BreadcrumbList");
    const menu = getGraphNode(model!, "Menu");

    expect(webPage?.mainEntity).toEqual({
      "@id": "https://www.thetok.ch/restaurant/la-table-test-restaurant-1#restaurant",
    });
    expect(restaurant?.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 46.2044,
      longitude: 6.1432,
    });
    expect(restaurant?.aggregateRating).toMatchObject({
      ratingValue: 9,
      reviewCount: 1,
    });
    expect(restaurant?.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "12:00",
        closes: "14:30",
      },
    ]);
    expect(restaurant?.acceptsReservations).toBe(true);
    expect(restaurant?.amenityFeature).toEqual([
      {
        "@type": "LocationFeatureSpecification",
        name: "Terrasse",
        value: true,
      },
    ]);
    expect(breadcrumb).toBeDefined();
    expect(menu).toBeDefined();
    expect(JSON.stringify(menu)).toContain('"priceCurrency":"CHF"');
  });

  it("shows service hours without inventing weekdays or a generic timetable", () => {
    const serviceHours = __restaurantSeoInternals.parseOpeningHours({
      service_settings: {
        lunch: {
          start_time: "12:00",
          end_time: "14:30",
          service_closed: false,
        },
        dinner: {
          start_time: "19:00",
          end_time: "22:30",
          service_closed: false,
        },
      },
    });

    expect(serviceHours.rows).toEqual([
      { key: "service-lunch", label: "Déjeuner", hours: "12:00–14:30" },
      { key: "service-dinner", label: "Dîner", hours: "19:00–22:30" },
    ]);
    expect(serviceHours.specifications).toEqual([]);
    expect(__restaurantSeoInternals.parseOpeningHours({}).rows).toEqual([]);
  });

  it("omits rating, geo and booking claims when the source data does not support them", () => {
    const model = buildRestaurantSeoModel({
      restaurant: {
        id: "restaurant-2",
        name: "Sans Donnée Inventée",
        city: "Lausanne",
        cuisine_type: "Vegan +4",
        latitude: 190,
        longitude: 200,
        supports_reservation: false,
        supports_pickup: false,
        delivery_available: false,
        supports_dinein: false,
        opening_hours: null,
      },
      canonicalPath: "/restaurant/sans-donnee-inventee-restaurant-2",
      averageRating: 10,
      reviewCount: 0,
    });

    expect(model).not.toBeNull();
    expect(model?.description).not.toContain("réservation");
    expect(model?.description).not.toContain("livraison");
    expect(model?.cuisines).toEqual(["Vegan"]);

    const restaurant = getGraphNode(model!, "Restaurant");
    expect(restaurant?.aggregateRating).toBeUndefined();
    expect(restaurant?.geo).toBeUndefined();
    expect(restaurant?.potentialAction).toBeUndefined();
    expect(model?.openingHoursRows).toEqual([]);
  });

  it("keeps fabricated schedules and review sub-scores out of the restaurant page", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/pages/RestaurantDetail.tsx"),
      "utf8",
    );

    expect(source).not.toContain("Lundi - Dimanche : 11h30 - 22h30");
    expect(source).not.toContain("Number(avgRating) * 0.95");
    expect(source).not.toContain("Number(avgRating) * 1.02");
    expect(source).toContain("Provenance et fraîcheur des informations");
  });
});
""", encoding="utf-8")

docs_path = ROOT / "docs/skills/TOK_SEO_SKILL.md"
docs = docs_path.read_text(encoding="utf-8")
marker = "## Fiches restaurant : entité, preuve et fraîcheur"
if marker not in docs:
    docs_path.write_text(docs.rstrip() + '\n\n## Fiches restaurant : entité, preuve et fraîcheur\n\n- Générer le titre, la description et le JSON-LD depuis les mêmes données que l\'interface.\n- Relier `WebPage`, `Restaurant`, `BreadcrumbList` et `Menu` avec des `@id` stables.\n- N\'émettre `aggregateRating`, `GeoCoordinates`, horaires et actions de réservation que lorsque les données sources les justifient.\n- Rendre le fil d\'Ariane avec de vrais liens HTML crawlables.\n- Afficher une zone visible « Provenance et fraîcheur des informations » avec la date de mise à jour.\n- Ne jamais inventer d\'horaires, de sous-notes d\'avis, de services, de prix ou de disponibilité.\n- Garder les démonstrations commerciales et les fiches introuvables en `noindex`.\n' + "\n", encoding="utf-8")

print("SEO restaurant entity patch applied successfully.")
