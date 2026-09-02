export type RestaurantWithVisual = {
  id?: unknown;
  campaign_id?: unknown;
  image_url?: unknown;
  promo_image?: unknown;
};

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasRestaurantVisual(restaurant: RestaurantWithVisual): boolean {
  return hasNonEmptyString(restaurant.image_url) || hasNonEmptyString(restaurant.promo_image);
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shuffleRestaurantsWithVisuals<T extends RestaurantWithVisual>(
  restaurants: readonly T[],
  seed: number | string,
): T[] {
  const seedText = String(seed);

  return restaurants
    .map((restaurant, index) => ({ restaurant, index }))
    .filter(({ restaurant }) => hasRestaurantVisual(restaurant))
    .map(({ restaurant, index }) => ({
      restaurant,
      index,
      order: hashText(
        `${seedText}:${String(restaurant.id ?? "restaurant")}:${String(restaurant.campaign_id ?? "organic")}`,
      ),
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ restaurant }) => restaurant);
}
