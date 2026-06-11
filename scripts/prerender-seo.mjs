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
  ["geneve/eaux-vives", "Restaurants aux Eaux-Vives"],
  ["geneve/plainpalais", "Restaurants à Plainpalais"],
  ["geneve/paquis", "Restaurants aux Pâquis"],
  ["geneve/carouge", "Restaurants à Carouge"],
  ["geneve/champel", "Restaurants à Champel"],
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

function buildRestaurantSeoPath(restaurant) {
  const citySlug = slugify(restaurant.city || "geneve");
  const restaurantSlug = slugify(restaurant.slug || restaurant.name);

  if (citySlug && restaurantSlug) {
    return `/restaurants/${citySlug}/${restaurantSlug}`;
  }

  return `/restaurant/${restaurant.id}`;
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
      .select("id, name, slug, city, cuisine_type, image_url, rating, review_count, updated_at")
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
        const restaurantPath = buildRestaurantSeoPath(restaurant);
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
            path: restaurantPath,
            title: `${restaurant.name} | Restaurant sur TOK`,
            description: `${restaurant.name} sur TOK : ${cuisine || "restaurant"} à ${city}, réservation, commande et offres locales.`,
            priority: "0.7",
            changefreq: "weekly",
            lastmod: restaurant.updated_at,
            image: restaurant.image_url || DEFAULT_IMAGE,
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "Restaurant",
              "@id": canonicalUrl(restaurantPath),
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
              url: canonicalUrl(restaurantPath),
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

  return `<noscript><section id="tok-prerendered-content" aria-label="Contenu public TOK" style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px 24px;max-width:1080px;margin:0 auto;color:#111827;background:#ffffff">
  <h1 style="font-size:clamp(2rem,5vw,4rem);line-height:1.02;margin:0 0 20px;font-weight:900">${escapeHtml(staticContent.heading)}</h1>
  <div style="font-size:1rem;line-height:1.7;color:#4b5563;max-width:760px">${paragraphs}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-top:32px">${sections}</div>
  ${renderStaticLinks(staticContent.links || [])}
</section></noscript>`;
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
    `<div id="root"></div>${renderStaticContent(page)}`,
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
