import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Search } from "lucide-react";

import RestaurantCard from "@/components/RestaurantCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { formatRestaurantCategorySummary } from "@/lib/restaurantCategories";
import { buildRestaurantSeoPath, slugifyRestaurantSegment } from "@/lib/restaurantSlugs";
import { buildCanonicalUrl, useSeoMeta } from "@/hooks/useSeoMeta";
import RestaurantDetail from "./RestaurantDetail";

const supabase = getSupabase();

const CITY_LABELS: Record<string, string> = {
  geneve: "Genève",
  genève: "Genève",
  lausanne: "Lausanne",
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
};

const DISTRICT_LABELS: Record<string, string> = {
  "eaux-vives": "Eaux-Vives",
  plainpalais: "Plainpalais",
  paquis: "Pâquis",
  carouge: "Carouge",
  champel: "Champel",
  jonction: "Jonction",
};

function slugToLabel(slug: string | undefined, labels: Record<string, string>) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return "";
  return labels[normalized] || normalized.replace(/-/g, " ");
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
  };
}

function getPageName(city: string, category: string, district: string) {
  if (district) return `Restaurants aux ${district}, ${city}`;
  if (category) return `Restaurants ${category} à ${city}`;
  return `Restaurants à ${city}`;
}

function buildRestaurantJsonLd(restaurants: any[], city: string, category: string, district: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: getPageName(city, category, district),
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
          image: restaurant.image_url || undefined,
          address: {
            "@type": "PostalAddress",
            streetAddress: restaurant.address || undefined,
            addressLocality: restaurant.city || city,
            addressCountry: "CH",
          },
          aggregateRating: restaurant.rating
            ? {
              "@type": "AggregateRating",
              ratingValue: Number(restaurant.rating),
              reviewCount: Number(restaurant.review_count || 0),
            }
            : undefined,
          url: buildCanonicalUrl(restaurantPath),
        },
      };
    }),
  };
}

export default function LocalRestaurants() {
  const params = useParams();
  const city = slugToLabel(params.city, CITY_LABELS);
  const routeSegment = String(params.category || "").trim().toLowerCase();
  const knownDistrictSegment = Boolean(routeSegment && DISTRICT_LABELS[routeSegment]);
  const knownCategorySegment = Boolean(routeSegment && CATEGORY_LABELS[routeSegment]);
  const slugCandidate = Boolean(routeSegment && !knownDistrictSegment && !knownCategorySegment);
  const { data: restaurantBySlug, isLoading: isSlugLoading } = useQuery({
    queryKey: ["restaurant-slug", city, routeSegment],
    enabled: Boolean(city && slugCandidate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, city, slug")
        .eq("slug", routeSegment)
        .eq("is_active", true)
        .limit(10);

      if (error) throw error;

      const citySlug = slugifyRestaurantSegment(params.city);
      return (data || []).find((restaurant: any) =>
        slugifyRestaurantSegment(restaurant.city) === citySlug
      ) || (data || [])[0] || null;
    },
  });
  const resolvedRestaurantId = restaurantBySlug?.id ? String(restaurantBySlug.id) : "";
  const district = knownDistrictSegment ? slugToLabel(params.category, DISTRICT_LABELS) : "";
  const category = district || resolvedRestaurantId ? "" : slugToLabel(params.category, CATEGORY_LABELS);
  const path = params.category ? `/restaurants/${params.city}/${params.category}` : `/restaurants/${params.city}`;

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["local-restaurants", city, category, district],
    enabled: Boolean(city) && !resolvedRestaurantId && !(slugCandidate && isSlugLoading),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("search_restaurants_catalog", {
        p_query: district || null,
        p_city: city,
        p_cuisine: category || null,
        p_price_range: null,
        p_delivery_only: false,
        p_min_rating: 0,
        p_sort_by: "pertinence",
        p_sort_direction: "desc",
        p_limit: 90,
        p_offset: 0,
      });

      if (error) throw error;
      return data || [];
    },
  });

  const pageName = getPageName(city, category, district);
  const title = `${pageName} | Tok`;
  const description = district
    ? `Découvrez les restaurants proches de ${district} à ${city} sur Tok : réservation, commande, offres locales, Miamz et bonnes adresses de quartier.`
    : category
      ? `Découvrez les restaurants ${category} disponibles à ${city} sur Tok : commande, réservation, offres locales et adresses indexables.`
      : `Découvrez les restaurants disponibles à ${city} sur Tok : livraison, réservation, anti-gaspi, ventes flash et adresses locales.`;
  const jsonLd = useMemo(
    () => buildRestaurantJsonLd(restaurants, city, category, district, path),
    [category, city, district, path, restaurants],
  );

  useSeoMeta({ title, description, path, jsonLd });

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
    return <RestaurantDetail resolvedRestaurantId={resolvedRestaurantId} canonicalPath={path} />;
  }

  return (
    <main className="min-h-screen bg-background">
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

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-[300px] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : restaurants.length > 0 ? (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant: any) => (
              <RestaurantCard key={restaurant.id} {...toCardProps(restaurant)} />
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed p-10 text-center">
            <p className="font-semibold">Aucun restaurant trouvé pour cette page locale.</p>
            <p className="mt-2 text-sm text-muted-foreground">Essayez une autre ville, un autre quartier ou une autre cuisine depuis la recherche.</p>
          </section>
        )}
      </div>
    </main>
  );
}
