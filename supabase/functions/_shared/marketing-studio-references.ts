/** Storage rules shared by Marketing Studio generation and MCP discovery. */
export const MARKETING_REFERENCE_MEDIA_TYPE_PRIORITY = [
  "marketing_logo",
  "marketing_business_card",
  "marketing_menu",
  "marketing_brand_visual",
] as const;
export const MARKETING_REFERENCE_MEDIA_TYPES = [...MARKETING_REFERENCE_MEDIA_TYPE_PRIORITY];

type ReferenceStorage = { storage_bucket: string | null; storage_path: string | null };

function referencePaths(restaurantId: string) {
  return {
    canonical: `${restaurantId}/marketing-assets/`,
    legacy: `/marketing-assets/${restaurantId}/`,
  };
}

export function isCurrentMarketingReferenceStorage(
  row: ReferenceStorage,
  restaurantId: string,
  referenceBucket = "restaurant-images",
) {
  const paths = referencePaths(restaurantId);
  return Boolean(
    (row.storage_bucket === referenceBucket && row.storage_path?.startsWith(paths.canonical)) ||
    (row.storage_bucket === "restaurant-images" && row.storage_path?.includes(paths.legacy)),
  );
}

/** Apply before range/limit: obsolete uploads must not consume a result page. */
export function marketingReferenceStorageFilter(restaurantId: string, referenceBucket = "restaurant-images") {
  const paths = referencePaths(restaurantId);
  // PostgREST quoted literals keep configured bucket names inside their value.
  const quote = (value: string) => JSON.stringify(value);
  return [
    `and(storage_bucket.eq.${quote(referenceBucket)},storage_path.like.${quote(`${paths.canonical}*`)})`,
    `and(storage_bucket.eq.${quote("restaurant-images")},storage_path.like.${quote(`*${paths.legacy}*`)})`,
  ].join(",");
}
