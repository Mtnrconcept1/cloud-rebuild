import type { SocialFeedPost, SocialPostCtaType, SocialPostType } from "@/lib/socialFeed";

export const ACTUALITES_FALLBACK_TRENDS = ["Offre midi", "Arrivages", "Coulisses", "Tables libres"] as const;
export const ACTUALITES_CLICK_SIGNAL_STORAGE_KEY = "tok-actualites-click-signals-v1";
export const ACTUALITES_CLICK_SIGNAL_EVENT = "tok:actualites-click-signals-updated";

const MAX_STORED_CLICK_SIGNALS = 80;
const MAX_TRENDS = 4;
const MAX_BODY_LENGTH = 280;

export type ActualitesPostClickSignal = {
  postId: string;
  restaurantId: string;
  cuisineType?: string | null;
  city?: string | null;
  postType?: SocialPostType | null;
  ctaType?: SocialPostCtaType | null;
  campaignGoal?: string | null;
  body?: string | null;
  recommendationReasons?: string[];
  createdAt: string;
};

export type ActualitesOrderTrendSignal = {
  restaurantCuisine?: string | null;
  restaurantCity?: string | null;
  createdAt?: string | null;
  scheduledAt?: string | null;
};

export type ActualitesReservationTrendSignal = {
  restaurantCuisine?: string | null;
  restaurantCity?: string | null;
  date?: string | null;
  time?: string | null;
  partySize?: number | null;
  createdAt?: string | null;
};

export type ActualitesPersonalizedTrendInput = {
  orders?: ActualitesOrderTrendSignal[];
  reservations?: ActualitesReservationTrendSignal[];
  clickedPosts?: Array<Partial<ActualitesPostClickSignal>>;
  feedPosts?: SocialFeedPost[];
  max?: number;
};

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CH")
    .trim();
}

