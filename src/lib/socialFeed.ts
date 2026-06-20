export type SocialFeedRankInput = {
  viewerCity?: string | null;
  favoriteCuisines?: string[] | null;
  followedRestaurantIds?: string[] | null;
  favoriteRestaurantIds?: string[] | null;
  interactedRestaurantIds?: string[] | null;
  interestWeights?: SocialFeedInterestWeights | null;
  nowIso?: string;
};

export type SocialFeedInterestWeights = {
  restaurants?: Record<string, number> | null;
  cuisines?: Record<string, number> | null;
  cities?: Record<string, number> | null;
  postTypes?: Record<string, number> | null;
  sponsored?: Record<string, number> | null;
};

export const SOCIAL_FEED_SIGNAL_WEIGHTS = {
  view3s: 1,
  click: 3,
  like: 5,
  comment: 8,
  share: 12,
  reservation: 20,
  order: 25,
  hidePost: -20,
  notInterested: -30,
  showMore: 20,
  showLess: -20,
} as const;

export const SOCIAL_FEED_SCORE_MIX = {
  personalInterest: 0.4,
  proximity: 0.25,
  engagement: 0.2,
  sponsored: 0.15,
} as const;

export const SOCIAL_FEED_SCOPES = [
  { value: "for_you", label: "Pour vous" },
  { value: "followed", label: "Suivis" },
  { value: "nearby", label: "À proximité" },
  { value: "offers", label: "Offres" },
  { value: "saved", label: "Sauvegardés" },
] as const;

export type SocialFeedScope = (typeof SOCIAL_FEED_SCOPES)[number]["value"];

export const SOCIAL_POST_TYPES = [
  { value: "plat", label: "Plat" },
  { value: "promo", label: "Promo" },
  { value: "evenement", label: "Événement" },
  { value: "coulisses", label: "Coulisses" },
  { value: "annonce", label: "Annonce" },
] as const;

export type SocialPostType = (typeof SOCIAL_POST_TYPES)[number]["value"];

export const SOCIAL_POST_CTAS = [
  { value: "none", label: "Aucun" },
  { value: "reserve", label: "Réserver" },
  { value: "order", label: "Commander" },
  { value: "menu", label: "Voir menu" },
  { value: "offer", label: "Voir offre" },
] as const;

export type SocialPostCtaType = (typeof SOCIAL_POST_CTAS)[number]["value"];

export const SOCIAL_MARKETING_GOALS = [
  {
    value: "awareness",
    label: "Notoriété",
    description: "Rendre le restaurant plus visible dans le fil local.",
    recommendedPostType: "coulisses",
    recommendedCta: "menu",
  },
  {
    value: "orders",
    label: "Commandes",
    description: "Transformer une actualité en commandes immédiates.",
    recommendedPostType: "plat",
    recommendedCta: "order",
  },
  {
    value: "bookings",
    label: "Reservations",
    description: "Remplir les services a venir et les soirees spéciales.",
    recommendedPostType: "evenement",
    recommendedCta: "reserve",
  },
  {
    value: "loyalty",
    label: "Fidélisation",
    description: "Faire revenir les clients qui connaissent déjà le restaurant.",
    recommendedPostType: "annonce",
    recommendedCta: "none",
  },
  {
    value: "offer",
    label: "Offre limitée",
    description: "Mettre en avant une promotion avec une action claire.",
    recommendedPostType: "promo",
    recommendedCta: "offer",
  },
] as const;

export type SocialMarketingGoal = (typeof SOCIAL_MARKETING_GOALS)[number]["value"];

export const SOCIAL_AUDIENCE_SEGMENTS = [
  { value: "local", label: "Clients proches", visibility: "public" },
  { value: "followers", label: "Abonnes", visibility: "followers" },
  { value: "returning", label: "Clients fideles", visibility: "followers" },
  { value: "discovery", label: "Nouveaux clients", visibility: "public" },
] as const;

export type SocialAudienceSegment = (typeof SOCIAL_AUDIENCE_SEGMENTS)[number]["value"];

export const SOCIAL_MARKETING_TEMPLATES = [
  {
    id: "lunch-push",
    label: "Booster midi",
    goal: "orders",
    postType: "plat",
    ctaType: "order",
    body: "Service de midi lance: plat du jour, préparation rapide et quantités limitées. Commandez maintenant pour être servi sans attendre.",
  },
  {
    id: "empty-tables",
    label: "Tables libres",
    goal: "bookings",
    postType: "evenement",
    ctaType: "reserve",
    body: "Quelques tables viennent de se libérer ce soir. Réservez votre place et profitez d'un service calme avec nos suggestions du moment.",
  },
  {
    id: "behind-scenes",
    label: "Coulisses",
    goal: "awareness",
    postType: "coulisses",
    ctaType: "menu",
    body: "En cuisine aujourd'hui: un arrivage frais, une préparation maison et une équipe prête pour le service. Découvrez la carte du moment.",
  },
  {
    id: "limited-offer",
    label: "Offre courte",
    goal: "offer",
    postType: "promo",
    ctaType: "offer",
    body: "Offre limitée aujourd'hui: une attention spéciale sur une sélection de plats. Disponible jusqu’à épuisement des stocks.",
  },
] as const;

