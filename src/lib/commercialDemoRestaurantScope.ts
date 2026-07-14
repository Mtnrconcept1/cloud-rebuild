export type CommercialDemoRestaurantRow = {
  id: string;
  is_demo?: boolean | null;
};

export function normalizeCommercialDemoRestaurantId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Defense in depth for the embedded restaurateur dashboard. The snapshot RPC
 * is authoritative; even if a query or cache unexpectedly returns additional
 * rows, no real or unrelated restaurant may cross the frame boundary.
 */
export function filterCommercialDemoRestaurants<T extends CommercialDemoRestaurantRow>(
  rows: readonly T[],
  demoRestaurantId: unknown,
) {
  const normalizedId = normalizeCommercialDemoRestaurantId(demoRestaurantId);
  if (!normalizedId) return [] as T[];
  return rows.filter((restaurant) => (
    restaurant.id === normalizedId && restaurant.is_demo === true
  ));
}

export function resolveCommercialDemoRestaurantSelection<T extends CommercialDemoRestaurantRow>(
  rows: readonly T[],
  demoRestaurantId: unknown,
) {
  const authorizedRestaurant = filterCommercialDemoRestaurants(rows, demoRestaurantId)[0];
  return authorizedRestaurant?.id || null;
}
