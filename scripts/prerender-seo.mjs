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
const MAX_DYNAMIC_RESTAURANTS = Math.max(1, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const MAX_DYNAMIC_ACTUALITES = Math.max(1, Number(process.env.SEO_SITEMAP_MAX_ACTUALITES || 10000) || 10000);
const MIN_LOCAL_RESTAURANTS = Math.max(1, Number(process.env.SEO_MIN_LOCAL_RESTAURANTS || 1) || 1);
const MIN_SPECIALIZED_LOCAL_RESTAURANTS = Math.max(
  2,
  Number(process.env.SEO_MIN_SPECIALIZED_LOCAL_RESTAURANTS || 3) || 3,
);
const MIN_ACTUALITE_TEXT_LENGTH = Math.max(1, Number(process.env.SEO_MIN_ACTUALITE_TEXT_LENGTH || 80) || 80);
const RESTAURANT_PRERENDER_BATCH_SIZE = 500;
const ACTUALITES_PRERENDER_BATCH_SIZE = 500;

const SITEMAP_GROUPS = [
  {
    fileName: "sitemap-restaurants.xml",
    matches: (page) => page.path.startsWith("/restaurants/") || page.path.startsWith("/restaurant/"),
  },
  {
    fileName: "sitemap-actualites.xml",
    matches: (page) => page.path === "/actualites" || page.path.startsWith("/actualites/"),
  },
  {
    fileName: "sitemap-pages.xml",
    matches: () => true,
  },
];

const STATIC_LOCAL_PAGES = [
  ["geneve", "Genève"],
  ["lausanne", "Lausanne"],
  ["zurich", "Zurich"],
  ["bale", "Bâle"],
  ["berne", "Berne"],
  ["lucerne", "Lucerne"],
  ["lugano", "Lugano"],
  ["winterthour", "Winterthour"],
  ["saint-gall", "Saint-Gall"],
  ["fribourg", "Fribourg"],
  ["neuchatel", "Neuchâtel"],
  ["sion", "Sion"],
  ["nyon", "Nyon"],
  ["morges", "Morges"],
  ["vevey", "Vevey"],
  ["montreux", "Montreux"],
  ["yverdon-les-bains", "Yverdon-les-Bains"],
  ["bienne", "Bienne"],
  ["carouge", "Carouge"],
  ["vernier", "Vernier"],
  ["geneve/pizza", "Pizza à Genève"],
  ["geneve/sushi", "Sushi à Genève"],
  ["geneve/burger", "Burger à Genève"],
  ["geneve/kebab", "Kebab à Genève"],
  ["geneve/eaux-vives", "Restaurants aux Eaux-Vives"],
  ["geneve/plainpalais", "Restaurants à Plainpalais"],
  ["geneve/paquis", "Restaurants aux Pâquis"],
  ["geneve/carouge", "Restaurants à Carouge"],
  ["geneve/champel", "Restaurants à Champel"],
  ["lausanne/italien", "Restaurants italiens à Lausanne"],
  ["lausanne/asiatique", "Restaurants asiatiques à Lausanne"],
];

const LOCAL_CITIES = [
  { slug: "geneve", label: "Genève", districts: ["eaux-vives", "plainpalais", "paquis", "carouge", "champel", "jonction", "servette", "rive"] },
  { slug: "lausanne", label: "Lausanne", districts: ["flon", "ouchy", "sous-gare", "chailly"] },
  { slug: "zurich", label: "Zurich", districts: [] },
  { slug: "bale", label: "Bâle", districts: [] },
  { slug: "berne", label: "Berne", districts: [] },
  { slug: "lucerne", label: "Lucerne", districts: [] },
  { slug: "lugano", label: "Lugano", districts: [] },
  { slug: "winterthour", label: "Winterthour", districts: [] },
  { slug: "saint-gall", label: "Saint-Gall", districts: [] },
  { slug: "fribourg", label: "Fribourg", districts: [] },
  { slug: "neuchatel", label: "Neuchâtel", districts: [] },
  { slug: "sion", label: "Sion", districts: [] },
  { slug: "nyon", label: "Nyon", districts: [] },
  { slug: "morges", label: "Morges", districts: [] },
  { slug: "vevey", label: "Vevey", districts: [] },
  { slug: "montreux", label: "Montreux", districts: [] },
  { slug: "yverdon-les-bains", label: "Yverdon-les-Bains", districts: [] },
  { slug: "bienne", label: "Bienne", districts: [] },
  { slug: "carouge", label: "Carouge", districts: [] },
  { slug: "vernier", label: "Vernier", districts: [] },
];

const LOCAL_CUISINES = [
  { slug: "pizza", label: "Pizza" },
  { slug: "italien", label: "Italien" },
  { slug: "sushi", label: "Sushi" },
  { slug: "japonais", label: "Japonais" },
  { slug: "asiatique", label: "Asiatique" },
  { slug: "chinois", label: "Chinois" },
  { slug: "thai", label: "Thaï" },
  { slug: "indien", label: "Indien" },
  { slug: "libanais", label: "Libanais" },
  { slug: "burger", label: "Burger" },
  { slug: "kebab", label: "Kebab" },
  { slug: "halal", label: "Halal" },
  { slug: "suisse", label: "Suisse" },
  { slug: "francais", label: "Français" },
  { slug: "mediterraneen", label: "Méditerranéen" },
  { slug: "mexicain", label: "Mexicain" },
  { slug: "marocain", label: "Marocain" },
  { slug: "africain", label: "Africain" },
  { slug: "vegetarien", label: "Végétarien" },
  { slug: "vegan", label: "Vegan" },
  { slug: "healthy", label: "Healthy" },
  { slug: "brunch", label: "Brunch" },
  { slug: "cafe", label: "Café" },
  { slug: "dessert", label: "Dessert" },
  { slug: "bistro", label: "Bistro" },
  { slug: "street-food", label: "Street food" },
  { slug: "coreen", label: "Coréen" },
  { slug: "grec", label: "Grec" },
];

const CUISINE_SLUG_ALIASES = new Map([
  ["pizzeria", "pizza"],
  ["pizzas", "pizza"],
  ["italienne", "italien"],
  ["japonaise", "japonais"],
  ["indienne", "indien"],
  ["libanaise", "libanais"],
  ["africaine", "africain"],
  ["vegetarienne", "vegetarien"],
  ["vegetarian", "vegetarien"],
  ["desserts", "dessert"],
  ["streetfood", "street-food"],
]);

function extractRestaurantCuisineSlugs(value) {
  const knownSlugs = new Set(LOCAL_CUISINES.map((cuisine) => cuisine.slug));
  return String(value || "")
    .split(/[,;|/]+/)
    .map((part) => part.replace(/\+\s*\d+\s*$/, "").trim())
    .map((part) => CUISINE_SLUG_ALIASES.get(slugify(part)) || slugify(part))
    .filter((cuisineSlug, index, cuisineSlugs) =>
      knownSlugs.has(cuisineSlug) && cuisineSlugs.indexOf(cuisineSlug) === index
    );
}

const LOCAL_INTENTS = [
  { slug: "reservation", matches: (restaurant) => restaurant.supports_reservation === true },
  {
    slug: "pas-cher",
    matches: (restaurant) => Number(restaurant.price_range) > 0 && Number(restaurant.price_range) <= 2,
  },
  {
    slug: "meilleurs",
    matches: (restaurant) => Number(restaurant.rating) > 0 && Number(restaurant.review_count) > 0,
  },
];

const LOCAL_DISTRICTS = {
  "eaux-vives": "Eaux-Vives",
  plainpalais: "Plainpalais",
  paquis: "Pâquis",
  carouge: "Carouge",
  champel: "Champel",
  jonction: "Jonction",
  servette: "Servette",
  rive: "Rive",
  flon: "Flon",
  ouchy: "Ouchy",
  "sous-gare": "Sous-Gare",
  chailly: "Chailly",
};

const RICH_LOCAL_PAGES = STATIC_LOCAL_PAGES.map(([slug, fallbackLabel]) => {
  const [citySlug, categorySlug] = slug.split("/");
  const city = LOCAL_CITIES.find((item) => item.slug === citySlug);
  if (!city) throw new Error(`Ville SEO locale inconnue: ${citySlug}`);
  if (!categorySlug) {
    return {
      type: "city",
      slug,
      citySlug,
      city: city.label,
    };
  }

  if (city.districts.includes(categorySlug)) {
    return {
      type: "district",
      slug,
      citySlug,
      city: city.label,
      districtSlug: categorySlug,
      district: LOCAL_DISTRICTS[categorySlug] || fallbackLabel,
    };
  }

  const cuisine = LOCAL_CUISINES.find((item) => item.slug === categorySlug);
  return {
    type: "cuisine",
    slug,
    citySlug,
    city: city.label,
    cuisineSlug: categorySlug,
    cuisine: cuisine?.label || fallbackLabel,
  };
});

function buildLocalHeading(page) {
  if (page.type === "intent" && page.intentSlug === "reservation") return `Réservation de restaurant à ${page.city}`;
  if (page.type === "intent" && page.intentSlug === "pas-cher") return `Restaurants pas chers à ${page.city}`;
  if (page.type === "intent" && page.intentSlug === "meilleurs") return `Meilleurs restaurants à ${page.city}`;
  if (page.type === "cuisine" && page.cuisineSlug === "pizza") return `Pizzerias à ${page.city} : les meilleures adresses à réserver`;
  if (page.type === "cuisine") return `Restaurants ${page.cuisine} à ${page.city} : commander et réserver`;
  if (page.type === "district") return `Restaurants à ${page.district}, ${page.city}`;
  return `Restaurants à ${page.city} : réservation, commande et bonnes adresses`;
}

function buildLocalTitle(page) {
  if (page.type === "intent" && page.intentSlug === "reservation") return `Réservation restaurant à ${page.city} | TOK`;
  if (page.type === "intent" && page.intentSlug === "pas-cher") return `Restaurant pas cher à ${page.city} | TOK`;
  if (page.type === "intent" && page.intentSlug === "meilleurs") return `Meilleurs restaurants à ${page.city} | TOK`;
  if (page.type === "cuisine" && page.cuisineSlug === "pizza") return `Pizzeria à ${page.city} : les meilleures adresses | TOK`;
  if (page.type === "cuisine") return `Restaurant ${page.cuisine} à ${page.city} | TOK`;
  if (page.type === "district") return `Restaurants à ${page.district}, ${page.city} | TOK`;
  return `Restaurant à ${page.city} : réserver une table | TOK`;
}

function buildLocalDescription(page) {
  if (page.type === "intent" && page.intentSlug === "reservation") {
    return `Réservez une table dans les restaurants de ${page.city} qui confirment le service de réservation sur TOK.`;
  }
  if (page.type === "intent" && page.intentSlug === "pas-cher") {
    return `Comparez les restaurants abordables à ${page.city} selon leur gamme de prix et les services réellement disponibles sur TOK.`;
  }
  if (page.type === "intent" && page.intentSlug === "meilleurs") {
    return `Découvrez les restaurants les mieux notés à ${page.city}, classés à partir des notes et avis disponibles sur TOK.`;
  }
  if (page.type === "cuisine" && page.cuisineSlug === "pizza") {
    return `Trouvez une pizzeria à ${page.city}, comparez les adresses disponibles et réservez une table ou commandez sur TOK.`;
  }
  if (page.type === "cuisine") {
    return `Trouvez les restaurants ${page.cuisine} à ${page.city} sur TOK : réservation, commande, retrait, livraison et offres locales.`;
  }
  if (page.type === "district") {
    return `Découvrez les restaurants proches de ${page.district} à ${page.city} : bonnes adresses, réservation, commande et offres locales sur TOK.`;
  }
  return `Trouvez un restaurant à ${page.city} avec TOK : comparez les cuisines, les services de réservation, la commande et les offres locales.`;
}

function buildLocalLinks(page, restaurants = []) {
  const citySlug = page.citySlug || page.slug.split("/")[0] || "geneve";
  const city = LOCAL_CITIES.find((item) => item.slug === citySlug) || { label: page.city, districts: [] };
  const cuisineCounts = new Map();
  for (const restaurant of restaurants) {
    for (const cuisineSlug of extractRestaurantCuisineSlugs(restaurant.cuisine_type)) {
      cuisineCounts.set(cuisineSlug, Number(cuisineCounts.get(cuisineSlug) || 0) + 1);
    }
  }
  const cuisineLinks = LOCAL_CUISINES.filter((cuisine) =>
    Number(cuisineCounts.get(cuisine.slug) || 0) >= MIN_SPECIALIZED_LOCAL_RESTAURANTS
  ).map((cuisine) => ({
    href: `/restaurants/${citySlug}/${cuisine.slug}`,
    label: cuisine.slug === "pizza"
      ? `Pizzerias à ${city.label}`
      : `Restaurants ${cuisine.label} à ${city.label}`,
  }));
  const intentLinks = LOCAL_INTENTS.filter((intent) =>
    restaurants.filter(intent.matches).length >= MIN_SPECIALIZED_LOCAL_RESTAURANTS
  ).map((intent) => ({
    href: `/restaurants/${citySlug}/${intent.slug}`,
    label: intent.slug === "reservation"
      ? `Réserver un restaurant à ${city.label}`
      : intent.slug === "pas-cher"
        ? `Restaurants pas chers à ${city.label}`
        : `Meilleurs restaurants à ${city.label}`,
  }));
  const districtLinks = city.districts.map((districtSlug) => ({
    href: `/restaurants/${citySlug}/${districtSlug}`,
    label: `Restaurants ${LOCAL_DISTRICTS[districtSlug]}`,
  }));
  const restaurantLinks = restaurants.slice(0, 24).map((restaurant) => ({
    href: buildRestaurantSeoPath(restaurant),
    label: String(restaurant.name || "Voir le restaurant"),
  }));

  return [
    ...restaurantLinks,
    { href: "/recherche", label: "Recherche restaurants" },
    { href: "/anti-gaspi", label: "Offres anti-gaspi" },
    { href: "/ventes-flash", label: "Ventes flash food" },
    ...intentLinks,
    ...cuisineLinks,
    ...districtLinks,
  ].filter((link, index, links) => links.findIndex((candidate) => candidate.href === link.href) === index);
}

function buildLocalStaticContent(page, restaurants = []) {
  const serviceLine = page.type === "intent" && page.intentSlug === "reservation"
    ? `Cette sélection contient uniquement les adresses de ${page.city} dont le service de réservation est confirmé dans TOK.`
    : page.type === "intent" && page.intentSlug === "pas-cher"
      ? `Cette sélection compare les adresses de ${page.city} classées dans les gammes de prix les plus accessibles.`
      : page.type === "intent" && page.intentSlug === "meilleurs"
        ? `Cette sélection s'appuie sur les notes et le nombre d'avis disponibles ; elle évolue avec les données vérifiées dans TOK.`
        : page.type === "cuisine"
          ? `Cette page aide à trouver une adresse ${page.cuisine} à ${page.city}, puis à choisir selon les services disponibles : réservation, commande, retrait ou livraison.`
          : page.type === "district"
            ? `Cette page rassemble les restaurants du quartier ${page.district} à ${page.city}, avec des critères utiles pour réserver, commander et repérer les offres locales.`
            : `Cette page rassemble les restaurants de ${page.city}, les cuisines recherchées, les services de réservation et les offres locales.`;
  const restaurantItems = restaurants.slice(0, 24).map((restaurant) => {
    const cuisine = String(restaurant.cuisine_type || "").trim();
    return cuisine ? `${restaurant.name} — ${cuisine}` : String(restaurant.name);
  });

  return {
    heading: buildLocalHeading(page),
    paragraphs: [
      serviceLine,
      restaurants.length > 0
        ? `${restaurants.length} adresse${restaurants.length > 1 ? "s" : ""} active${restaurants.length > 1 ? "s" : ""} est répertoriée${restaurants.length > 1 ? "s" : ""} sur cette page.`
        : "TOK enrichit cette sélection au fil de la vérification des restaurants et de leurs services disponibles.",
    ],
    sections: [
      ...(restaurantItems.length > 0 ? [{
        heading: "Restaurants disponibles",
        items: restaurantItems,
      }] : []),
      {
        heading: "Ce que vous pouvez filtrer",
        items: ["Cuisine", "Ville ou quartier", "Commande", "Réservation", "Retrait", "Offres locales", "Ventes flash"],
      },
      {
        heading: "Services TOK associés",
        items: ["Réservation", "Commande", "Anti-gaspi", "Actualités restaurants", "Miamz", "TOK One"],
      },
    ],
    links: buildLocalLinks(page, restaurants),
  };
}

function buildLocalJsonLd(page, restaurants = []) {
  const pathName = `/restaurants/${page.slug}`;
  const name = buildLocalHeading(page);

  return [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name,
      url: canonicalUrl(pathName),
      numberOfItems: restaurants.length,
      itemListElement: restaurants.slice(0, 100).map((restaurant, index) => {
        const restaurantPath = buildRestaurantSeoPath(restaurant);
        return {
          "@type": "ListItem",
          position: index + 1,
          name: restaurant.name,
          url: canonicalUrl(restaurantPath),
          item: {
            "@type": "Restaurant",
            "@id": canonicalUrl(restaurantPath),
            name: restaurant.name,
            image: toAbsoluteSeoImage(restaurant.image_url),
            servesCuisine: restaurant.cuisine_type || undefined,
            address: {
              "@type": "PostalAddress",
              streetAddress: restaurant.address || undefined,
              addressLocality: restaurant.city || page.city,
              addressCountry: "CH",
            },
          },
        };
      }),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${CANONICAL_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Restaurants", item: canonicalUrl("/recherche") },
        { "@type": "ListItem", position: 3, name, item: canonicalUrl(pathName) },
      ],
    },
  ];
}

