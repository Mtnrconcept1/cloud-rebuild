import type {
  MarketingSocialCollectionProgress,
  MarketingSocialCollectResult,
  MarketingSocialFollowList,
  MarketingSocialProfile,
  MarketingSocialRestaurant,
} from "../../supabase/functions/_shared/marketing-social-follow-contract";

export const SOCIAL_RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
export const SOCIAL_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
export const SOCIAL_ACCOUNT_ID = "17841400000000001";

export function socialRestaurant(overrides: Partial<MarketingSocialRestaurant> = {}): MarketingSocialRestaurant {
  return { id: SOCIAL_RESTAURANT_ID, name: "Restaurant du Lac", city: "Genève", websiteUrl: "https://restaurant.example/", discoveryStatus: "pending", ...overrides };
}

export function socialProfile(overrides: Partial<MarketingSocialProfile> = {}): MarketingSocialProfile {
  return {
    id: SOCIAL_PROFILE_ID,
    platform: "instagram",
    canonicalKey: "restaurant_du_lac",
    profileUrl: "https://www.instagram.com/restaurant_du_lac/",
    handle: "@restaurant_du_lac",
    followStatus: "unknown",
    verificationStatus: "needs_review",
    sourceAccountId: SOCIAL_ACCOUNT_ID,
    version: 0,
    confirmedAt: null,
    confirmedBy: null,
    note: "",
    sourceUrl: "https://restaurant.example/contact",
    sourceKind: "website",
    restaurants: [{ id: SOCIAL_RESTAURANT_ID, name: "Restaurant du Lac", city: "Genève", sourceUrl: "https://restaurant.example/contact", sourceKind: "website", context: "Instagram du restaurant" }],
    restaurantCount: 1,
    firstSeenAt: "2026-10-19T10:00:00Z",
    lastSeenAt: "2026-10-19T10:00:00Z",
    ...overrides,
  };
}

export function socialProgress(overrides: Partial<MarketingSocialCollectionProgress> = {}): MarketingSocialCollectionProgress {
  return { eligibleRestaurants: 3, totalJobs: 3, pending: 3, processing: 0, completed: 0, success: 0, noProfiles: 0, noWebsite: 0, robotsBlocked: 0, errors: 0, profiles: 1, hasMore: true, ...overrides };
}

export function socialList(overrides: Partial<MarketingSocialFollowList> = {}): MarketingSocialFollowList {
  return {
    items: [socialProfile()],
    total: 1,
    counts: { unknown: 1, not_followed: 0, requested: 0, followed: 0, ignored: 0 },
    sourceAccounts: [
      { platform: "instagram", id: SOCIAL_ACCOUNT_ID, label: "@tok_restaurants", profileUrl: "https://www.instagram.com/tok_restaurants/", configured: true },
      { platform: "facebook", id: "11223344556677", label: "TOK Restaurants", profileUrl: "https://www.facebook.com/tokrestaurants/", configured: true },
    ],
    collection: socialProgress(),
    ...overrides,
  };
}

export function socialCollect(overrides: Partial<MarketingSocialCollectResult> = {}): MarketingSocialCollectResult {
  return {
    processed: 3,
    discovered: 1,
    deduplicated: 0,
    failed: 0,
    hasMore: false,
    collection: socialProgress({ pending: 0, completed: 3, success: 1, noProfiles: 2, hasMore: false }),
    results: [{ restaurantId: SOCIAL_RESTAURANT_ID, status: "success", profilesFound: 1 }],
    ...overrides,
  };
}

export function socialDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}
