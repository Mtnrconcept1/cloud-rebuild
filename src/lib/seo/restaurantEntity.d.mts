export type RestaurantSeoOpeningHoursRow = {
  key: string;
  label: string;
  hours: string;
};

export type RestaurantSeoModel = {
  title: string;
  description: string;
  canonicalUrl: string;
  image: string | null;
  jsonLd: Record<string, unknown>;
  openingHoursRows: RestaurantSeoOpeningHoursRow[];
  openingHoursSpecifications: Record<string, unknown>[];
  cuisines: string[];
  serviceLabels: string[];
  lastUpdatedIso: string | null;
  lastUpdatedLabel: string | null;
  cityPath: string;
};

export type RestaurantSeoInput = {
  restaurant?: unknown;
  canonicalPath?: string | null;
  heroImage?: string | null;
  images?: unknown[];
  menuItems?: unknown[];
  reviews?: unknown[];
  amenities?: unknown[];
  averageRating?: string | number | null;
  reviewCount?: string | number | null;
};

export function buildRestaurantSeoModel(input?: RestaurantSeoInput): RestaurantSeoModel | null;

export const __restaurantSeoInternals: {
  parseCuisineLabels(value: unknown): string[];
  parseOpeningHours(value: unknown): {
    rows: RestaurantSeoOpeningHoursRow[];
    specifications: Record<string, unknown>[];
  };
  toAbsoluteUrl(value: unknown): string | null;
};
