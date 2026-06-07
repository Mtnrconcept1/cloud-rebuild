type RestaurantPathInput = {
  id?: string | null;
  name?: string | null;
  city?: string | null;
  slug?: string | null;
};

export function slugifyRestaurantSegment(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildRestaurantSeoPath(restaurant: RestaurantPathInput) {
  const citySlug = slugifyRestaurantSegment(restaurant.city || "geneve");
  const restaurantSlug = slugifyRestaurantSegment(restaurant.slug || "");

  if (citySlug && restaurantSlug) {
    return `/restaurants/${citySlug}/${restaurantSlug}`;
  }

  return restaurant.id ? `/restaurant/${restaurant.id}` : "/recherche";
}
