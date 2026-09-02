type RestaurantPathInput = {
  id?: string | null;
  name?: string | null;
  city?: string | null;
  slug?: string | null;
};

export const RESTAURANT_DETAIL_PATH_SEGMENT = "r";

const RESTAURANT_CITY_ROUTE_ALIASES: Record<string, string> = {
  "carouge-ge": "carouge",
};

export function slugifyRestaurantSegment(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function canonicalizeRestaurantCitySegment(value: string | null | undefined) {
  const citySlug = slugifyRestaurantSegment(value);
  return RESTAURANT_CITY_ROUTE_ALIASES[citySlug] || citySlug;
}

export function buildRestaurantSeoPath(restaurant: RestaurantPathInput) {
  const citySlug = canonicalizeRestaurantCitySegment(restaurant.city || "geneve");
  const restaurantSlug = slugifyRestaurantSegment(restaurant.slug || "");

  if (citySlug && restaurantSlug) {
    return `/restaurants/${citySlug}/${RESTAURANT_DETAIL_PATH_SEGMENT}/${restaurantSlug}`;
  }

  return restaurant.id ? `/restaurant/${restaurant.id}` : "/recherche";
}
