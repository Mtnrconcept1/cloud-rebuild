export type SocialFeedRankInput = {
  viewerCity?: string | null;
  favoriteCuisines?: string[] | null;
  followedRestaurantIds?: string[] | null;
  favoriteRestaurantIds?: string[] | null;
  interactedRestaurantIds?: string[] | null;
  nowIso?: string;
};

export const SOCIAL_FEED_SCOPES = [
  { value: "for_you", label: "Pour vous" },
  { value: "followed", label: "Suivis" },
  { value: "nearby", label: "A proximite" },
  { value: "offers", label: "Offres" },
] as const;

export type SocialFeedScope = (typeof SOCIAL_FEED_SCOPES)[number]["value"];

export const SOCIAL_POST_TYPES = [
  { value: "plat", label: "Plat" },
  { value: "promo", label: "Promo" },
  { value: "evenement", label: "Evenement" },
  { value: "coulisses", label: "Coulisses" },
  { value: "annonce", label: "Annonce" },
] as const;

export type SocialPostType = (typeof SOCIAL_POST_TYPES)[number]["value"];

export const SOCIAL_POST_CTAS = [
  { value: "none", label: "Aucun" },
  { value: "reserve", label: "Reserver" },
  { value: "order", label: "Commander" },
  { value: "menu", label: "Voir menu" },
  { value: "offer", label: "Voir offre" },
] as const;

export type SocialPostCtaType = (typeof SOCIAL_POST_CTAS)[number]["value"];

export type SocialFeedRankableItem = {
  id: string;
  restaurantId: string;
  cuisineType?: string | null;
  city?: string | null;
  createdAt: string;
  postType?: SocialPostType | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  repostsCount?: number | null;
  sharesCount?: number | null;
};

export type SocialFeedRankedItem<T extends SocialFeedRankableItem = SocialFeedRankableItem> = T & {
  score: number;
};

export const SOCIAL_REACTIONS = [
  { type: "like", label: "J'aime", emoji: "👍" },
  { type: "love", label: "J'adore", emoji: "❤️" },
  { type: "miam", label: "Miam", emoji: "😋" },
  { type: "wow", label: "Wouah", emoji: "😮" },
  { type: "bravo", label: "Bravo", emoji: "👏" },
  { type: "fire", label: "Canon", emoji: "🔥" },
] as const;

export type SocialReactionType = (typeof SOCIAL_REACTIONS)[number]["type"];

export type SocialReactionCounts = Partial<Record<SocialReactionType, number>>;

export type SocialReactionSummaryItem = {
  type: SocialReactionType;
  count: number;
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
  status: "draft" | "scheduled" | "published" | "hidden" | "deleted";
  createdAt: string;
  publishedAt: string | null;
  likesCount: number;
  reactionCounts: SocialReactionCounts;
  myReaction: SocialReactionType | null;
  commentsCount: number;
  repostsCount: number;
  sharesCount: number;
  likedByMe: boolean;
  followedByMe: boolean;
  repostedByMe: boolean;
  savedByMe?: boolean;
  score: number;
  media: SocialFeedMedia[];
  postType?: SocialPostType | null;
  ctaType?: SocialPostCtaType | null;
  ctaTargetId?: string | null;
  scheduledAt?: string | null;
  pinnedUntil?: string | null;
  visibility?: "public" | "followers" | "unlisted" | null;
  recommendationReasons?: string[];
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
  parentCommentId?: string | null;
  userId: string;
  body: string;
  status: "published" | "hidden" | "deleted";
  createdAt: string;
  authorName?: string | null;
  reactionsCount: number;
  reactionCounts: SocialReactionCounts;
  myReaction: SocialReactionType | null;
};

export type SocialCommentThread = {
  comment: SocialFeedComment;
  replies: SocialCommentThread[];
};

const SOCIAL_REACTION_TYPES = new Set<SocialReactionType>(SOCIAL_REACTIONS.map((reaction) => reaction.type));
const SOCIAL_FEED_SCOPE_VALUES = new Set<SocialFeedScope>(SOCIAL_FEED_SCOPES.map((scope) => scope.value));
const SOCIAL_POST_TYPE_VALUES = new Set<SocialPostType>(SOCIAL_POST_TYPES.map((type) => type.value));
const SOCIAL_POST_CTA_VALUES = new Set<SocialPostCtaType>(SOCIAL_POST_CTAS.map((cta) => cta.value));

export function normalizeSocialFeedScope(value: unknown): SocialFeedScope {
  return typeof value === "string" && SOCIAL_FEED_SCOPE_VALUES.has(value as SocialFeedScope) ? value as SocialFeedScope : "for_you";
}

export function normalizeSocialPostType(value: unknown): SocialPostType {
  return typeof value === "string" && SOCIAL_POST_TYPE_VALUES.has(value as SocialPostType) ? value as SocialPostType : "annonce";
}

export function normalizeSocialPostCta(value: unknown): SocialPostCtaType {
  return typeof value === "string" && SOCIAL_POST_CTA_VALUES.has(value as SocialPostCtaType) ? value as SocialPostCtaType : "none";
}