function buildLocalSeoPage(page, overrides = {}) {
  const { restaurants = [], ...pageOverrides } = overrides;
  return {
    seoKind: "local-listing",
    localPageType: page.type,
    inventoryCount: restaurants.length,
    path: `/restaurants/${page.slug}`,
    title: buildLocalTitle(page),
    description: buildLocalDescription(page),
    priority: page.type === "city" ? "0.9" : "0.8",
    changefreq: page.type === "city" ? "daily" : "weekly",
    staticContent: buildLocalStaticContent(page, restaurants),
    jsonLd: buildLocalJsonLd(page, restaurants),
    ...pageOverrides,
  };
}

const PUBLIC_SEO_PAGES = [
  {
    path: "/",
    title: "TOK - Réservez, commandez et trouvez un restaurant en Suisse",
    description:
      "Réservation restaurant, bonnes adresses, pizzerias et restaurants pas chers : trouvez où manger à Genève et dans les villes suisses avec TOK.",
    priority: "1.0",
    changefreq: "daily",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "TOK",
        url: CANONICAL_ORIGIN,
        logo: `${CANONICAL_ORIGIN}/logotok.png`,
        areaServed: "Switzerland",
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
    staticContent: {
      heading: "Réservez un restaurant à Genève et dans les villes suisses",
      paragraphs: [
        "TOK rassemble des restaurants disponibles pour la réservation, la commande et les offres locales. Chaque page de ville est publiée dans Google seulement lorsqu'elle contient un inventaire réel.",
        "Comparez les restaurants par ville, cuisine, gamme de prix et services confirmés : pizzeria, restaurant italien, sushi, brunch, vegan, halal et autres spécialités.",
      ],
      sections: [
        {
          heading: "Recherches populaires",
          items: ["Réservation restaurant", "Restaurant à Genève", "Meilleurs restaurants", "Restaurant pas cher", "Pizzeria", "Restaurant italien", "Sushi", "Brunch"],
        },
        {
          heading: "Villes couvertes",
          items: LOCAL_CITIES.map((city) => city.label),
        },
      ],
      links: LOCAL_CITIES.map((city) => ({
        href: `/restaurants/${city.slug}`,
        label: `Restaurants à ${city.label}`,
      })),
    },
  },
  {
    path: "/recherche",
    title: "Recherche restaurants à Genève et en Suisse romande | TOK",
    description:
      "Recherchez un restaurant par ville, cuisine, offre, note ou mode de service avec TOK.",
    priority: "0.9",
    changefreq: "daily",
  },
  {
    path: "/actualites",
    title: "Actualités des restaurants à Genève et en Suisse romande | TOK",
    description:
      "Découvrez les plats, nouveautés, offres et événements publiés par les restaurants locaux sur TOK.",
    priority: "0.9",
    changefreq: "hourly",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Actualités des restaurants TOK",
      url: `${CANONICAL_ORIGIN}/actualites`,
      description:
        "Les publications, nouveautés, offres et événements des restaurants présents sur TOK.",
    },
  },
  ...RICH_LOCAL_PAGES.map((page) => buildLocalSeoPage(page)),
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
    path: "/tok-connect",
    title: "TOK Connect - API et intégrations pour partenaires | TOK",
    description:
      "Connectez TOK aux hôtels, conciergeries, CRM, applications locales et assistants IA grâce à TOK Connect.",
    priority: "0.6",
    changefreq: "monthly",
  },
  {
    path: "/miamz-solidaires",
    title: "Miamz solidaires - fidélité, cadeaux et dons food | TOK",
    description:
      "Comprenez comment fonctionnent les Miamz TOK : points de fidélité, réductions, cadeaux et dons solidaires pour transformer chaque repas en impact local.",
    priority: "0.8",
    changefreq: "weekly",
    image: `${CANONICAL_ORIGIN}/Miamz2.webp`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Les Miamz sont-ils une monnaie ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Non. Les Miamz sont des points de fidélité TOK utilisables selon les conditions affichées dans l'application.",
          },
        },
        {
          "@type": "Question",
          name: "Peut-on donner ses Miamz ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui. Les utilisateurs peuvent reverser des Miamz à une cagnotte solidaire suivie par TOK.",
          },
        },
      ],
    },
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
    title: "Logiciel restaurateur à Genève : réservations, commandes et marketing | TOK",
    description:
      "TOK aide les restaurants genevois à piloter réservations, commandes, anti-gaspi, ventes flash, actualités, photos IA, Miamz et campagnes depuis un dashboard unique.",
    priority: "0.8",
    changefreq: "weekly",
    staticContent: {
      heading: "La plateforme restaurateur pour transformer la demande locale à Genève.",
      paragraphs: [
        "TOK centralise les réservations, les commandes, les offres anti-gaspi, les ventes flash, les actualités, les photos IA, les Miamz et les campagnes dans un dashboard pensé pour les restaurants genevois.",
        "La page Genève présente la solution complète : onboarding, fiche publique, services ouverts, pilotage commercial, cas d'usage par type de restaurant et FAQ locale.",
      ],
      sections: [
        {
          heading: "Plan d'activation Genève",
          items: [
            "Tables par mois",
            "Commandes par mois",
            "Actualités par semaine",
            "Pack d'accompagnement",
            "Photos IA et contenus de lancement",
          ],
        },
        {
          heading: "Modules restaurateur",
          items: [
            "Réservations et commandes directes",
            "Anti-gaspi et ventes flash",
            "Actualités, campagnes et Miamz",
            "Photos IA et fiche publique",
          ],
        },
        {
          heading: "Lecture simple pour restaurateur",
          items: [
            "Besoin terrain",
            "Module TOK",
            "Résultat attendu",
            "Canal mesuré",
            "Action à suivre dans le dashboard",
          ],
        },
        {
          heading: "Cas d'usage locaux",
          items: [
            "Bistrot de quartier",
            "Restaurant premium",
            "Cuisine rapide qualitative",
            "Restaurant hôtelier",
          ],
        },
        {
          heading: "Onboarding restaurateur",
          items: [
            "Audit de la fiche et des canaux",
            "Configuration du dashboard",
            "Création des offres et actualités",
            "Lancement Google Business et QR codes",
            "Pilotage hebdomadaire des performances",
          ],
        },
      ],
      links: [
        { href: "/packs-restaurateur", label: "Voir les packs" },
        { href: "/restaurateurs/google-business", label: "Optimiser Google Business" },
        { href: "/restaurateurs/alternative-commission-couvert", label: "Comparer les modèles économiques" },
        { href: "/zero-attente", label: "Découvrir zéro attente" },
        { href: "/miamz-solidaires", label: "Comprendre les Miamz solidaires" },
      ],
    },
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "Plateforme restaurateur TOK à Genève",
        provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
        areaServed: { "@type": "City", name: "Genève", addressCountry: "CH" },
        serviceType:
          "Logiciel restaurateur pour réservations, commandes, anti-gaspi, ventes flash, actualités, photos IA et fidélité Miamz",
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Accueil",
            item: `${CANONICAL_ORIGIN}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Restaurateurs Genève",
            item: `${CANONICAL_ORIGIN}/restaurateurs/geneve`,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "TOK est-il seulement un outil de réservation ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Non. TOK réunit réservations, commandes, offres anti-gaspi, ventes flash, actualités, photos IA, Miamz, campagnes et pilotage restaurateur dans un même espace.",
            },
          },
          {
            "@type": "Question",
            name: "Comment se passe l'onboarding restaurateur ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "TOK commence par un audit, configure la fiche et le dashboard, prépare les contenus utiles, branche les liens publics puis suit les performances avec le restaurateur.",
            },
          },
          {
            "@type": "Question",
            name: "Les Miamz servent-ils aussi aux restaurateurs ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Oui. Les Miamz donnent des signaux de fidélité et peuvent soutenir des avantages comme la priorité, des tables VIP ou des expériences réservées aux clients engagés.",
            },
          },
        ],
      },
    ],
  },
  {
    path: "/restaurateurs/google-business",
    title: "Google Business restaurant : convertir clics Google en réservations | TOK",
    description:
      "Optimisez votre fiche Google Business restaurant avec TOK : bouton de réservation direct, tracking des clics Google Maps, conversions et checklist de bascule.",
    priority: "0.8",
    changefreq: "weekly",
    staticContent: {
      heading: "Transformez votre fiche Google Business en canal direct.",
      paragraphs: [
        "Les clients vous trouvent déjà sur Google. TOK aide à brancher un bouton de réservation traçable, suivre les clics Google Maps et convertir cette intention en tables, commandes et relation client.",
        "Cette page est tactique : elle traite le canal Google Business, les liens UTM, la checklist de bascule et les conversions mesurées depuis Google Search ou Maps.",
      ],
      sections: [
        {
          heading: "Simulateur du canal Google",
          items: [
            "Tables Google par mois",
            "Couverts moyens par table",
            "Commission comparée par couvert",
            "Coût par conversion",
            "Écart annuel estimé",
          ],
        },
        {
          heading: "Bascule du bouton Google",
          items: [
            "Situation actuelle",
            "Risque commercial",
            "Action TOK recommandée",
            "Métrique de décision",
            "Conversion après sept jours",
          ],
        },
        {
          heading: "Checklist de bascule",
          items: [
            "Relever le lien actuel",
            "Créer un lien TOK traçable",
            "Ajouter les UTM et la source Google Business",
            "Remplacer le bouton quand les services sont prêts",
            "Suivre clics, réservations et commandes",
          ],
        },
        {
          heading: "Mesures à suivre",
          items: [
            "Clics Google",
            "Tables converties",
            "Commandes à emporter",
            "Réservations confirmées",
            "Coût par conversion",
          ],
        },
      ],
      links: [
        { href: "/restaurateurs/geneve", label: "Voir la plateforme restaurateur" },
        { href: "/restaurateurs/alternative-commission-couvert", label: "Comparer les coûts" },
        { href: "/contact", label: "Contacter TOK" },
      ],
    },
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "Optimisation Google Business pour restaurants",
        provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
        areaServed: { "@type": "City", name: "Genève", addressCountry: "CH" },
        serviceType:
          "Audit du bouton Google Business, tracking des clics Google Maps et conversion en réservations directes",
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Accueil",
            item: `${CANONICAL_ORIGIN}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Restaurateurs Genève",
            item: `${CANONICAL_ORIGIN}/restaurateurs/geneve`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: "Google Business",
            item: `${CANONICAL_ORIGIN}/restaurateurs/google-business`,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Pourquoi créer une page dédiée à Google Business ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Parce que les clients qui arrivent depuis Google ont déjà une intention forte. TOK aide à convertir ces clics en réservations, commandes et données mesurables.",
            },
          },
          {
            "@type": "Question",
            name: "Comment mesurer les clics Google avec TOK ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Les liens peuvent porter une source Google Business, puis les conversions sont rapprochées des réservations, commandes, paiements et demandes de contact.",
            },
          },
          {
            "@type": "Question",
            name: "Faut-il abandonner les autres plateformes immédiatement ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Non. La page Google Business sert d'abord à tester un canal direct, mesurer la conversion et réduire progressivement la dépendance si les chiffres le justifient.",
            },
          },
        ],
      },
    ],
  },
  {
    path: "/restaurateurs/alternative-commission-couvert",
    title: "Commission par couvert restaurant : alternative et comparatif marge | TOK",
    description:
      "Comparez commission par couvert, no-show, groupes, coût d'acquisition et tarif fixe par table pour choisir un modèle plus prévisible pour votre restaurant.",
    priority: "0.8",
    changefreq: "weekly",
    staticContent: {
      heading: "Commission par couvert : comparez avant de choisir.",
      paragraphs: [
        "Une commission par couvert peut sembler simple, mais elle change avec les groupes, les no-shows, le ticket moyen et le volume.",
        "Cette page comparative aide le restaurateur à lire le coût d'acquisition, la marge, les scénarios de salle et les objections avant de déplacer ses ventes.",
      ],
      sections: [
        {
          heading: "Simulation économique",
          items: [
            "Tables prévues par mois",
            "Couverts par table",
            "Commission par couvert",
            "No-show et annulations",
            "Coût TOK par couvert honoré",
          ],
        },
        {
          heading: "Comparatif modèle économique",
          items: [
            "Déclencheur du coût",
            "Prévisibilité",
            "No-show et changements",
            "Marge",
            "Question à trancher",
            "Décision progressive",
          ],
        },
        {
          heading: "Scénarios chiffrés",
          items: [
            "Table de 2",
            "Groupe de 6",
            "Service irrégulier",
            "Coût d'acquisition",
            "Marge prévisible",
          ],
        },
      ],
      links: [
        { href: "/restaurateurs/geneve", label: "Voir la solution complète" },
        { href: "/restaurateurs/google-business", label: "Auditer Google Business" },
        { href: "/contact", label: "Demander une comparaison" },
      ],
    },
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "Comparatif commission par couvert pour restaurants",
        provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
        areaServed: ["Genève", "Lausanne", "Suisse romande"],
        serviceType: "Comparaison économique entre commission par couvert, coût d'acquisition et tarif fixe par table",
        url: `${CANONICAL_ORIGIN}/restaurateurs/alternative-commission-couvert`,
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Accueil",
            item: `${CANONICAL_ORIGIN}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Restaurateurs",
            item: `${CANONICAL_ORIGIN}/restaurateurs/geneve`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: "Alternative commission par couvert",
            item: `${CANONICAL_ORIGIN}/restaurateurs/alternative-commission-couvert`,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Qu'est-ce qu'une commission par couvert ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "C'est un modèle où le coût varie selon le nombre de personnes assises ou apportées par le canal. Il peut vite changer selon les groupes, le ticket moyen et le volume.",
            },
          },
          {
            "@type": "Question",
            name: "Comment intégrer les no-shows dans le calcul ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Il faut comparer le coût du canal, les tables réellement honorées, les annulations, les acomptes éventuels et la capacité perdue pendant le service.",
            },
          },
          {
            "@type": "Question",
            name: "TOK doit-il remplacer immédiatement une plateforme existante ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Non. Le restaurateur peut tester TOK sur un canal direct, mesurer le coût d'acquisition et décider ensuite s'il déplace plus de volume.",
            },
          },
        ],
      },
    ],
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
    staticContent: {
      heading: "Centre d'aide TOK : toutes les reponses essentielles",
      paragraphs: [
        "Le centre d'aide TOK couvre les commandes, reservations, paiements, remboursements, retraits, livraisons, Miamz, Tok One, anti-gaspi, ventes flash, notifications, signalements et outils restaurateurs.",
        "Cette page est structuree pour repondre aux questions frequentes des clients, des restaurateurs et des partenaires, avec des reponses courtes et actionnables.",
      ],
      sections: [
        {
          heading: "Clients",
          items: ["Commander", "Reserver", "Suivre une commande", "Choisir le retrait", "Utiliser les Miamz", "Gerer son profil"],
        },
        {
          heading: "Paiements et support",
          items: ["Paiement carte", "TWINT", "PostFinance", "Remboursement", "Signalement", "Notifications"],
        },
        {
          heading: "Restaurateurs",
          items: ["Dashboard", "Campagnes sponsorisees", "Actualites", "CRM clients", "Reservations", "Offres locales"],
        },
      ],
      links: [
        { href: "/contact", label: "Contacter TOK" },
        { href: "/recherche", label: "Trouver un restaurant" },
        { href: "/packs-restaurateur", label: "Packs restaurateurs" },
        { href: "/miamz-solidaires", label: "Comprendre les Miamz" },
      ],
    },
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
        {
          "@type": "Question",
          name: "Quand une commande est-elle confirmee ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Une commande payee par carte, TWINT ou PostFinance doit etre confirmee apres validation du paiement. Le suivi affiche ensuite les etapes disponibles.",
          },
        },
        {
          "@type": "Question",
          name: "Comment demander de l'aide apres une commande ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Depuis le centre d'aide ou la page de commande, contactez TOK avec le numero de commande, le restaurant concerne et le probleme rencontre.",
          },
        },
        {
          "@type": "Question",
          name: "Un restaurateur peut-il publier des actualites sur TOK ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui. Les restaurateurs peuvent publier des actualites, medias, offres et campagnes sponsorisees selon les modules actives sur leur compte.",
          },
        },
        {
          "@type": "Question",
          name: "Comment fonctionne le signalement d'un contenu ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Un signalement doit etre legitime. Les campagnes abusives ou le harcelement d'un concurrent peuvent entrainer des mesures sur le compte.",
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
    path: "/cookies",
    title: "Politique relative aux cookies | TOK",
    description: "Consultez la politique TOK relative aux cookies, au stockage local et à vos choix de confidentialité.",
    priority: "0.3",
    changefreq: "monthly",
  },
  {
    path: "/conditions-restaurateurs",
    title: "Conditions pour les restaurateurs | TOK",
    description: "Consultez les conditions applicables aux restaurants partenaires et aux services professionnels TOK.",
    priority: "0.3",
    changefreq: "monthly",
  },
  {
    path: "/tok-pulse",
    title: "TOK Pulse - raccourcis et expérience mobile TOK",
    description:
      "Découvrez TOK Pulse, les raccourcis mobiles pour réserver, consulter les offres flash et accéder rapidement aux services TOK.",
    priority: "0.5",
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
  "/commercial",
  "/profil",
  "/memoire-tok",
  "/notifications",
  "/commandes",
  "/commande",
  "/reservations",
  "/mon-espace",
  "/compte",
  "/espace-client",
  "/mes-avis",
  "/points-cadeau",
  "/panier",
  "/auth",
  "/oauth",
  "/espaces",
  "/r",
  "/tok-connect/developer",
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

function sanitizeStructuredData(value) {
  if (!value) return null;
  const entries = (Array.isArray(value) ? value : [value]).filter(
    (entry) => entry && entry["@type"] !== "FAQPage",
  );
  if (entries.length === 0) return null;
  return Array.isArray(value) ? entries : entries[0];
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

function buildRestaurantSeoPath(restaurant) {
  const citySlug = slugify(restaurant.city || "geneve");
  const restaurantSlug = slugify(restaurant.slug || "");

  if (citySlug && restaurantSlug) {
    return `/restaurants/${citySlug}/r/${restaurantSlug}`;
  }

  return `/restaurant/${restaurant.id}`;
}

function toAbsoluteSeoImage(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate, CANONICAL_ORIGIN);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function buildPriceRange(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return undefined;
  const level = Math.min(Math.max(Math.round(numericValue), 1), 4);
  return Array.from({ length: level }, () => "CHF").join(" ");
}

const STRICT_DYNAMIC_SEO = process.env.SEO_STRICT_DYNAMIC === "1"
  || (process.env.SEO_STRICT_DYNAMIC !== "0" && process.env.VERCEL_ENV === "production");

class DynamicSeoCollectionError extends Error {}

const PUBLIC_FEATURE_BY_PATH = new Map([
  ["/anti-gaspi", "anti-gaspi"],
  ["/ventes-flash", "ventes-flash"],
  ["/actualites", "actualites-sociales"],
  ["/creneaux-garantis", "creneaux-garantis"],
  ["/flex-prix-bas", "flex-prix-bas"],
  ["/match-groupes", "match-groupes"],
  ["/multi-stop", "multi-stop"],
  ["/multi-restaurant", "multi-restaurant"],
  ["/chefs-table", "chefs-table"],
  ["/zero-attente", "zero-attente"],
  ["/garantie-qualite", "garantie-qualite"],
  ["/budget-auto", "budget-auto"],
  ["/abonnement", "abonnement"],
  ["/tok-one", "tok-one"],
  ["/tok-pulse", "tok-pulse"],
  ["/tok-connect", "tok-connect"],
]);

const DEFAULT_DISABLED_SEO_FEATURES = new Set(["tok-pulse"]);

function handleDynamicSeoFailure(source, cause) {
  const detail = cause instanceof Error ? cause.message : String(cause || "réponse invalide");
  const failure = new DynamicSeoCollectionError(`[seo] Collecte ${source} impossible : ${detail}`);
  if (STRICT_DYNAMIC_SEO) throw failure;
  console.warn(failure.message);
  return [];
}

async function collectDisabledSeoFeatures() {
  loadPublicEnvFiles();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    handleDynamicSeoFailure("feature flags", "variables Supabase absentes");
    return DEFAULT_DISABLED_SEO_FEATURES;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("feature_flags")
      .select("name,is_active");

    if (error || !Array.isArray(data)) {
      handleDynamicSeoFailure("feature flags", error || "réponse non tabulaire");
      return DEFAULT_DISABLED_SEO_FEATURES;
    }

    return new Set(
      data
        .filter((flag) => flag?.is_active === false && typeof flag?.name === "string")
        .map((flag) => flag.name),
    );
  } catch (error) {
    if (error instanceof DynamicSeoCollectionError) throw error;
    handleDynamicSeoFailure("feature flags", error);
    return DEFAULT_DISABLED_SEO_FEATURES;
  }
}

function dedupePages(pages) {
  const byPath = new Map();
  for (const page of pages) {
    const normalized = normalizePath(page.path);
    if (!isIndexablePath(normalized)) continue;
    byPath.set(normalized, { ...page, path: normalized });
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
  if (!supabaseUrl || !supabaseKey) return handleDynamicSeoFailure("restaurants", "variables Supabase absentes");

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const data = [];
    let totalRestaurantCount = null;
    for (let offset = 0; offset < MAX_DYNAMIC_RESTAURANTS; offset += RESTAURANT_PRERENDER_BATCH_SIZE) {
      const batchSize = Math.min(RESTAURANT_PRERENDER_BATCH_SIZE, MAX_DYNAMIC_RESTAURANTS - offset);
      const { data: batch, error, count } = await supabase
        .from("restaurants")
        .select(
          "id, name, slug, city, cuisine_type, image_url, rating, review_count, updated_at, description, address, phone, price_range, opening_hours, supports_reservation, delivery_available, supports_pickup",
          offset === 0 ? { count: "exact" } : undefined,
        )
        .eq("is_active", true)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (error || !Array.isArray(batch)) return handleDynamicSeoFailure("restaurants", error || "réponse non tabulaire");
      if (offset === 0 && Number.isFinite(count)) totalRestaurantCount = Number(count);
      data.push(...batch);
      if (batch.length < batchSize) break;
    }

    if (totalRestaurantCount !== null && totalRestaurantCount > MAX_DYNAMIC_RESTAURANTS) {
      console.warn(
        `SEO restaurants: ${totalRestaurantCount} fiches actives détectées, mais la limite de pré-rendu est ${MAX_DYNAMIC_RESTAURANTS}. `
          + "Augmentez SEO_SITEMAP_MAX_RESTAURANTS pour conserver une couverture exhaustive.",
      );
    }

    const restaurants = data.filter((restaurant) => restaurant?.id && restaurant?.name);
    const localGroups = new Map();

    const registerLocalPage = (page, restaurant) => {
      const pathName = `/restaurants/${page.slug}`;
      const existing = localGroups.get(pathName) || { page, restaurants: [], lastmod: null };
      existing.restaurants.push(restaurant);
      if (!existing.lastmod || String(restaurant.updated_at || "") > String(existing.lastmod || "")) {
        existing.lastmod = restaurant.updated_at;
      }
      localGroups.set(pathName, existing);
    };

    const restaurantPages = restaurants.map((restaurant) => {
      const city = String(restaurant.city || "Genève").trim() || "Genève";
      const citySlug = slugify(city);
      const cuisine = String(restaurant.cuisine_type || "").trim();
      const cuisineSlugs = extractRestaurantCuisineSlugs(cuisine);
      const restaurantPath = buildRestaurantSeoPath(restaurant);

      if (citySlug) {
        registerLocalPage({
          type: "city",
          slug: citySlug,
          citySlug,
          city,
        }, restaurant);
      }
      for (const cuisineSlug of cuisineSlugs) {
        const cuisineDefinition = LOCAL_CUISINES.find((item) => item.slug === cuisineSlug);
        registerLocalPage({
          type: "cuisine",
          slug: `${citySlug}/${cuisineSlug}`,
          citySlug,
          city,
          cuisineSlug,
          cuisine: cuisineDefinition?.label || cuisineSlug,
        }, restaurant);
      }
      for (const intent of LOCAL_INTENTS.filter((candidate) => candidate.matches(restaurant))) {
        registerLocalPage({
          type: "intent",
          slug: `${citySlug}/${intent.slug}`,
          citySlug,
          city,
          intentSlug: intent.slug,
        }, restaurant);
      }

      const restaurantDescription = restaurant.description ||
        `${restaurant.name}, restaurant ${cuisine || "local"} à ${city}. Consultez les services disponibles pour réserver ou commander sur TOK.`;

      return {
        path: restaurantPath,
        title: `${restaurant.name} à ${city} : menu et réservation | TOK`,
        description: restaurantDescription,
        priority: "0.7",
        changefreq: "weekly",
        lastmod: restaurant.updated_at,
        image: toAbsoluteSeoImage(restaurant.image_url) || DEFAULT_IMAGE,
        staticContent: {
          heading: `${restaurant.name}, restaurant à ${city}`,
          paragraphs: [restaurantDescription],
          sections: [
            {
              heading: "Informations pratiques",
              items: [cuisine, restaurant.address, restaurant.phone].filter(Boolean),
            },
          ],
          links: [
            { href: `/restaurants/${citySlug}`, label: `Restaurants à ${city}` },
            { href: "/recherche", label: "Rechercher un restaurant" },
          ],
        },
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Restaurant",
            "@id": canonicalUrl(restaurantPath),
            name: restaurant.name,
            description: restaurantDescription,
            image: toAbsoluteSeoImage(restaurant.image_url),
            servesCuisine: cuisine || undefined,
            telephone: restaurant.phone || undefined,
            priceRange: buildPriceRange(restaurant.price_range),
            address: {
              "@type": "PostalAddress",
              streetAddress: restaurant.address || undefined,
              addressLocality: city,
              addressCountry: "CH",
            },
            aggregateRating: restaurant.rating && Number(restaurant.review_count) > 0
              ? {
                "@type": "AggregateRating",
                ratingValue: Number(restaurant.rating),
                reviewCount: Number(restaurant.review_count),
                bestRating: 10,
                worstRating: 1,
              }
              : undefined,
            url: canonicalUrl(restaurantPath),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Accueil", item: `${CANONICAL_ORIGIN}/` },
              { "@type": "ListItem", position: 2, name: `Restaurants à ${city}`, item: canonicalUrl(`/restaurants/${citySlug}`) },
              { "@type": "ListItem", position: 3, name: restaurant.name, item: canonicalUrl(restaurantPath) },
            ],
          },
        ],
      };
    });

    const cityCategoryPages = [...localGroups.values()].map(({ page, restaurants: localRestaurants, lastmod }) =>
      buildLocalSeoPage(page, {
        priority: page.type === "city" ? "0.8" : "0.7",
        lastmod,
        restaurants: localRestaurants,
      }),
    );

    return [...cityCategoryPages, ...restaurantPages];
  } catch (error) {
    if (error instanceof DynamicSeoCollectionError) throw error;
    return handleDynamicSeoFailure("restaurants", error);
  }
}

function compactActualitesSeoText(value, maxLength) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function firstNonEmptySeoText(...values) {
  return values.find((value) => String(value || "").trim().length > 0) || "";
}

function readActualitesImageAnalysis(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const analysis = metadata.image_analysis;
  return analysis && typeof analysis === "object" && !Array.isArray(analysis) ? analysis : {};
}

async function collectDynamicActualitesPages() {
  loadPublicEnvFiles();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return handleDynamicSeoFailure("actualités", "variables Supabase absentes");

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const data = [];
    let totalActualitesCount = null;
    for (let offset = 0; offset < MAX_DYNAMIC_ACTUALITES; offset += ACTUALITES_PRERENDER_BATCH_SIZE) {
      const batchSize = Math.min(ACTUALITES_PRERENDER_BATCH_SIZE, MAX_DYNAMIC_ACTUALITES - offset);
      const { data: batch, error, count } = await supabase
        .from("social_posts")
        .select(
          "id,body,post_type,published_at,created_at,updated_at,status,visibility,restaurants(id,name,city,cuisine_type,image_url),social_post_media(id,media_url,alt_text,metadata,sort_order,media_type)",
          offset === 0 ? { count: "exact" } : undefined,
        )
        .eq("status", "published")
        .eq("visibility", "public")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (error || !Array.isArray(batch)) return handleDynamicSeoFailure("actualités", error || "réponse non tabulaire");
      if (offset === 0 && Number.isFinite(count)) totalActualitesCount = Number(count);
      data.push(...batch);
      if (batch.length < batchSize) break;
    }

    if (totalActualitesCount !== null && totalActualitesCount > MAX_DYNAMIC_ACTUALITES) {
      console.warn(
        `SEO actualités: ${totalActualitesCount} publications détectées, mais la limite de pré-rendu est ${MAX_DYNAMIC_ACTUALITES}. `
          + "Augmentez SEO_SITEMAP_MAX_ACTUALITES pour conserver une couverture exhaustive.",
      );
    }

    let thinActualitesCount = 0;
    const pages = data.flatMap((post) => {
      if (!post?.id) return [];
      const restaurant = Array.isArray(post.restaurants) ? post.restaurants[0] : post.restaurants;
      const restaurantName = String(restaurant?.name || "Restaurant TOK").trim() || "Restaurant TOK";
      const media = Array.isArray(post.social_post_media)
        ? [...post.social_post_media].sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))
        : [];
      const primaryImage = media.find((item) => item?.media_type === "image" && item?.media_url) || null;
      const analysis = readActualitesImageAnalysis(primaryImage?.metadata);
      const indexableTextLength = Math.max(
        String(post.body || "").trim().length,
        String(analysis.description || "").trim().length,
        String(analysis.short_description || "").trim().length,
      );
      const isThinActualite = indexableTextLength < MIN_ACTUALITE_TEXT_LENGTH;
      if (isThinActualite) thinActualitesCount += 1;
      const city = String(restaurant?.city || "").trim();
      const cuisine = String(restaurant?.cuisine_type || "").trim();
      const fallbackSubject = compactActualitesSeoText(firstNonEmptySeoText(post.body, analysis.short_description, post.post_type), 42);
      const fallbackTitle = fallbackSubject
        ? `${fallbackSubject} — ${restaurantName}`
        : `Actualité de ${restaurantName}`;
      const title = compactActualitesSeoText(firstNonEmptySeoText(analysis.seo_title, fallbackTitle), 62);
      const contextualDescription = `Découvrez cette publication de ${restaurantName}${city ? ` à ${city}` : ""} sur TOK.`;
      const description = compactActualitesSeoText(
        firstNonEmptySeoText(analysis.seo_description, post.body, analysis.short_description, contextualDescription),
        170,
      );
      const imageAlt = compactActualitesSeoText(
        firstNonEmptySeoText(primaryImage?.alt_text, analysis.alt_text, `Actualité publiée par ${restaurantName}`),
        180,
      );
      const postPath = `/actualites/${post.id}`;
      const publishedAt = post.published_at || post.created_at;
      const updatedAt = post.updated_at || publishedAt;

      return [{
        path: postPath,
        title: `${title} | TOK`,
        description,
        priority: "0.7",
        changefreq: "weekly",
        lastmod: updatedAt,
        image: primaryImage?.media_url || restaurant?.image_url || DEFAULT_IMAGE,
        imageAlt,
        ogType: "article",
        publishedAt,
        modifiedAt: updatedAt,
        includeInSitemap: !isThinActualite,
        robots: isThinActualite ? "noindex,follow,noarchive" : undefined,
        staticContent: {
          heading: title,
          paragraphs: [compactActualitesSeoText(post.body || analysis.description || description, 1200)],
          sections: [
            {
              heading: "À propos du restaurant",
              items: [restaurantName, city, cuisine].filter(Boolean),
            },
          ],
          links: [
            { href: "/actualites", label: "Toutes les actualités" },
            { href: "/recherche", label: "Rechercher un restaurant" },
          ],
        },
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Article",
          "@id": canonicalUrl(postPath),
          mainEntityOfPage: canonicalUrl(postPath),
          headline: title,
          description,
          articleBody: compactActualitesSeoText(post.body || analysis.description || description, 5000),
          datePublished: publishedAt,
          dateModified: updatedAt,
          author: {
            "@type": "Organization",
            name: restaurantName,
          },
          publisher: {
            "@type": "Organization",
            name: "TOK",
            logo: {
              "@type": "ImageObject",
              url: `${CANONICAL_ORIGIN}/logotok.png`,
            },
          },
          image: primaryImage?.media_url
            ? {
              "@type": "ImageObject",
              url: primaryImage.media_url,
              caption: imageAlt,
            }
            : undefined,
        },
      }];
    });
    if (thinActualitesCount > 0) {
      console.warn(
        `SEO actualités: ${thinActualitesCount} publication(s) trop courte(s) servie(s) en noindex et exclue(s) du sitemap.`,
      );
    }
    return pages;
  } catch (error) {
    if (error instanceof DynamicSeoCollectionError) throw error;
    return handleDynamicSeoFailure("actualités", error);
  }
}

async function collectSeoPages() {
  const [restaurantPages, actualitesPages, disabledFeatures] = await Promise.all([
    collectDynamicRestaurantPages(),
    collectDynamicActualitesPages(),
    collectDisabledSeoFeatures(),
  ]);
  const publicPages = PUBLIC_SEO_PAGES.filter(
    (page) => {
      const featureName = PUBLIC_FEATURE_BY_PATH.get(page.path);
      return !featureName || !disabledFeatures.has(featureName);
    },
  );
  const enabledActualitesPages = disabledFeatures.has("actualites-sociales") ? [] : actualitesPages;
  const pages = dedupePages([...publicPages, ...restaurantPages, ...enabledActualitesPages]);
  const minimumInventoryForLocalPage = (page) =>
    page.localPageType === "city" ? MIN_LOCAL_RESTAURANTS : MIN_SPECIALIZED_LOCAL_RESTAURANTS;
  const thinLocalPages = pages.filter(
    (page) => page.seoKind === "local-listing"
      && Number(page.inventoryCount || 0) < minimumInventoryForLocalPage(page),
  );
  if (thinLocalPages.length > 0) {
    console.warn(
      `SEO local: ${thinLocalPages.length} page(s) sans inventaire suffisant servie(s) en noindex et exclue(s) du sitemap.`,
    );
  }
  return pages.map((page) => {
    const thinLocalPage = page.seoKind === "local-listing"
      && Number(page.inventoryCount || 0) < minimumInventoryForLocalPage(page);
    return thinLocalPage
      ? { ...page, includeInSitemap: false, robots: "noindex,follow,noarchive" }
      : page;
  });
}

function normalizeSitemapDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const date = parsed.toISOString().slice(0, 10);
  return date <= new Date().toISOString().slice(0, 10) ? date : "";
}

function renderUrlSitemap(pages) {
  const rows = pages.map((page) => {
    const lastmod = normalizeSitemapDate(page.lastmod);
    const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : "";
    const image = page.image && page.image !== DEFAULT_IMAGE ? toAbsoluteSeoImage(page.image) : undefined;
    const imageTag = image
      ? `\n    <image:image>\n      <image:loc>${escapeXml(image)}</image:loc>\n      <image:title>${escapeXml(page.imageAlt || page.title)}</image:title>\n    </image:image>`
      : "";
    return `  <url>
    <loc>${escapeXml(canonicalUrl(page.path))}</loc>${lastmodTag}${imageTag}
    <changefreq>${escapeXml(page.changefreq || "weekly")}</changefreq>
    <priority>${escapeXml(page.priority || "0.5")}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${rows.join("\n")}
</urlset>
`;
}

function buildSitemapFiles(pages) {
  const groups = new Map(SITEMAP_GROUPS.map(({ fileName }) => [fileName, []]));
  for (const page of pages) {
    if (page.includeInSitemap === false) continue;
    const group = SITEMAP_GROUPS.find(({ matches }) => matches(page));
    groups.get(group.fileName).push(page);
  }

  return [...groups.entries()]
    .map(([fileName, groupedPages]) => ({
      fileName,
      pages: groupedPages,
      content: renderUrlSitemap(groupedPages),
      lastmod: groupedPages.map((page) => normalizeSitemapDate(page.lastmod)).filter(Boolean).sort().at(-1) || "",
    }));
}

function renderSitemapIndex(sitemapFiles) {
  const rows = sitemapFiles.filter(({ pages }) => pages.length > 0).map(({ fileName, lastmod }) => {
    const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : "";
    return `  <sitemap>\n    <loc>${escapeXml(`${CANONICAL_ORIGIN}/${fileName}`)}</loc>${lastmodTag}\n  </sitemap>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join("\n")}
