import type { SocialFeedPost } from "@/lib/socialFeed";

export type SocialFeedHiddenFeedback = {
  postIds: string[];
  restaurantIds: string[];
};

type SocialFeedFeedbackType = "hide_post" | "hide_restaurant" | "not_interested" | "show_more";

const STORAGE_KEY_PREFIX = "tok-social-feed-hidden";

function getStorageKey(userId?: string | null) {
  return `${STORAGE_KEY_PREFIX}:${userId || "anonymous"}`;
}

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizeHiddenFeedback(value: unknown): SocialFeedHiddenFeedback {
  if (!value || typeof value !== "object") return { postIds: [], restaurantIds: [] };
  const candidate = value as Partial<SocialFeedHiddenFeedback>;

  return {
    postIds: Array.isArray(candidate.postIds) ? Array.from(new Set(candidate.postIds.filter(Boolean))) : [],
    restaurantIds: Array.isArray(candidate.restaurantIds)
      ? Array.from(new Set(candidate.restaurantIds.filter(Boolean)))
      : [],
  };
}

function writeSocialFeedHiddenFeedback(userId: string | null | undefined, feedback: SocialFeedHiddenFeedback) {
  try {
    getStorage()?.setItem(getStorageKey(userId), JSON.stringify(feedback));
  } catch {
    // Local persistence is an immediate UI guard; backend feedback remains the source of truth.
  }
}

export function readSocialFeedHiddenFeedback(userId?: string | null): SocialFeedHiddenFeedback {
  try {
    const raw = getStorage()?.getItem(getStorageKey(userId));
    return normalizeHiddenFeedback(raw ? JSON.parse(raw) : null);
  } catch {
    return { postIds: [], restaurantIds: [] };
  }
}

export function rememberSocialFeedHiddenFeedback(
  userId: string | null | undefined,
  post: Pick<SocialFeedPost, "id" | "restaurantId">,
  feedbackType: SocialFeedFeedbackType,
) {
  if (!userId || feedbackType === "show_more") return;

  const feedback = readSocialFeedHiddenFeedback(userId);
  if (feedbackType === "hide_restaurant") {
    feedback.restaurantIds = Array.from(new Set([...feedback.restaurantIds, post.restaurantId]));
  } else {
    feedback.postIds = Array.from(new Set([...feedback.postIds, post.id]));
  }

  writeSocialFeedHiddenFeedback(userId, feedback);
}

export function filterSocialPostsByHiddenFeedback<T extends Pick<SocialFeedPost, "id" | "restaurantId">>(
  posts: T[],
  feedback: SocialFeedHiddenFeedback,
) {
  const hiddenPostIds = new Set(feedback.postIds);
  const hiddenRestaurantIds = new Set(feedback.restaurantIds);

  return posts.filter((post) => !hiddenPostIds.has(post.id) && !hiddenRestaurantIds.has(post.restaurantId));
}

export function clearSocialFeedHiddenFeedbackForTests(userId?: string | null) {
  try {
    getStorage()?.removeItem(getStorageKey(userId));
  } catch {
    // Test helper only.
  }
}
