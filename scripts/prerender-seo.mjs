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
const MAX_DYNAMIC_ACTUALITES = Math.max(1, Number(process.env.SEO_SITEMAP_MAX_ACTUALITES || 5000) || 5000);
const ACTUALITES_PRERENDER_BATCH_SIZE = 500;

const STATIC_LOCAL_PAGES = [
  ["geneve", "Genève"],
  ["lausanne", "Lausanne"],
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
  { slug: "fribourg", label: "Fribourg", districts: [] },
  { slug: "neuchatel", label: "Neuchâtel", districts: [] },
  { slug: "nyon", label: "Nyon", districts: [] },
  { slug: "vevey", label: "Vevey", districts: [] },
  { slug: "montreux", label: "Montreux", districts: [] },
  { slug: "yverdon-les-bains", label: "Yverdon-les-Bains", districts: [] },
];

const LOCAL_CUISINES = [
  { slug: "pizza", label: "Pizza" },
  { slug: "sushi", label: "Sushi" },
  { slug: "burger", label: "Burger" },
  { slug: "kebab", label: "Kebab" },
  { slug: "italien", label: "Italien" },
  { slug: "asiatique", label: "Asiatique" },
  { slug: "japonais", label: "Japonais" },
  { slug: "libanais", label: "Libanais" },
  { slug: "indien", label: "Indien" },
  { slug: "halal", label: "Halal" },
  { slug: "healthy", label: "Healthy" },
  { slug: "brunch", label: "Brunch" },
  { slug: "dessert", label: "Dessert" },
  { slug: "africain", label: "Africain" },
  { slug: "bistro", label: "Bistro" },
  { slug: "street-food", label: "Street food" },
  { slug: "coreen", label: "Coréen" },
  { slug: "grec", label: "Grec" },
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

const RICH_LOCAL_PAGES = [
  ...LOCAL_CITIES.filter((city) => STATIC_LOCAL_PAGES.some(([slug]) => slug === city.slug)).map((city) => ({
    type: "city",
    slug: city.slug,
    citySlug: city.slug,
    city: city.label,
  })),
  ...LOCAL_CITIES.flatMap((city) =>
    city.districts.filter((districtSlug) =>
      STATIC_LOCAL_PAGES.some(([slug]) => slug === `${city.slug}/${districtSlug}`),
    ).map((districtSlug) => ({
      type: "district",
      slug: `${city.slug}/${districtSlug}`,
      citySlug: city.slug,
      city: city.label,
      districtSlug,
      district: LOCAL_DISTRICTS[districtSlug] || districtSlug.replace(/-/g, " "),
    })),
  ),
];

function buildLocalHeading(page) {
  if (page.type === "cuisine") return `${page.cuisine} à ${page.city} : commander, réserver et comparer`;
  if (page.type === "district") return `Restaurants à ${page.district}, ${page.city}`;
  return `Restaurants à ${page.city} : réservation, commande et offres locales`;
}

function buildLocalTitle(page) {
  if (page.type === "cuisine") return `${page.cuisine} à ${page.city} : commande et réservation | TOK`;
  if (page.type === "district") return `Restaurants à ${page.district}, ${page.city} | TOK`;
  return `Restaurants à ${page.city} : réserver et commander | TOK`;
}

function buildLocalDescription(page) {
  if (page.type === "cuisine") {
    return `Trouvez les restaurants ${page.cuisine} à ${page.city} sur TOK : réservation, commande, retrait, livraison et offres locales.`;
  }
  if (page.type === "district") {
    return `Découvrez les restaurants proches de ${page.district} à ${page.city} : bonnes adresses, réservation, commande et offres locales sur TOK.`;
  }
  return `Comparez les restaurants à ${page.city} avec TOK : cuisines, quartiers, réservation, commande, anti-gaspi et offres locales.`;
}

function buildLocalLinks(page, restaurants = []) {
  const citySlug = page.citySlug || page.slug.split("/")[0] || "geneve";
  const city = LOCAL_CITIES.find((item) => item.slug === citySlug) || LOCAL_CITIES[0];
  const staticLocalSlugs = new Set(STATIC_LOCAL_PAGES.map(([slug]) => slug));
  const cuisineLinks = LOCAL_CUISINES.filter((cuisine) =>
    staticLocalSlugs.has(`${citySlug}/${cuisine.slug}`),
  ).map((cuisine) => ({
    href: `/restaurants/${citySlug}/${cuisine.slug}`,
    label: `${cuisine.label} à ${city.label}`,
  }));
  const districtLinks = city.districts.filter((districtSlug) =>
    staticLocalSlugs.has(`${citySlug}/${districtSlug}`),
  ).map((districtSlug) => ({
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
    ...cuisineLinks,
    ...districtLinks,
  ].filter((link, index, links) => links.findIndex((candidate) => candidate.href === link.href) === index);
}

function buildLocalStaticContent(page, restaurants = []) {
  const serviceLine = page.type === "cuisine"
    ? `Cette page aide à trouver une adresse ${page.cuisine} à ${page.city}, puis à choisir selon les services disponibles : réservation, commande, retrait, livraison ou offres courtes.`
    : page.type === "district"
      ? `Cette page rassemble les restaurants du quartier ${page.district} à ${page.city}, avec des critères utiles pour réserver, commander et repérer les offres locales.`
      : `Cette page rassemble les restaurants de ${page.city}, les cuisines recherchées, les quartiers utiles, les offres anti-gaspi et les ventes flash.`;
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
        logo: `${CANONICAL_ORIGIN}/logotok.png`,
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
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, slug, city, cuisine_type, image_url, rating, review_count, updated_at, description, address, phone, price_range, opening_hours")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(MAX_DYNAMIC_RESTAURANTS);

    if (error || !Array.isArray(data)) return handleDynamicSeoFailure("restaurants", error || "réponse non tabulaire");

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
      const cuisineSlug = slugify(cuisine);
      const restaurantPath = buildRestaurantSeoPath(restaurant);

      if (citySlug) {
        registerLocalPage({
          type: "city",
          slug: citySlug,
          citySlug,
          city,
        }, restaurant);
      }
      if (citySlug && cuisineSlug) {
        registerLocalPage({
          type: "cuisine",
          slug: `${citySlug}/${cuisineSlug}`,
          citySlug,
          city,
          cuisineSlug,
          cuisine,
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
    for (let offset = 0; offset < MAX_DYNAMIC_ACTUALITES; offset += ACTUALITES_PRERENDER_BATCH_SIZE) {
      const batchSize = Math.min(ACTUALITES_PRERENDER_BATCH_SIZE, MAX_DYNAMIC_ACTUALITES - offset);
      const { data: batch, error } = await supabase
        .from("social_posts")
        .select("id,body,post_type,published_at,created_at,updated_at,status,visibility,restaurants(id,name,city,cuisine_type,image_url),social_post_media(id,media_url,alt_text,metadata,sort_order,media_type)")
        .eq("status", "published")
        .eq("visibility", "public")
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + batchSize - 1);

      if (error || !Array.isArray(batch)) return handleDynamicSeoFailure("actualités", error || "réponse non tabulaire");
      data.push(...batch);
      if (batch.length < batchSize) break;
    }

    return data.flatMap((post) => {
      if (!post?.id) return [];
      const restaurant = Array.isArray(post.restaurants) ? post.restaurants[0] : post.restaurants;
      const restaurantName = String(restaurant?.name || "Restaurant TOK").trim() || "Restaurant TOK";
      const media = Array.isArray(post.social_post_media)
        ? [...post.social_post_media].sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))
        : [];
      const primaryImage = media.find((item) => item?.media_type === "image" && item?.media_url) || null;
      const analysis = readActualitesImageAnalysis(primaryImage?.metadata);
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
  return dedupePages([...publicPages, ...restaurantPages, ...enabledActualitesPages]);
}

function renderSitemap(pages) {
  const rows = pages.map((page) => {
    const lastmod = page.lastmod ? String(page.lastmod).slice(0, 10) : "";
    const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : "";
    return `  <url>
    <loc>${escapeXml(canonicalUrl(page.path))}</loc>${lastmodTag}
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
  return `User-agent: *
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

function renderPreRenderedHtml(baseHtml, page) {
  const canonical = canonicalUrl(page.path);
  const image = page.image || DEFAULT_IMAGE;
  const imageAlt = page.imageAlt || page.title;
  let html = upsertTitle(baseHtml, page.title);
  html = upsertTag(html, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(page.description)}" />`);
  html = upsertTag(html, /<meta\s+name="robots"[^>]*>/i, '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />');
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
