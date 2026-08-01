import { lazy, Suspense, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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

const CITY_LABELS: Record<string, string> = {
  geneve: "Genève",
  genève: "Genève",
  lausanne: "Lausanne",
  fribourg: "Fribourg",
  neuchatel: "Neuchâtel",
  nyon: "Nyon",
  vevey: "Vevey",
  montreux: "Montreux",
  "yverdon-les-bains": "Yverdon-les-Bains",
};

const CATEGORY_LABELS: Record<string, string> = {
  italien: "italienne",
  japonais: "japonaise",
  pizza: "pizza",
  burger: "burger",
  kebab: "kebab",
  sushi: "sushi",
  vegan: "vegan",
  asiatique: "asiatique",
  africain: "africaine",
  libanais: "libanaise",
  indien: "indienne",
  halal: "halal",
  healthy: "healthy",
  brunch: "brunch",
  dessert: "dessert",
  desserts: "desserts",
  coreen: "coréenne",
  grec: "grecque",
  bistro: "bistro",
  "street-food": "street food",
};

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

function getPageName(city: string, category: string, district: string) {
  if (district) return `Restaurants aux ${district}, ${city}`;
  if (category) return `Restaurants ${category} à ${city}`;
  return `Restaurants à ${city}`;
}

function buildRestaurantJsonLd(restaurants: any[], city: string, category: string, district: string, path: string) {
  const pageName = getPageName(city, category, district);
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

function buildLocalSeoLinks(citySlug: string | undefined, city: string, category: string, district: string, restaurants: any[]) {
  const safeCitySlug = slugifyRestaurantSegment(citySlug || city || "geneve");
  const discoveredCuisines = restaurants
    .map((restaurant) => slugifyRestaurantSegment(restaurant?.cuisine_type))
    .filter((cuisine, index, cuisines) => cuisine && CATEGORY_LABELS[cuisine] && cuisines.indexOf(cuisine) === index);
  const supportedCuisines = discoveredCuisines.slice(0, 8);
  const cuisineLinks = supportedCuisines.map((cuisine) => ({
    href: `/restaurants/${safeCitySlug}/${cuisine}`,
    label: `${slugToLabel(cuisine, CATEGORY_LABELS)} à ${city}`,
  }));

  return [
    { href: `/restaurants/${safeCitySlug}`, label: `Tous les restaurants à ${city}` },
    ...cuisineLinks,
    { href: "/anti-gaspi", label: "Offres anti-gaspi" },
    { href: "/ventes-flash", label: "Ventes flash" },
    { href: "/miamz-solidaires", label: "Miamz solidaires" },
  ].filter((link) => {
    if (category && link.href.endsWith(`/${slugifyRestaurantSegment(category)}`)) return false;
    if (district && link.href.endsWith(`/${slugifyRestaurantSegment(district)}`)) return false;
    return true;
  });
}

export default function LocalRestaurants() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const demoSessionKey = isCommercialDemoClient ? commercialDemoFrame.config.sessionId : "production";
  const params = useParams<{ city?: string; category?: string; restaurantSlug?: string }>();
  const normalizedCitySegment = String(params.city || "").trim().toLowerCase();
  const knownCitySegment = Boolean(CITY_LABELS[normalizedCitySegment]);
  const city = slugToLabel(params.city, CITY_LABELS);
  const routeSegment = String(params.category || "").trim().toLowerCase();
  const explicitRestaurantSlug = slugifyRestaurantSegment(params.restaurantSlug);
  const isExplicitRestaurantRoute = Boolean(explicitRestaurantSlug);
  const knownDistrictSegment = Boolean(!isExplicitRestaurantRoute && routeSegment && DISTRICT_LABELS[routeSegment]);
  const knownCategorySegment = Boolean(!isExplicitRestaurantRoute && routeSegment && CATEGORY_LABELS[routeSegment]);
  const legacyRestaurantSlug = !isExplicitRestaurantRoute && routeSegment && !knownDistrictSegment && !knownCategorySegment
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
  const category = district || resolvedRestaurantId
    ? ""
    : knownCategorySegment || legacySlugMiss
      ? slugToLabel(params.category, CATEGORY_LABELS)
      : "";
  const path = isExplicitRestaurantRoute
    ? `/restaurants/${params.city}/r/${params.restaurantSlug}`
    : params.category
      ? `/restaurants/${params.city}/${params.category}`
      : `/restaurants/${params.city}`;

  const {
    data: restaurants = [],
    isLoading,
    isError,
    isSuccess: isListingSuccess,
  } = useQuery({
    queryKey: ["local-restaurants", city, category, district, demoSessionKey],
    enabled: Boolean(city)
      && !resolvedRestaurantId
      && !isExplicitRestaurantRoute
      && (!slugCandidate || legacySlugMiss),
    queryFn: async () => {
      if (isCommercialDemoClient) {
        return demoRestaurants;
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
        p_limit: 60,
        p_offset: 0,
      });

      if (error) throw error;
      return data || [];
    },
  });

  const pageName = getPageName(city, category, district);
  const title = `${pageName} | TOK`;
  const description = district
    ? `Découvrez les restaurants proches de ${district} à ${city} sur Tok : réservation, commande, offres locales, Miamz et bonnes adresses de quartier.`
    : category
      ? `Découvrez les restaurants ${category} disponibles à ${city} sur Tok : commande, réservation, offres locales et adresses indexables.`
      : `Découvrez les restaurants disponibles à ${city} sur Tok : livraison, réservation, anti-gaspi, ventes flash et adresses locales.`;
  const jsonLd = useMemo(
    () => buildRestaurantJsonLd(restaurants, city, category, district, path),
    [category, city, district, path, restaurants],
  );
  const localSeoLinks = useMemo(
    () => buildLocalSeoLinks(params.city, city, category, district, restaurants),
    [category, city, district, params.city, restaurants],
  );
  const knownListingRoute = Boolean(
    knownCitySegment && (!routeSegment || knownDistrictSegment || knownCategorySegment),
  );
  const hasConfirmedEmptyInventory = isListingSuccess && restaurants.length === 0;
  const unknownListingRoute = hasConfirmedEmptyInventory && !knownListingRoute;

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
          robots={isError || hasConfirmedEmptyInventory ? "noindex,follow,noarchive" : undefined}
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
        ) : !isError && restaurants.length > 0 ? (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant: any) => (
              <RestaurantCard key={restaurant.id} {...toCardProps(restaurant)} />
            ))}
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