</sitemapindex>
`;
}

function renderRobots() {
  return `# Search engines and answer engines used for discovery
User-agent: Googlebot
User-agent: bingbot
User-agent: Applebot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
Allow: /

# Training-only and bulk dataset crawlers
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: CCBot
User-agent: Bytespider
User-agent: meta-externalagent
Disallow: /

# Other well-behaved crawlers may discover public pages
User-agent: *
Allow: /

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

function renderStaticList(items = []) {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderStaticLinks(links = []) {
  if (!links.length) return "";
  return `<nav aria-label="Liens utiles TOK">${links
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join("")}</nav>`;
}

function renderStaticContent(page) {
  const staticContent = page.staticContent || {
    heading: page.title,
    paragraphs: [page.description],
    sections: [],
    links: [],
  };

  const paragraphs = (staticContent.paragraphs || [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const sections = (staticContent.sections || [])
    .map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${renderStaticList(section.items || [])}</section>`)
    .join("");

  return `<section id="tok-prerendered-content" data-prerendered="true" aria-label="Contenu public TOK" style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px 24px;max-width:1080px;margin:0 auto;color:#111827;background:#ffffff">
  <h1 style="font-size:clamp(2rem,5vw,4rem);line-height:1.02;margin:0 0 20px;font-weight:900">${escapeHtml(staticContent.heading)}</h1>
  <div style="font-size:1rem;line-height:1.7;color:#4b5563;max-width:760px">${paragraphs}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-top:32px">${sections}</div>
  ${renderStaticLinks(staticContent.links || [])}
</section>`;
}

function renderNotFoundHtml(baseHtml) {
  let html = upsertTitle(baseHtml, "Page introuvable | TOK");
  html = upsertTag(
    html,
    /<meta\s+name="description"[^>]*>/i,
    '<meta name="description" content="Cette page n’existe pas ou n’est plus disponible." />',
  );
  html = upsertTag(
    html,
    /<meta\s+name="robots"[^>]*>/i,
    '<meta name="robots" content="noindex,nofollow,noarchive" />',
  );
  html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/i, "");
  html = html.replace(/\s*<meta\s+property="og:url"[^>]*>/i, "");
  html = html.replace(/\s*<script\s+id="tok-page-json-ld"[\s\S]*?<\/script>/i, "");
  html = html.replace(
    /<div id="root"><\/div>/i,
    '<div id="root"><main style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;min-height:100vh;display:grid;place-items:center;padding:32px;text-align:center"><section><p style="font-weight:800;text-transform:uppercase;letter-spacing:.18em">Erreur 404</p><h1 style="font-size:clamp(2rem,6vw,4rem);margin:.5rem 0">Page introuvable</h1><p>Cette adresse est incorrecte ou la page a été déplacée.</p><p><a href="/">Retour à l’accueil</a></p></section></main></div>',
  );
  return html;
}

function renderPreRenderedHtml(baseHtml, page) {
  const canonical = canonicalUrl(page.path);
  const image = page.image || DEFAULT_IMAGE;
  const imageAlt = page.imageAlt || page.title;
  let html = upsertTitle(baseHtml, page.title);
  html = upsertTag(html, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(page.description)}" />`);
  html = upsertTag(
    html,
    /<meta\s+name="robots"[^>]*>/i,
    `<meta name="robots" content="${escapeHtml(page.robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1")}" />`,
  );
  html = upsertTag(html, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  html = upsertTag(html, /<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="${escapeHtml(page.ogType || "website")}" />`);
  html = upsertTag(html, /<meta\s+property="og:site_name"[^>]*>/i, '<meta property="og:site_name" content="TOK" />');
  html = upsertTag(html, /<meta\s+property="og:locale"[^>]*>/i, '<meta property="og:locale" content="fr_CH" />');
  html = upsertTag(html, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(page.title)}" />`);
  html = upsertTag(html, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(page.description)}" />`);
  html = upsertTag(html, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  html = upsertTag(html, /<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${escapeHtml(image)}" />`);
  html = upsertTag(html, /<meta\s+property="og:image:alt"[^>]*>/i, `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />`);
  if (page.imageWidth) {
    html = upsertTag(html, /<meta\s+property="og:image:width"[^>]*>/i, `<meta property="og:image:width" content="${escapeHtml(String(page.imageWidth))}" />`);
  }
  if (page.imageHeight) {
    html = upsertTag(html, /<meta\s+property="og:image:height"[^>]*>/i, `<meta property="og:image:height" content="${escapeHtml(String(page.imageHeight))}" />`);
  }
  html = upsertTag(html, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`);
  html = upsertTag(html, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`);
  html = upsertTag(html, /<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${escapeHtml(image)}" />`);
  html = upsertTag(html, /<meta\s+name="twitter:image:alt"[^>]*>/i, `<meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />`);
  if (page.publishedAt) {
    html = upsertTag(html, /<meta\s+property="article:published_time"[^>]*>/i, `<meta property="article:published_time" content="${escapeHtml(page.publishedAt)}" />`);
  }
  if (page.modifiedAt) {
    html = upsertTag(html, /<meta\s+property="article:modified_time"[^>]*>/i, `<meta property="article:modified_time" content="${escapeHtml(page.modifiedAt)}" />`);
  }
  html = html.replace(/\s*<script\s+id="tok-page-json-ld"[\s\S]*?<\/script>/i, "");
  const structuredData = sanitizeStructuredData(page.jsonLd);
  if (structuredData) {
    html = html.replace(
      /<\/head>/i,
      `  <script id="tok-page-json-ld" type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>\n</head>`,
    );
  }
  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root">${renderStaticContent(page)}</div>`,
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
  const sitemapFiles = buildSitemapFiles(pages);
  const sitemap = renderSitemapIndex(sitemapFiles);
  const robots = renderRobots();

  await writeIfDirectoryExists(PUBLIC_DIR, "sitemap.xml", sitemap);
  for (const sitemapFile of sitemapFiles) {
    await writeIfDirectoryExists(PUBLIC_DIR, sitemapFile.fileName, sitemapFile.content);
  }
  await writeIfDirectoryExists(PUBLIC_DIR, "robots.txt", robots);

  if (!PUBLIC_ONLY) {
    const baseIndexPath = path.join(DIST_DIR, "index.html");
    const baseHtml = await readFile(baseIndexPath, "utf8");
    await writeIfDirectoryExists(DIST_DIR, "404.html", renderNotFoundHtml(baseHtml));
    await writeIfDirectoryExists(DIST_DIR, "sitemap.xml", sitemap);
    for (const sitemapFile of sitemapFiles) {
      await writeIfDirectoryExists(DIST_DIR, sitemapFile.fileName, sitemapFile.content);
    }
    await writeIfDirectoryExists(DIST_DIR, "robots.txt", robots);

    for (const page of pages) {
      const outPath = outputPathForRoute(page.path);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, renderPreRenderedHtml(baseHtml, page), "utf8");
    }
  }

  const activeSitemapCount = sitemapFiles.filter(({ pages: sitemapPages }) => sitemapPages.length > 0).length;
  console.log(`SEO prerender ready: ${pages.length} public route(s) across ${activeSitemapCount} sitemap(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
