import {
  filterRestaurantsWithinRadius,
  type Coordinates,
} from "@/lib/nearbyRestaurants";
import {
  hasRestaurantVisual,
  shuffleRestaurantsWithVisuals,
  type RestaurantWithVisual,
} from "@/lib/randomizedRestaurantOrder";

export type HomeRestaurantCandidate = RestaurantWithVisual & {
  id: string;
  name: string;
  campaign_id?: string | number | null;
  city?: string | null;
  address?: string | null;
  image_url?: string | null;
  cuisine_type?: string | null;
  category_names?: unknown;
  category_slugs?: unknown;
  rating?: number | null;
  review_count?: unknown;
  monthly_reservations?: unknown;
  monthly_orders?: unknown;
  promotion_score?: unknown;
  latitude?: number | null;
  longitude?: number | null;
};

export type HomeRestaurantSections<T extends HomeRestaurantCandidate> = {
  personalCards: T[];
  localCards: T[];
  lunchCards: T[];
  dinnerCards: T[];
  offersCards: T[];
  trendingCards: T[];
  sponsoredCards: T[];
  mapRestaurants: T[];
  trendingMode: "trending" | "discover";
};

type BuildHomeRestaurantSectionsParams<T extends HomeRestaurantCandidate> = {
  candidates: readonly T[];
  offerCandidates?: readonly T[];
  personalRestaurants?: readonly T[];
  sponsoredRestaurants?: readonly T[];
  reservedRestaurantIds?: readonly string[];
  userCoordinates?: Coordinates | null;
  userCity?: string | null;
  radiusKm?: number;
  seed: number | string;
  lunchFocus: boolean;
  sectionSize?: number;
  trendingSize?: number;
};

const LUNCH_CATEGORY_TOKENS = new Set([
  "bistro",
  "brasserie",
  "burger",
  "cafe",
  "crepes",
  "desserts",
  "petit-dejeuner",
  "pizza",
  "salades",
  "sandwich",
  "street-food",
  "sushi",
  "traiteur",
]);

const DINNER_CATEGORY_TOKENS = new Set([
  "africain",
  "asiatique",
  "bistro",
  "brasserie",
  "chinois",
  "fine-dining",
  "francais",
  "fruits-de-mer",
  "grillades",
  "indien",
  "international",
  "italien",
  "japonais",
  "libanais",
  "portugais",
  "suisse",
  "sushi",
  "thai",
]);

