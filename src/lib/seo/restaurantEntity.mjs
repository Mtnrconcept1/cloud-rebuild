const CANONICAL_ORIGIN = "https://www.thetok.ch";

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
    .replace(/[̀-ͯ]/g, "")
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
