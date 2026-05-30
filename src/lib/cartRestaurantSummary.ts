type CartRestaurantSummaryItem = {
  restaurantName?: string | null;
};

type CartRestaurantSummaryInput = {
  cartMetadata?: Record<string, any>;
  items: CartRestaurantSummaryItem[];
};

function uniqueRestaurantNames(names: Array<string | null | undefined>) {
  return Array.from(new Set(
    names
      .map((name) => (name || "").trim())
      .filter(Boolean),
  ));
}

export function getCartRestaurantSummaryLabel({
  cartMetadata = {},
  items,
}: CartRestaurantSummaryInput) {
  const metadataRestaurants = Array.isArray(cartMetadata.restaurants)
    ? uniqueRestaurantNames(cartMetadata.restaurants)
    : [];
  const itemRestaurants = uniqueRestaurantNames(items.map((item) => item.restaurantName));
  const restaurants = metadataRestaurants.length > 0 ? metadataRestaurants : itemRestaurants;

  if (restaurants.length > 1 || cartMetadata.multi_restaurant === true || cartMetadata.feature === "abonnement") {
    return `Restaurants : ${restaurants.join(", ") || "plusieurs restaurants"}`;
  }

  return `Restaurant : ${restaurants[0] || "Restaurant"}`;
}