function cleanTrendLabel(value: unknown) {
  return String(value || "")
    .replace(/[#/|]+/g, ",")
    .replace(/\s*\+\s*\d+\s*/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDisplayTrend(value: string) {
  const clean = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return clean.charAt(0).toLocaleUpperCase("fr-CH") + clean.slice(1);
}

function getPrimaryAndSecondaryCuisines(cuisine?: string | null) {
  const [primary, ...secondary] = cleanTrendLabel(cuisine);
  return {
    primary: primary ? toDisplayTrend(primary) : "",
    secondary: secondary.map(toDisplayTrend).filter(Boolean).slice(0, 2),
  };
}

function isLunchTime(value?: string | null) {
  if (!value) return false;
  const hourMatch = String(value).match(/(?:T|\s|^)(\d{1,2}):/);
  const hour = hourMatch ? Number(hourMatch[1]) : NaN;
  return Number.isFinite(hour) && hour >= 10 && hour <= 14;
}

function isDinnerTime(value?: string | null) {
  if (!value) return false;
  const hourMatch = String(value).match(/(?:T|\s|^)(\d{1,2}):/);
  const hour = hourMatch ? Number(hourMatch[1]) : NaN;
  return Number.isFinite(hour) && hour >= 18 && hour <= 22;
}

function addScore(scores: Map<string, number>, label: string | undefined | null, weight: number) {
  const display = toDisplayTrend(String(label || ""));
  if (!display) return;
  const normalized = normalizeText(display);
  if (!normalized) return;
  scores.set(display, (scores.get(display) || 0) + weight);
}

function addCuisineScores(scores: Map<string, number>, cuisine?: string | null, primaryWeight = 12, secondaryWeight = 4) {
  const cuisines = getPrimaryAndSecondaryCuisines(cuisine);
  addScore(scores, cuisines.primary, primaryWeight);
  cuisines.secondary.forEach((item) => addScore(scores, item, secondaryWeight));
}

function addCityScore(scores: Map<string, number>, city?: string | null, weight = 2) {
  const cleaned = cleanTrendLabel(city)[0];
  if (!cleaned) return;
  addScore(scores, cleaned, weight);
}

function addTextIntentScores(scores: Map<string, number>, text?: string | null, weight = 8) {
  const normalized = normalizeText(text);
  if (!normalized) return;

  if (/\bmidi\b|dej(?:e|é)uner|lunch|service de midi/.test(normalized)) addScore(scores, "Offre midi", weight + 4);
  if (/arrivage|frais|fraicheur|march(?:e|é)|produit du jour/.test(normalized)) addScore(scores, "Arrivages", weight);
  if (/coulisse|cuisine|preparation|fait maison|equipe/.test(normalized)) addScore(scores, "Coulisses", weight);
  if (/table|reservation|reservez|soir|ce soir|service du soir/.test(normalized)) addScore(scores, "Tables libres", weight);
  if (/brunch/.test(normalized)) addScore(scores, "Brunch", weight + 2);
  if (/burger/.test(normalized)) addScore(scores, "Burgers", weight + 2);
  if (/pizza|pinsa/.test(normalized)) addScore(scores, "Pizza", weight + 2);
  if (/tacos|kebab/.test(normalized)) addScore(scores, "Street food", weight + 2);
  if (/sushi|ramen|thai|tha(?:i|ï)/.test(normalized)) addScore(scores, "Asiatique", weight + 2);
}

function addPostTypeScores(
  scores: Map<string, number>,
  postType?: string | null,
  ctaType?: string | null,
  campaignGoal?: string | null,
  weight = 12,
) {
  const type = normalizeText(postType);
  const cta = normalizeText(ctaType);
  const goal = normalizeText(campaignGoal);

  if (type === "promo" || cta === "offer" || goal === "offer") addScore(scores, "Offres", weight);
  if (type === "coulisses") addScore(scores, "Coulisses", weight);
  if (type === "plat" || cta === "order" || goal === "orders") addScore(scores, "Plats du moment", weight);
  if (type === "evenement" || cta === "reserve" || goal === "bookings") addScore(scores, "Tables libres", weight);
}

function sortScores(scores: Map<string, number>, max: number) {
  const normalizedSeen = new Set<string>();
  return Array.from(scores.entries())
    .sort(([aLabel, aScore], [bLabel, bScore]) => {
      if (bScore !== aScore) return bScore - aScore;
      return aLabel.localeCompare(bLabel, "fr-CH");
    })
    .map(([label]) => label)
    .filter((label) => {
      const normalized = normalizeText(label);
      if (!normalized || normalizedSeen.has(normalized)) return false;
      normalizedSeen.add(normalized);
      return true;
    })
    .slice(0, max);
}

function safeParseClickSignals(value: string | null): ActualitesPostClickSignal[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ActualitesPostClickSignal =>
      Boolean(item && typeof item === "object" && typeof item.postId === "string" && typeof item.restaurantId === "string"),
    );
  } catch {
    return [];
  }
}

export function readActualitesPostSignals() {
  if (typeof window === "undefined") return [];
  try {
    return safeParseClickSignals(window.localStorage.getItem(ACTUALITES_CLICK_SIGNAL_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function rememberActualitesPostSignal(post: SocialFeedPost) {
  if (typeof window === "undefined") return;

  try {
    const previous = readActualitesPostSignals();
    const nextSignal: ActualitesPostClickSignal = {
      postId: post.id,
      restaurantId: post.restaurantId,
      cuisineType: post.restaurant.cuisineType || null,
      city: post.restaurant.city || null,
      postType: post.postType || null,
      ctaType: post.ctaType || null,
      campaignGoal: post.campaignGoal || null,
      body: post.body ? post.body.slice(0, MAX_BODY_LENGTH) : null,
      recommendationReasons: (post.recommendationReasons || []).slice(0, 4),
      createdAt: new Date().toISOString(),
    };

    const next = [
      nextSignal,
      ...previous.filter((signal) => signal.postId !== post.id),
    ].slice(0, MAX_STORED_CLICK_SIGNALS);

    window.localStorage.setItem(ACTUALITES_CLICK_SIGNAL_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(ACTUALITES_CLICK_SIGNAL_EVENT));
  } catch {
    // Personalization is best-effort and must never break the feed.
  }
}

export function buildPersonalizedActualitesTrends({
  orders = [],
  reservations = [],
  clickedPosts = [],
  feedPosts = [],
  max = MAX_TRENDS,
}: ActualitesPersonalizedTrendInput) {
  const scores = new Map<string, number>();
  const limit = Math.max(1, Math.min(8, max));

  for (const order of orders.slice(0, 40)) {
    addCuisineScores(scores, order.restaurantCuisine, 24, 5);
    addCityScore(scores, order.restaurantCity, 2);
    if (isLunchTime(order.scheduledAt || order.createdAt)) addScore(scores, "Offre midi", 12);
    if (isDinnerTime(order.scheduledAt || order.createdAt)) addScore(scores, "Service du soir", 8);
  }

  for (const reservation of reservations.slice(0, 40)) {
    addCuisineScores(scores, reservation.restaurantCuisine, 12, 3);
    addCityScore(scores, reservation.restaurantCity, 2);
    addScore(scores, "Tables libres", Number(reservation.partySize || 0) >= 4 ? 30 : 24);
    if (isLunchTime(reservation.time)) addScore(scores, "Offre midi", 14);
    if (isDinnerTime(reservation.time)) addScore(scores, "Service du soir", 10);
  }

  for (const signal of clickedPosts.slice(0, 80)) {
    addCuisineScores(scores, signal.cuisineType, 22, 5);
    addCityScore(scores, signal.city, 2);
    addPostTypeScores(scores, signal.postType, signal.ctaType, signal.campaignGoal, 14);
    addTextIntentScores(scores, signal.body, 12);
    signal.recommendationReasons?.forEach((reason) => addTextIntentScores(scores, reason, 4));
  }

  for (const post of feedPosts.slice(0, 20)) {
    const personalMatch = (post.recommendationReasons || []).some((reason) =>
      /cuisine pref|deja commande|reserve|proximit|favori|suivi/i.test(normalizeText(reason)),
    );
    if (!personalMatch) continue;
    addCuisineScores(scores, post.restaurant.cuisineType, 8, 2);
    addPostTypeScores(scores, post.postType, post.ctaType, post.campaignGoal, 5);
  }

  const ranked = sortScores(scores, limit);
  if (ranked.length >= limit) return ranked;

  const fallback = [...ranked];
  for (const trend of ACTUALITES_FALLBACK_TRENDS) {
    if (fallback.length >= limit) break;
    if (!fallback.some((item) => normalizeText(item) === normalizeText(trend))) fallback.push(trend);
  }
  return fallback;
}
