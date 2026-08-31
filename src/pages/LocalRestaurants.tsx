import { lazy, Suspense, useMemo } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MapPin, Search } from "lucide-react";

import RestaurantCard from "@/components/RestaurantCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { formatRestaurantCategorySummary } from "@/lib/restaurantCategories";
import { buildRestaurantSeoPath, slugifyRestaurantSegment } from "@/lib/restaurantSlugs";
import { buildCanonicalUrl, useSeoMeta } from "@/hooks/useSeoMeta";
import NotFound from "./NotFound";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getCommercialDemoClientRestaurants } from "@/lib/commercialDemoClientCatalog";

const supabase = getSupabase();
const RestaurantDetail = lazy(() => import("./RestaurantDetail"));
const STOPPIN_VENUE_RADIUS_KM = 5;
const STOPPIN_PLACE_LABEL_MAX_LENGTH = 160;
const LOCAL_RESTAURANT_PAGE_SIZE = 60;

const CITY_LABELS: Record<string, string> = {
  geneve: "Genève",
  genève: "Genève",
  lausanne: "Lausanne",
  zurich: "Zurich",
  bale: "Bâle",
  bâle: "Bâle",
  berne: "Berne",
  lucerne: "Lucerne",
  lugano: "Lugano",
  winterthour: "Winterthour",
  "saint-gall": "Saint-Gall",
  fribourg: "Fribourg",
  neuchatel: "Neuchâtel",
  sion: "Sion",
  nyon: "Nyon",
  morges: "Morges",
  vevey: "Vevey",
  montreux: "Montreux",
  "yverdon-les-bains": "Yverdon-les-Bains",
  bienne: "Bienne",
  carouge: "Carouge",
  vernier: "Vernier",
};

const CATEGORY_LABELS: Record<string, string> = {
  italien: "italienne",
  pizza: "pizza",
  sushi: "sushi",
  japonais: "japonaise",
  asiatique: "asiatique",
  chinois: "chinoise",
  thai: "thaïlandaise",
  indien: "indienne",
  libanais: "libanaise",
  burger: "burger",
  kebab: "kebab",
  halal: "halal",
  suisse: "suisse",
  francais: "française",
  mediterraneen: "méditerranéenne",
  mexicain: "mexicaine",
  marocain: "marocaine",
  africain: "africaine",
  vegetarien: "végétarienne",
  vegan: "vegan",
  healthy: "healthy",
  brunch: "brunch",
  cafe: "café",
  dessert: "dessert",
  coreen: "coréenne",
  grec: "grecque",
  bistro: "bistro",
  "street-food": "street food",
};

const CATEGORY_ALIASES: Record<string, string> = {
  pizzeria: "pizza",
  pizzas: "pizza",
  italienne: "italien",
  japonaise: "japonais",
  indienne: "indien",
  libanaise: "libanais",
  africaine: "africain",
  vegetarienne: "vegetarien",
  desserts: "dessert",
  streetfood: "street-food",
  "meilleure-pizzeria": "pizza",
  "meilleures-pizzerias": "pizza",
};

const INTENT_LABELS: Record<string, string> = {
  reservation: "Réservation",
  "pas-cher": "Petit prix",
  meilleurs: "Mieux notés",
};

const MIN_SPECIALIZED_LOCAL_RESTAURANTS = 3;

function extractRestaurantCuisineSlugs(value: unknown) {
  return String(value || "")
    .split(/[,;|/]+/)
    .map((part) => part.replace(/\+\s*\d+\s*$/, "").trim())
    .map((part) => {
      const slug = slugifyRestaurantSegment(part);
      return CATEGORY_ALIASES[slug] || slug;
    })
    .filter((slug, index, slugs) => Boolean(CATEGORY_LABELS[slug]) && slugs.indexOf(slug) === index);
}

