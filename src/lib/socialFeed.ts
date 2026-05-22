export type SocialFeedRankInput = {
  viewerCity?: string | null;
  favoriteCuisines?: string[] | null;
  followedRestaurantIds?: string[] | null;
  favoriteRestaurantIds?: string[] | null;
  interactedRestaurantIds?: string[] | null;
  nowIso?: string;
};

export type SocialFeedRankableItem = {
  id: string;
  restaurantId: string;
  cuisineType?: string | null;
  city?: string | null;
  createdAt: string;
  likesCount?: number | null;
  commentsCount?: number | null;
  repostsCount?: number | null;
  sharesCount?: number | null;
};

export type SocialFeedRankedItem<T extends SocialFeedRankableItem = SocialFeedRankableItem> = T & {
  score: number;
};

export type SocialFeedMedia = {
  id: string;
  postId: string;
  mediaUrl: string;
  mediaPath?: string | null;
  mediaType: "image" | "video";
  sortOrder: number;
  altText?: string | null;
};

export type SocialFeedPost = {
  id: string;
  activityId: string;
  activityType: "post" | "repost";
  restaurantId: string;
  authorId: string;
  body: string;
  status: "published" | "hidden" | "deleted";
  createdAt: string;
  publishedAt: string | null;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  sharesCount: number;
  likedByMe: boolean;
  followedByMe: boolean;
  repostedByMe: boolean;
  score: number;
  media: SocialFeedMedia[];
  restaurant: {
    id: string;
    name: string;
    imageUrl?: string | null;
    city?: string | null;
    cuisineType?: string | null;
  };
  repost?: {
    id: string;
    userId: string;
    note?: string | null;
    createdAt: string;
    authorName?: string | null;
  } | null;
};

export type SocialFeedComment = {
  id: string;
  postId: string;
  userId: string;
  body: string;
  status: "published" | "hidden" | "deleted";
  createdAt: string;
  authorName?: string | null;
};

function normalizeToken(value?: string | null) {
  return (value || "")
    .trim()
    .toLocaleLowerCase("fr-CH")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildSet(values?: string[] | null) {
  return new Set((values || []).filter(Boolean));
}

function getRecencyScore(createdAt: string, nowIso?: string) {
  const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const createdMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) return 0;

  const ageHours = Math.max(0, (nowMs - createdMs) / 36e5);
  return Math.max(0, 32 - ageHours * 0.6);
}

function getEngagementScore(item: SocialFeedRankableItem) {
  const likes = Math.max(0, Number(item.likesCount || 0));
  const comments = Math.max(0, Number(item.commentsCount || 0));
  const reposts = Math.max(0, Number(item.repostsCount || 0));
  const shares = Math.max(0, Number(item.sharesCount || 0));
  const raw = Math.log1p(likes) * 2.2 + Math.log1p(comments) * 4 + Math.log1p(reposts) * 5 + Math.log1p(shares) * 3.2;

  return Math.min(25, raw);
}

export function getSocialFeedScore(item: SocialFeedRankableItem, input: SocialFeedRankInput = {}) {
  const followedRestaurantIds = buildSet(input.followedRestaurantIds);
  const favoriteRestaurantIds = buildSet(input.favoriteRestaurantIds);
  const interactedRestaurantIds = buildSet(input.interactedRestaurantIds);
  const favoriteCuisines = new Set((input.favoriteCuisines || []).map(normalizeToken).filter(Boolean));
  const cuisine = normalizeToken(item.cuisineType);
  const city = normalizeToken(item.city);
  const viewerCity = normalizeToken(input.viewerCity);

  let score = getRecencyScore(item.createdAt, input.nowIso) + getEngagementScore(item);

  if (followedRestaurantIds.has(item.restaurantId)) score += 100;
  if (favoriteRestaurantIds.has(item.restaurantId)) score += 16;
  if (interactedRestaurantIds.has(item.restaurantId)) score += 18;
  if (cuisine && favoriteCuisines.has(cuisine)) score += 35;
  if (city && viewerCity && city === viewerCity) score += 22;

  return Math.round(score * 100) / 100;
}

export function rankSocialFeedItems<T extends SocialFeedRankableItem>(
  items: T[],
  input: SocialFeedRankInput = {},
): Array<SocialFeedRankedItem<T>> {
  return items
    .map((item) => ({
      ...item,
      score: getSocialFeedScore(item, input),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function getSocialPostShareUrl(postId: string) {
  if (typeof window === "undefined") return `/actualites?post=${encodeURIComponent(postId)}`;
  return `${window.location.origin}/actualites?post=${encodeURIComponent(postId)}`;
}