export type SocialMarketingTemplate = (typeof SOCIAL_MARKETING_TEMPLATES)[number];

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
  isSponsored?: boolean | null;
  sponsoredScore?: number | null;
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

export type SocialPostDashboardMetrics = {
  impressions: number;
  views: number;
  ctaClicks: number;
  interactions: number;
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
  campaignGoal?: SocialMarketingGoal | null;
  campaignName?: string | null;
  isSponsored?: boolean;
  promotionStatus?: string | null;
  promotionPaymentStatus?: string | null;
  audienceSegment?: SocialAudienceSegment | null;
  offerCode?: string | null;
  utmCampaign?: string | null;
  recommendationReasons?: string[];
  dashboardMetrics?: SocialPostDashboardMetrics;
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
  authorAvatarUrl?: string | null;
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
const SOCIAL_MARKETING_GOAL_VALUES = new Set<SocialMarketingGoal>(SOCIAL_MARKETING_GOALS.map((goal) => goal.value));
const SOCIAL_AUDIENCE_SEGMENT_VALUES = new Set<SocialAudienceSegment>(SOCIAL_AUDIENCE_SEGMENTS.map((segment) => segment.value));

export function normalizeSocialFeedScope(value: unknown): SocialFeedScope {
  return typeof value === "string" && SOCIAL_FEED_SCOPE_VALUES.has(value as SocialFeedScope) ? value as SocialFeedScope : "for_you";
}

export function normalizeSocialPostType(value: unknown): SocialPostType {
  return typeof value === "string" && SOCIAL_POST_TYPE_VALUES.has(value as SocialPostType) ? value as SocialPostType : "annonce";
}

export function normalizeSocialPostCta(value: unknown): SocialPostCtaType {
  return typeof value === "string" && SOCIAL_POST_CTA_VALUES.has(value as SocialPostCtaType) ? value as SocialPostCtaType : "none";
}

export function normalizeSocialMarketingGoal(value: unknown): SocialMarketingGoal {
  return typeof value === "string" && SOCIAL_MARKETING_GOAL_VALUES.has(value as SocialMarketingGoal)
    ? value as SocialMarketingGoal
    : "awareness";
}

export function normalizeSocialAudienceSegment(value: unknown): SocialAudienceSegment {
  return typeof value === "string" && SOCIAL_AUDIENCE_SEGMENT_VALUES.has(value as SocialAudienceSegment)
    ? value as SocialAudienceSegment
    : "local";
}

export function isMissingSocialMarketingSchemaError(error: unknown) {
  const message = String((error as { message?: string })?.message || error || "");
  const code = String((error as { code?: string })?.code || "");
  return (
    code === "PGRST204" ||
    /campaign_goal|campaign_name|audience_segment|offer_code|utm_campaign/i.test(message) ||
    (/schema cache|column/i.test(message) && /social_posts/i.test(message))
  );
}

export function isSocialReactionType(value: unknown): value is SocialReactionType {
  return typeof value === "string" && SOCIAL_REACTION_TYPES.has(value as SocialReactionType);
}

export function normalizeSocialReaction(value: unknown): SocialReactionType | null {
  return isSocialReactionType(value) ? value : null;
}

export function normalizeSocialViewerReaction(value: unknown, likedByMe?: boolean | null): SocialReactionType | null {
  const reaction = normalizeSocialReaction(value);
  if (reaction) return reaction;
  return likedByMe ? "like" : null;
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
      errors.push("La programmation doit être dans le futur.");
    }
  }

  return errors;
}

export type SocialMarketingScoreInput = {
  body: string;
  filesCount?: number;
  postType?: SocialPostType;
  ctaType?: SocialPostCtaType;
  scheduledAt?: string | null;
  campaignGoal?: SocialMarketingGoal;
  audienceSegment?: SocialAudienceSegment;
};

export type SocialMarketingScore = {
  score: number;
  level: "faible" | "correct" | "fort" | "excellent";
  checklist: Array<{ label: string; passed: boolean }>;
  recommendations: string[];
};

export function getRecommendedMarketingPair(goal: SocialMarketingGoal) {
  return SOCIAL_MARKETING_GOALS.find((item) => item.value === goal) || SOCIAL_MARKETING_GOALS[0];
}

export function getVisibilityForAudienceSegment(segment: SocialAudienceSegment): "public" | "followers" | "unlisted" {
  return SOCIAL_AUDIENCE_SEGMENTS.find((item) => item.value === segment)?.visibility || "public";
}