function filterRestaurantsByIntent(restaurants: any[], intent: string) {
  if (intent === "reservation") {
    return restaurants.filter((restaurant) => restaurant.supports_reservation === true);
  }
  if (intent === "pas-cher") {
    return restaurants
      .filter((restaurant) => Number(restaurant.price_range) > 0 && Number(restaurant.price_range) <= 2)
      .sort((left, right) => Number(left.price_range) - Number(right.price_range));
  }
  if (intent === "meilleurs") {
    return restaurants
      .filter((restaurant) => Number(restaurant.rating) > 0 && Number(restaurant.review_count) > 0)
      .sort((left, right) =>
        Number(right.rating) - Number(left.rating)
        || Number(right.review_count) - Number(left.review_count)
      );
  }
  return restaurants;
}

const DISTRICT_LABELS: Record<string, string> = {
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

function slugToLabel(slug: string | undefined, labels: Record<string, string>) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return "";
  return labels[normalized] || normalized.replace(/-/g, " ");
}

function parseCoordinate(value: string | null, min: number, max: number) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function toAbsoluteSeoImage(value: unknown) {
  const candidate = String(value || "").trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate, "https://www.thetok.ch");
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function toCardProps(restaurant: any) {
  const categoryNames = Array.isArray(restaurant?.category_names) ? restaurant.category_names : [];
  return {
    id: restaurant.id,
    slug: restaurant.slug || null,
    name: restaurant.name,
    cuisine: formatRestaurantCategorySummary(categoryNames, restaurant.cuisine_type || ""),
    rating: restaurant.rating || 0,
    reviewCount: restaurant.review_count || 0,
    imageUrl: restaurant.image_url || "",
    priceRange: restaurant.price_range || 2,
    deliveryAvailable: Boolean(restaurant.delivery_available),
    city: restaurant.city || "",
    address: restaurant.address || "",
    openingHours: Object.prototype.hasOwnProperty.call(restaurant, "opening_hours") ? restaurant.opening_hours : undefined,
    supportsReservation: Object.prototype.hasOwnProperty.call(restaurant, "supports_reservation") ? restaurant.supports_reservation : undefined,
  };
}

function getPageName(city: string, category: string, district: string, intent: string, venueName?: string) {
  if (venueName) return `Où manger près de ${venueName}, ${city}`;
  if (intent === "reservation") return `Réservation de restaurant à ${city}`;
  if (intent === "pas-cher") return `Restaurants pas chers à ${city}`;
  if (intent === "meilleurs") return `Meilleurs restaurants à ${city}`;
  if (district) return `Restaurants aux ${district}, ${city}`;
  if (category === "pizza") return `Pizzerias à ${city}`;
  if (category) return `Restaurants ${category} à ${city}`;
  return `Restaurants à ${city}`;
}

function getPageTitle(city: string, category: string, district: string, intent: string, venueName?: string) {
  if (venueName) return `Où manger près de ${venueName}, ${city} | TOK`;
  if (intent === "reservation") return `Réservation restaurant à ${city} | TOK`;
  if (intent === "pas-cher") return `Restaurant pas cher à ${city} | TOK`;
  if (intent === "meilleurs") return `Meilleurs restaurants à ${city} | TOK`;
  if (category === "pizza") return `Pizzeria à ${city} : les meilleures adresses | TOK`;
  if (category) return `Restaurant ${category} à ${city} | TOK`;
  if (district) return `Restaurants à ${district}, ${city} | TOK`;
  return `Restaurant à ${city} : réserver une table | TOK`;
}