function normalizeToken(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function restaurantId(restaurant: HomeRestaurantCandidate): string {
  return String(restaurant?.id || "").trim();
}

function restaurantCategoryTokens(restaurant: HomeRestaurantCandidate): string[] {
  const values = [
    ...(Array.isArray(restaurant?.category_slugs) ? restaurant.category_slugs : []),
    ...(Array.isArray(restaurant?.category_names) ? restaurant.category_names : []),
    ...String(restaurant?.cuisine_type || "").split(/[,/|]/),
  ];

  return Array.from(new Set(values.map(normalizeToken).filter(Boolean)));
}

function primaryCategoryKey(restaurant: HomeRestaurantCandidate): string {
  return restaurantCategoryTokens(restaurant)[0] || `restaurant:${restaurantId(restaurant)}`;
}

function matchesCategoryGroup(
  restaurant: HomeRestaurantCandidate,
  group: ReadonlySet<string>,
): boolean {
  return restaurantCategoryTokens(restaurant).some((token) => group.has(token));
}

export function isHomeLunchCandidate(restaurant: HomeRestaurantCandidate): boolean {
  return matchesCategoryGroup(restaurant, LUNCH_CATEGORY_TOKENS);
}

export function isHomeDinnerCandidate(restaurant: HomeRestaurantCandidate): boolean {
  return matchesCategoryGroup(restaurant, DINNER_CATEGORY_TOKENS);
}

export function hasHomeOfferSignal(restaurant: HomeRestaurantCandidate): boolean {
  return toNumber(restaurant?.promotion_score) > 0;
}

export function hasHomeTrendSignal(restaurant: HomeRestaurantCandidate): boolean {
  return (
    toNumber(restaurant?.monthly_reservations) > 0
    || toNumber(restaurant?.monthly_orders) > 0
    || toNumber(restaurant?.review_count) > 0
    || toNumber(restaurant?.rating) > 0
  );
}

function filterUniqueVisuals<T extends HomeRestaurantCandidate>(
  restaurants: readonly T[],
  excludedIds: ReadonlySet<string> = new Set(),
): T[] {
  const seenIds = new Set<string>(excludedIds);
  const result: T[] = [];

  for (const restaurant of restaurants) {
    const id = restaurantId(restaurant);
    if (!id || seenIds.has(id) || !hasRestaurantVisual(restaurant)) continue;
    seenIds.add(id);
    result.push(restaurant);
  }

  return result;
}

function selectDiverseRestaurants<T extends HomeRestaurantCandidate>(
  restaurants: readonly T[],
  options: {
    seed: number | string;
    limit: number;
    excludedIds?: ReadonlySet<string>;
  },
): T[] {
  const excludedIds = options.excludedIds || new Set<string>();
  const shuffled = shuffleRestaurantsWithVisuals(
    filterUniqueVisuals(restaurants, excludedIds),
    options.seed,
  );
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const usedPrimaryCategories = new Set<string>();

  for (const restaurant of shuffled) {
    if (selected.length >= options.limit) break;
    const categoryKey = primaryCategoryKey(restaurant);
    if (usedPrimaryCategories.has(categoryKey)) continue;
    selected.push(restaurant);
    selectedIds.add(restaurantId(restaurant));
    usedPrimaryCategories.add(categoryKey);
  }

  if (selected.length < options.limit) {
    for (const restaurant of shuffled) {
      if (selected.length >= options.limit) break;
      const id = restaurantId(restaurant);
      if (!id || selectedIds.has(id)) continue;
      selected.push(restaurant);
      selectedIds.add(id);
    }
  }

  return selected;
}

function selectWithFallback<T extends HomeRestaurantCandidate>(
  preferred: readonly T[],
  fallback: readonly T[],
  options: {
    seed: number | string;
    limit: number;
    excludedIds: ReadonlySet<string>;
  },
): T[] {
  const preferredCards = selectDiverseRestaurants(preferred, options);
  if (preferredCards.length >= options.limit) return preferredCards;

  const nextExcluded = new Set(options.excludedIds);
  preferredCards.forEach((restaurant) => nextExcluded.add(restaurantId(restaurant)));
  const fallbackCards = selectDiverseRestaurants(fallback, {
    seed: `${String(options.seed)}:fallback`,
    limit: options.limit - preferredCards.length,
    excludedIds: nextExcluded,
  });

  return [...preferredCards, ...fallbackCards];
}

function addRestaurantIds(
  target: Set<string>,
  restaurants: readonly HomeRestaurantCandidate[],
) {
  restaurants.forEach((restaurant) => {
    const id = restaurantId(restaurant);
    if (id) target.add(id);
  });
}

function matchesCity(restaurant: HomeRestaurantCandidate, city: string): boolean {
  const expected = normalizeToken(city);
  if (!expected) return false;
  return normalizeToken(restaurant?.city) === expected;
}

function locationPool<T extends HomeRestaurantCandidate>(
  restaurants: readonly T[],
  userCoordinates: Coordinates | null | undefined,
  userCity: string | null | undefined,
  radiusKm: number,
): T[] {
  if (userCoordinates) {
    return filterRestaurantsWithinRadius(
      [...restaurants],
      userCoordinates,
      radiusKm,
    ) as T[];
  }

  if (String(userCity || "").trim()) {
    return restaurants.filter((restaurant) => matchesCity(restaurant, String(userCity)));
  }

  return [...restaurants];
}

export function buildHomeRestaurantSections<T extends HomeRestaurantCandidate>({
  candidates,
  offerCandidates = [],
  personalRestaurants = [],
  sponsoredRestaurants = [],
  reservedRestaurantIds = [],
  userCoordinates = null,
  userCity = null,
  radiusKm = 5,
  seed,
  lunchFocus,
  sectionSize = 4,
  trendingSize = 6,
}: BuildHomeRestaurantSectionsParams<T>): HomeRestaurantSections<T> {
  const cleanCandidates = filterUniqueVisuals(candidates);
  const cleanOfferCandidates = filterUniqueVisuals(offerCandidates).filter(hasHomeOfferSignal);
  const scopedCandidates = locationPool(cleanCandidates, userCoordinates, userCity, radiusKm);
  const scopedOfferCandidates = locationPool(cleanOfferCandidates, userCoordinates, userCity, radiusKm);
  const scopedSponsoredCandidates = locationPool(
    filterUniqueVisuals(sponsoredRestaurants),
    userCoordinates,
    userCity,
    radiusKm,
  );

  const personalCards = filterUniqueVisuals(personalRestaurants).slice(0, sectionSize);
  const personalIds = new Set<string>();
  addRestaurantIds(personalIds, personalCards);

  const sponsoredCards = selectDiverseRestaurants(scopedSponsoredCandidates, {
    seed: `${String(seed)}:sponsored`,
    limit: 6,
    excludedIds: personalIds,
  });

  const usedIds = new Set<string>(reservedRestaurantIds.map(String).filter(Boolean));
  addRestaurantIds(usedIds, personalCards);
  addRestaurantIds(usedIds, sponsoredCards);

  const offersCards = selectDiverseRestaurants(scopedOfferCandidates, {
    seed: `${String(seed)}:offers`,
    limit: sectionSize,
    excludedIds: usedIds,
  });
  addRestaurantIds(usedIds, offersCards);

  const trendPool = scopedCandidates.filter(hasHomeTrendSignal);
  const eligibleTrendPool = filterUniqueVisuals(trendPool, usedIds);
  const hasEnoughTrendSignals = eligibleTrendPool.length >= 3;
  const trendSignalCards = hasEnoughTrendSignals
    ? selectDiverseRestaurants(eligibleTrendPool, {
      seed: `${String(seed)}:trending`,
      limit: trendingSize,
      excludedIds: usedIds,
    })
    : [];
  addRestaurantIds(usedIds, trendSignalCards);

  const localCards = selectDiverseRestaurants(scopedCandidates, {
    seed: `${String(seed)}:local`,
    limit: sectionSize,
    excludedIds: usedIds,
  });
  addRestaurantIds(usedIds, localCards);

  const lunchPool = scopedCandidates.filter(isHomeLunchCandidate);
  const dinnerPool = scopedCandidates.filter(isHomeDinnerCandidate);

  const selectMealCards = (
    preferred: readonly T[],
    sectionKey: "lunch" | "dinner",
  ) => {
    const cards = selectWithFallback(preferred, scopedCandidates, {
      seed: `${String(seed)}:${sectionKey}`,
      limit: sectionSize,
      excludedIds: usedIds,
    });
    addRestaurantIds(usedIds, cards);
    return cards;
  };

  let lunchCards: T[];
  let dinnerCards: T[];
  if (lunchFocus) {
    lunchCards = selectMealCards(lunchPool, "lunch");
    dinnerCards = selectMealCards(dinnerPool, "dinner");
  } else {
    dinnerCards = selectMealCards(dinnerPool, "dinner");
    lunchCards = selectMealCards(lunchPool, "lunch");
  }

  const trendingMode: HomeRestaurantSections<T>["trendingMode"] = hasEnoughTrendSignals
    ? "trending"
    : "discover";
  const trendingCards = hasEnoughTrendSignals
    ? trendSignalCards
    : selectDiverseRestaurants(scopedCandidates, {
      seed: `${String(seed)}:discover`,
      limit: trendingSize,
      excludedIds: usedIds,
    });

  return {
    personalCards,
    localCards,
    lunchCards,
    dinnerCards,
    offersCards,
    trendingCards,
    sponsoredCards,
    mapRestaurants: scopedCandidates,
    trendingMode,
  };
}