export function isSocialReactionType(value: unknown): value is SocialReactionType {
  return typeof value === "string" && SOCIAL_REACTION_TYPES.has(value as SocialReactionType);
}

export function normalizeSocialReaction(value: unknown): SocialReactionType | null {
  return isSocialReactionType(value) ? value : null;
}

export function summarizeSocialReactions(counts: SocialReactionCounts = {}): SocialReactionSummaryItem[] {
  return SOCIAL_REACTIONS
    .map((reaction) => ({
      type: reaction.type,
      count: Math.max(0, Number(counts[reaction.type] || 0)),
    }))
    .filter((reaction) => reaction.count > 0);
}

export function getSocialReaction(type: SocialReactionType | null | undefined) {
  return SOCIAL_REACTIONS.find((reaction) => reaction.type === type) || SOCIAL_REACTIONS[0];
}

export function validateSocialPostDraft({
  body,
  filesCount = 0,
  postType,
  ctaType,
  scheduledAt,
  nowIso,
}: {
  body: string;
  filesCount?: number;
  postType?: unknown;
  ctaType?: unknown;
  scheduledAt?: string | null;
  nowIso?: string;
}) {
  const errors: string[] = [];

  if (!body.trim()) errors.push("Le texte du post est requis.");
  if (body.trim().length > 2000) errors.push("Maximum 2000 caracteres par post.");
  if (filesCount > 10) errors.push("Maximum 10 medias par post.");
  if (postType && !SOCIAL_POST_TYPE_VALUES.has(postType as SocialPostType)) errors.push("Type de post invalide.");
  if (ctaType && !SOCIAL_POST_CTA_VALUES.has(ctaType as SocialPostCtaType)) errors.push("CTA invalide.");

  if (scheduledAt) {
    const scheduledMs = new Date(scheduledAt).getTime();
    const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
    if (!Number.isFinite(scheduledMs)) {
      errors.push("Date de programmation invalide.");
    } else if (scheduledMs <= nowMs) {
      errors.push("La programmation doit etre dans le futur.");
    }
  }

  return errors;
}

export function buildSocialCommentThread(comments: SocialFeedComment[]): SocialCommentThread[] {
  const nodes = new Map<string, SocialCommentThread>();
  const roots: SocialCommentThread[] = [];

  for (const comment of comments) {
    nodes.set(comment.id, { comment, replies: [] });
  }

  for (const comment of comments) {
    const node = nodes.get(comment.id);
    if (!node) continue;

    const parentId = comment.parentCommentId || null;
    const parent = parentId ? nodes.get(parentId) : null;

    if (parent && parent.comment.id !== comment.id) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

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

function buildNormalizedSet(values?: string[] | null) {
  return new Set((values || []).map(normalizeToken).filter(Boolean));
}

function getItemCuisine(item: SocialFeedRankableItem | SocialFeedPost) {
  return item.cuisineType || ("restaurant" in item ? item.restaurant.cuisineType : null);
}

function getItemCity(item: SocialFeedRankableItem | SocialFeedPost) {
  return item.city || ("restaurant" in item ? item.restaurant.city : null);
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
  const cuisine = normalizeToken(getItemCuisine(item));
  const city = normalizeToken(getItemCity(item));
  const viewerCity = normalizeToken(input.viewerCity);

  let score = getRecencyScore(item.createdAt, input.nowIso) + getEngagementScore(item);

  if (followedRestaurantIds.has(item.restaurantId)) score += 100;
  if (favoriteRestaurantIds.has(item.restaurantId)) score += 16;
  if (interactedRestaurantIds.has(item.restaurantId)) score += 18;
  if (cuisine && favoriteCuisines.has(cuisine)) score += 35;
  if (city && viewerCity && city === viewerCity) score += 22;
  if (item.postType === "promo") score += 6;

  return Math.round(score * 100) / 100;
}

export function getSocialRecommendationReasons(item: SocialFeedRankableItem, input: SocialFeedRankInput = {}) {
  const reasons: string[] = [];
  const followedRestaurantIds = buildSet(input.followedRestaurantIds);
  const favoriteRestaurantIds = buildSet(input.favoriteRestaurantIds);
  const interactedRestaurantIds = buildSet(input.interactedRestaurantIds);
  const favoriteCuisines = buildNormalizedSet(input.favoriteCuisines);
  const cuisine = normalizeToken(getItemCuisine(item));
  const city = normalizeToken(getItemCity(item));
  const viewerCity = normalizeToken(input.viewerCity);

  if (followedRestaurantIds.has(item.restaurantId)) reasons.push("Restaurant suivi");
  if (favoriteRestaurantIds.has(item.restaurantId)) reasons.push("Dans vos favoris");
  if (interactedRestaurantIds.has(item.restaurantId)) reasons.push("Deja commande ou reserve");
  if (cuisine && favoriteCuisines.has(cuisine)) reasons.push("Cuisine preferee");
  if (city && viewerCity && city === viewerCity) reasons.push("A proximite");
  if (item.postType === "promo") reasons.push("Offre en cours");

  return reasons.slice(0, 3);
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