function getPageDescription(city: string, category: string, district: string, intent: string, venueName?: string) {
  if (venueName) {
    return `Réservez un restaurant ou trouvez une table à proximité de ${venueName} à ${city} avant ou après votre sortie ou événement sur TOK.`;
  }
  if (intent === "reservation") {
    return `Réservez une table dans les restaurants de ${city} qui confirment le service de réservation sur TOK.`;
  }
  if (intent === "pas-cher") {
    return `Comparez les restaurants abordables à ${city} selon leur gamme de prix et les services réellement disponibles sur TOK.`;
  }
  if (intent === "meilleurs") {
    return `Découvrez les restaurants les mieux notés à ${city}, classés à partir des notes et avis disponibles sur TOK.`;
  }
  if (district) {
    return `Découvrez les restaurants proches de ${district} à ${city} sur TOK : réservation, commande et offres locales.`;
  }
  if (category === "pizza") {
    return `Trouvez une pizzeria à ${city}, comparez les adresses disponibles et réservez une table ou commandez sur TOK.`;
  }
  if (category) {
    return `Découvrez les restaurants ${category} à ${city} sur TOK : réservation, commande, retrait et livraison selon les services disponibles.`;
  }
  return `Trouvez un restaurant à ${city} avec TOK : comparez les cuisines, la réservation, la commande et les offres locales.`;
}

function buildRestaurantJsonLd(
  restaurants: any[],
  city: string,
  category: string,
  district: string,
  intent: string,
  path: string,
  venueName?: string,
) {
  const pageName = getPageName(city, category, district, intent, venueName);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: pageName,
    url: buildCanonicalUrl(path),
    itemListElement: restaurants.slice(0, 24).map((restaurant, index) => {
      const restaurantPath = buildRestaurantSeoPath(restaurant);
      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Restaurant",
          "@id": buildCanonicalUrl(restaurantPath),
          name: restaurant.name,
          servesCuisine: restaurant.cuisine_type || category || undefined,
          image: toAbsoluteSeoImage(restaurant.image_url),
          address: {
            "@type": "PostalAddress",
            streetAddress: restaurant.address || undefined,
            addressLocality: restaurant.city || city,
            addressCountry: "CH",
          },
          aggregateRating: restaurant.rating && Number(restaurant.review_count) > 0
            ? {
              "@type": "AggregateRating",
              ratingValue: Number(restaurant.rating),
              reviewCount: Number(restaurant.review_count || 0),
              bestRating: 10,
              worstRating: 1,
            }
            : undefined,
          url: buildCanonicalUrl(restaurantPath),
        },
      };
    }),
  };

  return [
    itemList,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: buildCanonicalUrl("/") },
        { "@type": "ListItem", position: 2, name: "Recherche restaurants", item: buildCanonicalUrl("/recherche") },
        { "@type": "ListItem", position: 3, name: pageName, item: buildCanonicalUrl(path) },
      ],
    },
  ];
}

function LocalRestaurantsSeo({
  title,
  description,
  path,
  jsonLd,
  robots,
}: {
  title: string;
  description: string;
  path: string;
  jsonLd: Record<string, unknown>[];
  robots?: string;
}) {
  useSeoMeta({ title, description, path, jsonLd, robots });
  return null;
}

function buildLocalSeoLinks(citySlug: string | undefined, city: string, category: string, district: string, intent: string, restaurants: any[]) {
  const safeCitySlug = slugifyRestaurantSegment(citySlug || city || "geneve");
  const cuisineCounts = new Map<string, number>();
  for (const restaurant of restaurants) {
    for (const cuisineSlug of extractRestaurantCuisineSlugs(restaurant?.cuisine_type)) {
      cuisineCounts.set(cuisineSlug, Number(cuisineCounts.get(cuisineSlug) || 0) + 1);
    }
  }
  const cuisineLinks = [...cuisineCounts.entries()]
    .filter(([, count]) => count >= MIN_SPECIALIZED_LOCAL_RESTAURANTS)
    .slice(0, 10)
    .map(([cuisineSlug]) => ({
      href: `/restaurants/${safeCitySlug}/${cuisineSlug}`,
      label: cuisineSlug === "pizza"
        ? `Pizzerias à ${city}`
        : `Restaurants ${slugToLabel(cuisineSlug, CATEGORY_LABELS)} à ${city}`,
    }));
  const intentLinks = [
    {
      slug: "reservation",
      count: restaurants.filter((restaurant) => restaurant.supports_reservation === true).length,
      label: `Réserver un restaurant à ${city}`,
    },
    {
      slug: "pas-cher",
      count: restaurants.filter((restaurant) =>
        Number(restaurant.price_range) > 0 && Number(restaurant.price_range) <= 2
      ).length,
      label: `Restaurants pas chers à ${city}`,
    },
    {
      slug: "meilleurs",
      count: restaurants.filter((restaurant) =>
        Number(restaurant.rating) > 0 && Number(restaurant.review_count) > 0
      ).length,
      label: `Meilleurs restaurants à ${city}`,
    },
  ]
    .filter((candidate) => candidate.count >= MIN_SPECIALIZED_LOCAL_RESTAURANTS)
    .map((candidate) => ({
      href: `/restaurants/${safeCitySlug}/${candidate.slug}`,
      label: candidate.label,
    }));

  return [
    { href: `/restaurants/${safeCitySlug}`, label: `Tous les restaurants à ${city}` },
    ...intentLinks,
    ...cuisineLinks,
    { href: "/anti-gaspi", label: "Offres anti-gaspi" },
    { href: "/ventes-flash", label: "Ventes flash" },
    { href: "/miamz-solidaires", label: "Miamz solidaires" },
  ].filter((link) => {
    if (intent && link.href.endsWith(`/${intent}`)) return false;
    if (district && link.href.endsWith(`/${slugifyRestaurantSegment(district)}`)) return false;
    return true;
  });
}

