/** Storage rules shared by Marketing Studio generation and MCP discovery. */
export const MARKETING_REFERENCE_MEDIA_TYPE_PRIORITY = [
  "marketing_logo",
  "marketing_business_card",
  "marketing_menu",
  "marketing_brand_visual",
] as const;
export const MARKETING_REFERENCE_MEDIA_TYPES = [...MARKETING_REFERENCE_MEDIA_TYPE_PRIORITY];

type ReferenceStorage = { storage_bucket: string | null; storage_path: string | null; media_type?: string | null };

function referencePaths(restaurantId: string) {
  return {
    canonical: `${restaurantId}/marketing-assets/`,
    legacy: `/marketing-assets/${restaurantId}/`,
    style: `${restaurantId}/marketing/style-references/`,
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
    (row.storage_bucket === "restaurant-images" && row.storage_path?.includes(paths.legacy)) ||
    // The reference picker stores a restaurant-owned style photo here. Only
    // indexed marketing_brand_visual rows may be used for marketing identity.
    (row.storage_bucket === "restaurant-images" && row.media_type === "marketing_brand_visual"
      && row.storage_path?.startsWith(paths.style)),
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
    `and(storage_bucket.eq.${quote("restaurant-images")},media_type.eq.marketing_brand_visual,storage_path.like.${quote(`${paths.style}*`)})`,
  ].join(",");
}
