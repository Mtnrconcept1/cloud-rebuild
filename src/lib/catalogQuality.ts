export type RestaurantCatalogQualityInput = {
  image_url?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  opening_hours?: unknown;
  menu_items_count?: number | null;
  payment_methods?: string[] | null;
  cuisine_type?: string | null;
  cuisine_categories?: string[] | null;
};

export type RestaurantCatalogQuality = {
  score: number;
  publishable: boolean;
  missingFields: string[];
};

function hasText(value: string | null | undefined) {
  return Boolean(String(value || "").trim());
}

function hasNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return Number.isFinite(Number(value));
  return false;
}

function hasOpeningHours(value: unknown) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

export function scoreRestaurantCatalogQuality(
  input: RestaurantCatalogQualityInput,
): RestaurantCatalogQuality {
  const checks = [
    { key: "image", ok: hasText(input.image_url) },
    { key: "address", ok: hasText(input.address) },
    { key: "coordinates", ok: hasNumber(input.latitude) && hasNumber(input.longitude) },
    { key: "opening_hours", ok: hasOpeningHours(input.opening_hours) },
    { key: "menu", ok: Number(input.menu_items_count || 0) > 0 },
    { key: "payment_methods", ok: Array.isArray(input.payment_methods) && input.payment_methods.length > 0 },
    {
      key: "cuisine",
      ok: hasText(input.cuisine_type) || (Array.isArray(input.cuisine_categories) && input.cuisine_categories.length > 0),
    },
  ];

  const missingFields = checks.filter((check) => !check.ok).map((check) => check.key);
  const passed = checks.length - missingFields.length;
  const score = Math.round((passed / checks.length) * 100);

  return {
    score,
    publishable: missingFields.length === 0,
    missingFields,
  };
}
