import { useEffect } from "react";

const DEFAULT_BASE_URL = "https://www.thetok.ch";
const DEFAULT_IMAGE_PATH = "/fond3.png";
const INDEX_ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const NOINDEX_ROBOTS = "noindex,nofollow,noarchive";

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
] as const;

const PUBLIC_ROUTE_FALLBACKS: Record<string, { title: string; description: string }> = {
  "/": {
    title: "TOK - Réservez, commandez et profitez des meilleures offres food à Genève",
    description: "Avec TOK, trouvez un restaurant, réservez, commandez et profitez d'offres locales en Suisse romande.",
  },
  "/recherche": {
    title: "Recherche restaurants à Genève et en Suisse romande | TOK",
    description: "Recherchez un restaurant par ville, cuisine, offre, note ou mode de service avec TOK.",
  },
  "/anti-gaspi": {
    title: "Offres anti-gaspi à Genève | TOK",
    description: "Sauvez des invendus et profitez d'offres limitées auprès des restaurants locaux avec TOK.",
  },
  "/ventes-flash": {
    title: "Ventes flash food en Suisse romande | TOK",
    description: "Retrouvez les offres limitées des restaurants partenaires TOK pour commander ou réserver au bon moment.",
  },
  "/creneaux-garantis": { title: "Créneaux garantis | TOK", description: "Découvrez les créneaux de réservation garantis proposés par TOK." },
  "/flex-prix-bas": { title: "Flex prix bas | TOK", description: "Découvrez les avantages Flex prix bas proposés par TOK." },
  "/match-groupes": { title: "Match groupes | TOK", description: "Organisez plus facilement vos repas de groupe avec TOK." },
  "/multi-stop": { title: "Multi-stop | TOK", description: "Composez un parcours food multi-stop avec TOK." },
  "/multi-restaurant": { title: "Multi-restaurant | TOK", description: "Découvrez les expériences multi-restaurant proposées par TOK." },
  "/chefs-table": { title: "Table du Chef | TOK", description: "Découvrez les expériences Table du Chef disponibles sur TOK." },
  "/zero-attente": { title: "Zéro attente | TOK", description: "Précommandez et synchronisez votre arrivée avec Zéro attente sur TOK." },
  "/garantie-qualite": { title: "Garantie qualité | TOK", description: "Découvrez les engagements de qualité et de confiance de TOK." },
  "/budget-auto": { title: "Budget auto | TOK", description: "Maîtrisez votre budget food grâce aux outils TOK." },
  "/abonnement": { title: "Abonnement food et avantages | TOK", description: "Découvrez les abonnements et avantages food proposés par TOK." },
  "/contact": { title: "Contacter TOK", description: "Contactez l'équipe TOK pour toute question sur la plateforme." },
  "/tok-connect": {
    title: "TOK Connect - API et intégrations pour partenaires | TOK",
    description: "Connectez TOK aux hôtels, conciergeries, CRM, applications locales et assistants IA grâce à TOK Connect.",
  },
};

let seoOwnerSequence = 0;

const MANAGED_HEAD_SELECTORS = [
  "meta[name='description']",
  "meta[name='robots']",
  "link[rel='canonical']",
  "meta[property='og:type']",
  "meta[property='og:site_name']",
  "meta[property='og:locale']",
  "meta[property='og:title']",
  "meta[property='og:description']",
  "meta[property='og:url']",
  "meta[property='og:image']",
  "meta[property='og:image:alt']",
  "meta[property='og:image:width']",
  "meta[property='og:image:height']",
  "meta[property='article:published_time']",
  "meta[property='article:modified_time']",
  "meta[name='twitter:card']",
  "meta[name='twitter:title']",
  "meta[name='twitter:description']",
  "meta[name='twitter:image']",
  "meta[name='twitter:image:alt']",
] as const;

function snapshotManagedHead() {
  return MANAGED_HEAD_SELECTORS.map((selector) => ({
    selector,
    element: document.head.querySelector(selector)?.cloneNode(true) as Element | undefined,
  }));
}

function restoreManagedHead(snapshot: ReturnType<typeof snapshotManagedHead>) {
  snapshot.forEach(({ selector, element }) => {
    const current = document.head.querySelector(selector);
    if (element) {
      if (current) current.replaceWith(element.cloneNode(true));
      else document.head.appendChild(element.cloneNode(true));
    } else {
      current?.remove();
    }
  });
}

type SeoMetaInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  ogType?: "website" | "article" | string;
  articlePublishedTime?: string | null;
  articleModifiedTime?: string | null;
  robots?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([name, value]) => {
    element?.setAttribute(name, value);
  });
}

function upsertCanonical(url: string) {
  let element = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = url;
}