function parseVenueSlug(venueSlug: string) {
  const normalized = venueSlug.trim().toLowerCase();
  for (const [key, label] of Object.entries(CITY_LABELS)) {
    const citySlug = slugifyRestaurantSegment(key);
    if (normalized.endsWith(`-${citySlug}`)) {
      const venuePart = normalized.slice(0, -(citySlug.length + 1));
      const venueName = venuePart
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      return {
        venueName,
        city: label,
        citySlug,
        venueBaseSlug: venuePart,
        routeSlug: normalized,
      };
    }
  }
  const venueName = normalized
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    venueName,
    city: "Genève",
    citySlug: "geneve",
    venueBaseSlug: normalized,
    routeSlug: normalized,
  };
}

function resolveStoppinPlaceLabel(
  value: string | null,
  venueInfo: ReturnType<typeof parseVenueSlug> | null,
) {
  if (!value || !venueInfo) return "";
  const sanitizedValue = Array.from(value.normalize("NFC"), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  }).join("");
  const candidate = sanitizedValue.replace(/\s+/g, " ").trim();

  if (
    !candidate
    || candidate.length > STOPPIN_PLACE_LABEL_MAX_LENGTH
    || /[<>]/.test(candidate)
  ) {
    return "";
  }

  const candidateSlug = slugifyRestaurantSegment(candidate);
  const matchesRoute = candidateSlug === venueInfo.venueBaseSlug
    || candidateSlug === venueInfo.routeSlug;
  return matchesRoute ? candidate : "";
}