export function scoreSocialMarketingDraft(input: SocialMarketingScoreInput): SocialMarketingScore {
  const body = input.body.trim();
  const goal = normalizeSocialMarketingGoal(input.campaignGoal);
  const segment = normalizeSocialAudienceSegment(input.audienceSegment);
  const pair = getRecommendedMarketingPair(goal);
  const ctaType = input.ctaType || "none";
  const postType = input.postType || "annonce";
  const filesCount = Math.max(0, Number(input.filesCount || 0));

  const checks = [
    { label: "Accroche concrete", passed: body.length >= 80 },
    { label: "Media ajoute", passed: filesCount > 0 },
    { label: "CTA aligne", passed: ctaType === pair.recommendedCta },
    { label: "Format adapté à l'objectif", passed: postType === pair.recommendedPostType },
    { label: "Audience définie", passed: Boolean(segment) },
    { label: "Publication planifiée", passed: Boolean(input.scheduledAt) },
  ];

  const score = Math.min(100, Math.round((checks.filter((check) => check.passed).length / checks.length) * 100));
  const recommendations: string[] = [];

  if (body.length < 80) recommendations.push("Ajoutez une accroche plus précise: produit, moment, bénéfice client.");
  if (filesCount === 0) recommendations.push("Ajoutez une photo ou une courte video pour augmenter l'arrêt sur le fil.");
  if (ctaType !== pair.recommendedCta) recommendations.push(`CTA conseille: ${SOCIAL_POST_CTAS.find((cta) => cta.value === pair.recommendedCta)?.label}.`);
  if (postType !== pair.recommendedPostType) recommendations.push(`Format conseille: ${SOCIAL_POST_TYPES.find((type) => type.value === pair.recommendedPostType)?.label}.`);
  if (!input.scheduledAt) recommendations.push("Programmez le post sur un temps fort: avant midi, avant le service du soir ou la veille d'un événement.");

  return {
    score,
    level: score >= 84 ? "excellent" : score >= 67 ? "fort" : score >= 50 ? "correct" : "faible",
    checklist: checks,
    recommendations,
  };
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getWeight(weights: Record<string, number> | null | undefined, key?: string | null, normalize = true) {
  if (!weights || !key) return 0;
  const direct = Number(weights[key] ?? 0);
  if (Number.isFinite(direct) && direct !== 0) return direct;

  const normalized = normalize ? normalizeToken(key) : key;
  const normalizedValue = Number(weights[normalized] ?? 0);
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
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

function getEngagementComponent(item: SocialFeedRankableItem, input: SocialFeedRankInput) {
  const engagement = (getEngagementScore(item) / 25) * 100;
  const freshness = (getRecencyScore(item.createdAt, input.nowIso) / 32) * 100;
  return clamp(engagement * 0.72 + freshness * 0.28, 0, 100);
}

function getPersonalInterestComponent(item: SocialFeedRankableItem, input: SocialFeedRankInput) {
  const followedRestaurantIds = buildSet(input.followedRestaurantIds);
  const favoriteRestaurantIds = buildSet(input.favoriteRestaurantIds);
  const interactedRestaurantIds = buildSet(input.interactedRestaurantIds);
  const favoriteCuisines = buildNormalizedSet(input.favoriteCuisines);
  const cuisine = normalizeToken(getItemCuisine(item));
  const city = normalizeToken(getItemCity(item));
  const weights = input.interestWeights || {};

  let score = 0;
  if (followedRestaurantIds.has(item.restaurantId)) score += 35;
  if (favoriteRestaurantIds.has(item.restaurantId)) score += 30;
  if (interactedRestaurantIds.has(item.restaurantId)) score += 25;
  if (cuisine && favoriteCuisines.has(cuisine)) score += 25;
  if (item.postType === "promo") score += 8;

  score += getWeight(weights.restaurants, item.restaurantId, false);
  score += getWeight(weights.cuisines, cuisine);
  score += getWeight(weights.cities, city);
  score += getWeight(weights.postTypes, item.postType, false);

  return clamp(score, -100, 100);
}

function getProximityComponent(item: SocialFeedRankableItem, input: SocialFeedRankInput) {
  const city = normalizeToken(getItemCity(item));
  const viewerCity = normalizeToken(input.viewerCity);
  if (city && viewerCity && city === viewerCity) return 100;

  const interestCityScore = getWeight(input.interestWeights?.cities, city);
  if (interestCityScore > 0) return clamp(interestCityScore, 0, 70);

  return 0;
}

function getSponsoredComponent(item: SocialFeedRankableItem, input: SocialFeedRankInput) {
  const explicitScore = Number(item.sponsoredScore ?? getWeight(input.interestWeights?.sponsored, item.id, false));
  if (Number.isFinite(explicitScore) && explicitScore > 0) return clamp(explicitScore, 0, 100);
  return item.isSponsored ? 75 : 0;
}

export function getSocialFeedScore(item: SocialFeedRankableItem, input: SocialFeedRankInput = {}) {
  const score =
    getPersonalInterestComponent(item, input) * SOCIAL_FEED_SCORE_MIX.personalInterest +
    getProximityComponent(item, input) * SOCIAL_FEED_SCORE_MIX.proximity +
    getEngagementComponent(item, input) * SOCIAL_FEED_SCORE_MIX.engagement +
    getSponsoredComponent(item, input) * SOCIAL_FEED_SCORE_MIX.sponsored;

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
  if (interactedRestaurantIds.has(item.restaurantId)) reasons.push("Déjà commande ou réserve");
  if (cuisine && favoriteCuisines.has(cuisine)) reasons.push("Cuisine préférée");
  if (city && viewerCity && city === viewerCity) reasons.push("À proximité");
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