function syncOptionalMeta(
  selector: string,
  attributes: Record<string, string>,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    document.head.querySelector(selector)?.remove();
    return;
  }
  upsertMeta(selector, { ...attributes, content: String(value) });
}

function normalizeRoutePath(path: string) {
  const pathOnly = String(path || "/").split(/[?#]/, 1)[0] || "/";
  if (pathOnly === "/") return "/";
  return `/${pathOnly.replace(/^\/+|\/+$/g, "")}`;
}

function isPrivateRoute(path: string) {
  return PRIVATE_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isKnownPublicRoute(path: string) {
  if (PUBLIC_ROUTE_FALLBACKS[path]) return true;
  return [
    "/actualites",
    "/tok-one",
    "/tok-connect",
    "/miamz-solidaires",
    "/cgu",
    "/politique-confidentialite",
    "/cookies",
    "/a-propos",
    "/packs-restaurateur",
    "/conditions-restaurateurs",
    "/restaurateurs/geneve",
    "/restaurateurs/google-business",
    "/restaurateurs/alternative-commission-couvert",
    "/aide",
  ].includes(path);
}

function applyFallbackMetadata(path: string) {
  const normalizedPath = normalizeRoutePath(path);
  const privateRoute = isPrivateRoute(normalizedPath);
  const fallback = PUBLIC_ROUTE_FALLBACKS[normalizedPath] || {
    title: privateRoute
      ? "Espace sécurisé | TOK"
      : isKnownPublicRoute(normalizedPath)
        ? "TOK - Restaurants, offres et réservations"
        : "Page introuvable | TOK",
    description: privateRoute
      ? "Accédez à votre espace sécurisé TOK."
      : isKnownPublicRoute(normalizedPath)
      ? "Découvrez les restaurants, réservations, commandes et offres locales disponibles sur TOK."
      : "Cette page n'est pas disponible.",
  };
  const canonicalUrl = buildCanonicalUrl(normalizedPath);
  const imageUrl = `${DEFAULT_BASE_URL}${DEFAULT_IMAGE_PATH}`;
  const robots = privateRoute || !isKnownPublicRoute(normalizedPath) ? NOINDEX_ROBOTS : INDEX_ROBOTS;

  document.title = fallback.title;
  upsertMeta("meta[name='description']", { name: "description", content: fallback.description });
  upsertMeta("meta[name='robots']", { name: "robots", content: robots });
  upsertCanonical(canonicalUrl);
  upsertMeta("meta[property='og:type']", { property: "og:type", content: "website" });
  upsertMeta("meta[property='og:site_name']", { property: "og:site_name", content: "TOK" });
  upsertMeta("meta[property='og:locale']", { property: "og:locale", content: "fr_CH" });
  upsertMeta("meta[property='og:title']", { property: "og:title", content: fallback.title });
  upsertMeta("meta[property='og:description']", { property: "og:description", content: fallback.description });
  upsertMeta("meta[property='og:url']", { property: "og:url", content: canonicalUrl });
  upsertMeta("meta[property='og:image']", { property: "og:image", content: imageUrl });
  upsertMeta("meta[property='og:image:alt']", { property: "og:image:alt", content: fallback.title });
  upsertMeta("meta[name='twitter:card']", { name: "twitter:card", content: "summary_large_image" });
  upsertMeta("meta[name='twitter:title']", { name: "twitter:title", content: fallback.title });
  upsertMeta("meta[name='twitter:description']", { name: "twitter:description", content: fallback.description });
  upsertMeta("meta[name='twitter:image']", { name: "twitter:image", content: imageUrl });
  upsertMeta("meta[name='twitter:image:alt']", { name: "twitter:image:alt", content: fallback.title });
  syncOptionalMeta("meta[property='og:image:width']", { property: "og:image:width" }, null);
  syncOptionalMeta("meta[property='og:image:height']", { property: "og:image:height" }, null);
  syncOptionalMeta("meta[property='article:published_time']", { property: "article:published_time" }, null);
  syncOptionalMeta("meta[property='article:modified_time']", { property: "article:modified_time" }, null);
  document.getElementById("tok-page-json-ld")?.remove();
  document.head.dataset.tokSeoPath = normalizedPath;
  document.head.dataset.tokSeoOwner = `route-fallback:${normalizedPath}`;
}

export function ensureSeoMetadataForRoute(path: string) {
  const normalizedPath = normalizeRoutePath(path);
  if (document.head.dataset.tokSeoPath === normalizedPath) return;

  const canonical = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href;
  if (!document.head.dataset.tokSeoPath && canonical) {
    try {
      if (normalizeRoutePath(new URL(canonical, window.location.origin).pathname) === normalizedPath) {
        document.head.dataset.tokSeoPath = normalizedPath;
        document.head.dataset.tokSeoOwner = `server:${normalizedPath}`;
        return;
      }
    } catch {
      // A malformed legacy canonical is replaced by the safe route fallback below.
    }
  }

  applyFallbackMetadata(normalizedPath);
}

export function buildCanonicalUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${DEFAULT_BASE_URL}${normalizedPath}`;
}

export function useSeoMeta({
  title,
  description,
  path,
  image = DEFAULT_IMAGE_PATH,
  imageAlt,
  imageWidth,
  imageHeight,
  ogType = "website",
  articlePublishedTime,
  articleModifiedTime,
  robots = INDEX_ROBOTS,
  jsonLd = null,
}: SeoMetaInput) {
  useEffect(() => {
    const owner = `page:${++seoOwnerSequence}`;
    const mountedRoutePath = normalizeRoutePath(window.location.pathname);
    const previousTitle = document.title;
    const previousHead = snapshotManagedHead();
    const previousJsonLd = document.getElementById("tok-page-json-ld")?.cloneNode(true);
    const previousOwner = document.head.dataset.tokSeoOwner;
    const previousPath = document.head.dataset.tokSeoPath;
    const canonicalUrl = buildCanonicalUrl(path);
    const imageUrl = image.startsWith("http") ? image : `${DEFAULT_BASE_URL}${image.startsWith("/") ? image : `/${image}`}`;

    document.title = title;
    document.head.dataset.tokSeoOwner = owner;
    document.head.dataset.tokSeoPath = mountedRoutePath;
    upsertMeta("meta[name='description']", { name: "description", content: description });
    upsertMeta("meta[name='robots']", { name: "robots", content: robots });
    upsertCanonical(canonicalUrl);
    upsertMeta("meta[property='og:type']", { property: "og:type", content: ogType });
    upsertMeta("meta[property='og:site_name']", { property: "og:site_name", content: "TOK" });
    upsertMeta("meta[property='og:locale']", { property: "og:locale", content: "fr_CH" });
    upsertMeta("meta[property='og:title']", { property: "og:title", content: title });
    upsertMeta("meta[property='og:description']", { property: "og:description", content: description });
    upsertMeta("meta[property='og:url']", { property: "og:url", content: canonicalUrl });
    upsertMeta("meta[property='og:image']", { property: "og:image", content: imageUrl });
    upsertMeta("meta[property='og:image:alt']", { property: "og:image:alt", content: imageAlt || title });
    syncOptionalMeta("meta[property='og:image:width']", { property: "og:image:width" }, imageWidth);
    syncOptionalMeta("meta[property='og:image:height']", { property: "og:image:height" }, imageHeight);
    syncOptionalMeta("meta[property='article:published_time']", { property: "article:published_time" }, articlePublishedTime);
    syncOptionalMeta("meta[property='article:modified_time']", { property: "article:modified_time" }, articleModifiedTime);
    upsertMeta("meta[name='twitter:card']", { name: "twitter:card", content: "summary_large_image" });
    upsertMeta("meta[name='twitter:title']", { name: "twitter:title", content: title });
    upsertMeta("meta[name='twitter:description']", { name: "twitter:description", content: description });
    upsertMeta("meta[name='twitter:image']", { name: "twitter:image", content: imageUrl });
    upsertMeta("meta[name='twitter:image:alt']", { name: "twitter:image:alt", content: imageAlt || title });

    const scriptId = "tok-page-json-ld";
    document.getElementById(scriptId)?.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      script.dataset.tokSeoOwner = owner;
      script.text = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      if (document.head.dataset.tokSeoOwner !== owner) return;

      const currentJsonLd = document.getElementById(scriptId);
      if (currentJsonLd?.dataset.tokSeoOwner === owner) currentJsonLd.remove();

      if (normalizeRoutePath(window.location.pathname) !== mountedRoutePath) {
        delete document.head.dataset.tokSeoOwner;
        delete document.head.dataset.tokSeoPath;
        return;
      }

      document.title = previousTitle;
      restoreManagedHead(previousHead);
      if (previousJsonLd) document.head.appendChild(previousJsonLd.cloneNode(true));
      if (previousOwner) document.head.dataset.tokSeoOwner = previousOwner;
      else delete document.head.dataset.tokSeoOwner;
      if (previousPath) document.head.dataset.tokSeoPath = previousPath;
      else delete document.head.dataset.tokSeoPath;
    };
  }, [
    articleModifiedTime,
    articlePublishedTime,
    description,
    image,
    imageAlt,
    imageHeight,
    imageWidth,
    jsonLd,
    ogType,
    path,
    robots,
    title,
  ]);
}