export default function LocalRestaurants() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const demoSessionKey = isCommercialDemoClient ? commercialDemoFrame.config.sessionId : "production";
  const params = useParams<{ city?: string; category?: string; restaurantSlug?: string; venueSlug?: string }>();
  const [searchParams] = useSearchParams();
  const venueInfo = params.venueSlug ? parseVenueSlug(params.venueSlug) : null;
  const exactStoppinPlaceLabel = resolveStoppinPlaceLabel(searchParams.get("place"), venueInfo);
  const venueName = exactStoppinPlaceLabel || venueInfo?.venueName;
  const venueLatitude = parseCoordinate(searchParams.get("lat"), -90, 90);
  const venueLongitude = parseCoordinate(searchParams.get("lng"), -180, 180);
  const hasVenueCoordinates = Boolean(
    venueName && venueLatitude !== null && venueLongitude !== null,
  );
  const normalizedCitySegment = String(params.city || venueInfo?.citySlug || "").trim().toLowerCase();
  const knownCitySegment = Boolean(CITY_LABELS[normalizedCitySegment]);
  const city = venueInfo?.city || slugToLabel(params.city, CITY_LABELS);
  const routeSegment = String(params.category || "").trim().toLowerCase();
  const canonicalRouteSegment = CATEGORY_ALIASES[routeSegment] || routeSegment;
  const explicitRestaurantSlug = slugifyRestaurantSegment(params.restaurantSlug);
  const isExplicitRestaurantRoute = Boolean(explicitRestaurantSlug);
  const knownDistrictSegment = Boolean(!isExplicitRestaurantRoute && routeSegment && DISTRICT_LABELS[routeSegment]);
  const knownCategorySegment = Boolean(!isExplicitRestaurantRoute && routeSegment && CATEGORY_LABELS[canonicalRouteSegment]);
  const knownIntentSegment = Boolean(!isExplicitRestaurantRoute && routeSegment && INTENT_LABELS[routeSegment]);
  const legacyRestaurantSlug = !isExplicitRestaurantRoute
    && routeSegment
    && !knownDistrictSegment
    && !knownCategorySegment
    && !knownIntentSegment
      ? slugifyRestaurantSegment(routeSegment)
      : "";
  const requestedRestaurantSlug = explicitRestaurantSlug || legacyRestaurantSlug;
  const slugCandidate = Boolean(requestedRestaurantSlug);
  const demoRestaurants = useMemo(
    () => isCommercialDemoClient ? getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot) : [],
    [commercialDemoFrame, isCommercialDemoClient],
  );
  const demoRestaurantBySlug = useMemo(() => {
    if (!isCommercialDemoClient || !slugCandidate) return null;
    const citySlug = slugifyRestaurantSegment(params.city);

    return demoRestaurants.find((restaurant) =>
      slugifyRestaurantSegment(restaurant.slug) === requestedRestaurantSlug
      && slugifyRestaurantSegment(restaurant.city || "geneve") === citySlug
    ) || null;
  }, [demoRestaurants, isCommercialDemoClient, params.city, requestedRestaurantSlug, slugCandidate]);
  const restaurantSlugBaseQuery = {
    queryKey: ["restaurant-slug", city, requestedRestaurantSlug],
  };
  const {
    data: fetchedRestaurantBySlug,
    isLoading: isRemoteSlugLoading,
    isError: isRemoteSlugError,
  } = useQuery({
    queryKey: [...restaurantSlugBaseQuery.queryKey, demoSessionKey],
    enabled: Boolean(city && slugCandidate && !isCommercialDemoClient),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, city, slug")
        .eq("slug", requestedRestaurantSlug)
        .eq("is_active", true)
        .limit(10);

      if (error) throw error;

      const citySlug = slugifyRestaurantSegment(params.city);
      return (data || []).find((restaurant: any) =>
        slugifyRestaurantSegment(restaurant.city || "geneve") === citySlug
      ) || null;
    },
  });
  const restaurantBySlug = isCommercialDemoClient ? demoRestaurantBySlug : fetchedRestaurantBySlug;
  const isSlugLoading = !isCommercialDemoClient && isRemoteSlugLoading;
  const resolvedRestaurantId = restaurantBySlug?.id ? String(restaurantBySlug.id) : "";
  const legacySlugMiss = Boolean(legacyRestaurantSlug && !isSlugLoading && !isRemoteSlugError && !restaurantBySlug);
  const district = knownDistrictSegment ? slugToLabel(params.category, DISTRICT_LABELS) : "";
  const intent = knownIntentSegment ? routeSegment : "";
  const category = district || intent || resolvedRestaurantId
    ? ""
    : knownCategorySegment || legacySlugMiss
      ? slugToLabel(canonicalRouteSegment, CATEGORY_LABELS)
      : "";
  const categoryAliasRedirect = Boolean(
    knownCategorySegment && routeSegment && canonicalRouteSegment !== routeSegment
  );
  const path = params.venueSlug
    ? `/restaurants-pres/${params.venueSlug}`
    : isExplicitRestaurantRoute
      ? `/restaurants/${params.city}/r/${params.restaurantSlug}`
      : params.category
        ? `/restaurants/${params.city}/${canonicalRouteSegment}`
        : `/restaurants/${params.city}`;

  const {
    data: restaurantPages,
    isLoading,
    isError,
    isSuccess: isListingSuccess,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "local-restaurants",
      city,
      category,
      district,
      intent,
      venueName,
      venueLatitude,
      venueLongitude,
      demoSessionKey,
    ],
    enabled: Boolean(city)
      && !resolvedRestaurantId
      && !isExplicitRestaurantRoute
      && (!slugCandidate || legacySlugMiss),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = Number(pageParam) || 0;
      if (isCommercialDemoClient) {
        return {
          items: filterRestaurantsByIntent(demoRestaurants, intent),
          rawCount: demoRestaurants.length,
          nextOffset: null as number | null,
        };
      }

      if (hasVenueCoordinates && venueLatitude !== null && venueLongitude !== null) {
        const { data, error } = await (supabase.rpc as any)("search_restaurants_nearby", {
          p_lat: venueLatitude,
          p_lng: venueLongitude,
          p_radius_km: STOPPIN_VENUE_RADIUS_KM,
          p_cuisine: category || null,
          p_min_rating: 0,
          p_max_price_range: 4,
          p_search_text: null,
          p_delivery_only: false,
          p_limit: LOCAL_RESTAURANT_PAGE_SIZE,
          p_offset: offset,
        });

        if (error) throw error;
        const rawItems = data || [];
        return {
          items: filterRestaurantsByIntent(rawItems, intent),
          rawCount: rawItems.length,
          nextOffset: rawItems.length === LOCAL_RESTAURANT_PAGE_SIZE ? offset + LOCAL_RESTAURANT_PAGE_SIZE : null,
        };
      }

      const { data, error } = await (supabase.rpc as any)("search_restaurants_catalog", {
        p_query: district || null,
        p_city: city,
        p_cuisine: category || null,
        p_price_range: null,
        p_delivery_only: false,
        p_min_rating: 0,
        p_sort_by: "pertinence",
        p_sort_direction: "desc",
        p_limit: LOCAL_RESTAURANT_PAGE_SIZE,
        p_offset: offset,
      });

      if (error) throw error;
      const rawItems = data || [];
      return {
        items: filterRestaurantsByIntent(rawItems, intent),
        rawCount: rawItems.length,
        nextOffset: rawItems.length === LOCAL_RESTAURANT_PAGE_SIZE ? offset + LOCAL_RESTAURANT_PAGE_SIZE : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });

  const restaurants = useMemo(
    () => restaurantPages?.pages.flatMap((page) => page.items) ?? [],
    [restaurantPages],
  );
  const pageName = getPageName(city, category, district, intent, venueName);
  const title = getPageTitle(city, category, district, intent, venueName);
  const description = getPageDescription(city, category, district, intent, venueName);
  const jsonLd = useMemo(
    () => buildRestaurantJsonLd(restaurants, city, category, district, intent, path, venueName),
    [category, city, district, intent, path, restaurants, venueName],
  );
  const localSeoLinks = useMemo(
    () => buildLocalSeoLinks(params.city, city, category, district, intent, restaurants),
    [category, city, district, intent, params.city, restaurants],
  );
  const knownListingRoute = Boolean(
    knownCitySegment && (!routeSegment || knownDistrictSegment || knownCategorySegment || knownIntentSegment),
  );
  const hasConfirmedEmptyInventory = isListingSuccess && restaurants.length === 0 && !hasNextPage;
  const minimumInventory = category || district || intent ? MIN_SPECIALIZED_LOCAL_RESTAURANTS : 1;
  const hasThinInventory = isListingSuccess && restaurants.length < minimumInventory && !hasNextPage;
  const unknownListingRoute = hasConfirmedEmptyInventory && !knownListingRoute;

  if (categoryAliasRedirect) {
    return <Navigate to={path} replace />;
  }

  if (slugCandidate && isSlugLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container py-8">
          <div className="h-[360px] animate-pulse rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }

  if (resolvedRestaurantId) {
    const canonicalRestaurantPath = buildRestaurantSeoPath(restaurantBySlug);

    if (!isExplicitRestaurantRoute) {
      return <Navigate to={canonicalRestaurantPath} replace />;
    }

    return (
      <Suspense
        fallback={
          <main className="min-h-screen bg-background">
            <div className="container py-8">
              <div className="h-[360px] animate-pulse rounded-2xl bg-muted" />
            </div>
          </main>
        }
      >
        <RestaurantDetail
          resolvedRestaurantId={resolvedRestaurantId}
          canonicalPath={canonicalRestaurantPath}
        />
      </Suspense>
    );
  }

  if (isExplicitRestaurantRoute && !isSlugLoading && !isRemoteSlugError) {
    return <NotFound />;
  }

  if (unknownListingRoute) {
    return <NotFound />;
  }

  if (isRemoteSlugError) {
    return (
      <main className="min-h-screen bg-background">
        <LocalRestaurantsSeo
          title="Restaurant temporairement indisponible | TOK"
          description="La fiche restaurant ne peut pas être chargée pour le moment."
          path={path}
          jsonLd={[]}
          robots="noindex,follow,noarchive"
        />
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-bold">Fiche temporairement indisponible</h1>
          <p className="mt-3 text-muted-foreground">Réessayez dans quelques instants.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {!isLoading ? (
        <LocalRestaurantsSeo
          title={title}
          description={description}
          path={path}
          jsonLd={jsonLd}
          robots={isError || hasThinInventory ? "noindex,follow,noarchive" : undefined}
        />
      ) : null}
      <div className="container space-y-8 py-8">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {city || "Suisse romande"}
            </Badge>
            {district ? <Badge variant="outline">Quartier {district}</Badge> : null}
            {category ? <Badge variant="outline">{category}</Badge> : null}
            {intent ? <Badge variant="outline">{INTENT_LABELS[intent]}</Badge> : null}
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-bold md:text-4xl">{pageName}</h1>
              <p className="max-w-2xl text-muted-foreground">{description}</p>
            </div>
            <Button asChild variant="outline" className="gap-2 lg:self-end">
              <Link to={`/recherche?city=${encodeURIComponent(city)}${category ? `&cuisine=${encodeURIComponent(category)}` : district ? `&q=${encodeURIComponent(district)}` : ""}`}>
                <Search className="h-4 w-4" />
                Affiner la recherche
              </Link>
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Guide local TOK pour {pageName.toLowerCase()}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Utilisez cette page pour comparer les restaurants actifs, repérer les cuisines proches,
                vérifier les services de commande ou de réservation, puis accéder aux offres courtes,
                ventes flash et avantages Miamz quand ils sont disponibles.
              </p>
            </div>
            <nav aria-label="Liens restaurants populaires" className="flex flex-wrap gap-2">
              {localSeoLinks.slice(0, 10).map((link) => (
                <Button key={link.href} asChild variant="outline" size="sm" className="h-8 rounded-full text-xs">
                  <Link to={link.href}>{link.label}</Link>
                </Button>
              ))}
            </nav>
          </div>
        </section>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-[300px] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : !isError && (restaurants.length > 0 || hasNextPage) ? (
          <section className="space-y-6">
            {restaurants.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {restaurants.map((restaurant: any) => (
                  <RestaurantCard key={restaurant.id} {...toCardProps(restaurant)} />
                ))}
              </div>
            ) : null}
            {hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-56 rounded-full"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Chargement…" : "Charger plus de restaurants"}
                </Button>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed p-10 text-center">
            <p className="font-semibold">
              {isError ? "La sélection locale est temporairement indisponible." : "Aucun restaurant trouvé pour cette page locale."}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {isError
                ? "Réessayez dans quelques instants ou utilisez la recherche générale."
                : "Essayez une autre ville, un autre quartier ou une autre cuisine depuis la recherche."}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
