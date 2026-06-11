import type { SocialFeedPost } from "@/lib/socialFeed";

const BLOCK_WINDOW_MS = 6 * 60 * 60 * 1000;
const INACTIVE_POST_STATUSES = new Set(["draft", "scheduled", "hidden", "deleted"]);

export function createActualitesFeedOrderSeed() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}:${Math.random()}`;
}

export function isActualitesSponsoredPost(post: Pick<SocialFeedPost, "isSponsored" | "promotionStatus" | "promotionPaymentStatus">) {
  const promotionStatus = normalizeStatus(post.promotionStatus);
  const paymentStatus = normalizeStatus(post.promotionPaymentStatus);

  return Boolean(post.isSponsored) && promotionStatus === "active" && paymentStatus === "paid";
}

export function getActualitesPostActivityTime(post: Pick<SocialFeedPost, "createdAt" | "publishedAt" | "repost">) {
  const candidates = [
    post.repost?.createdAt,
    post.publishedAt,
    post.createdAt,
  ];

  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate || "");
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return 0;
}

export function isCurrentOrRepostedActualitesPost(post: SocialFeedPost) {
  if (post.repost || post.activityType === "repost") return true;
  return !INACTIVE_POST_STATUSES.has(normalizeStatus(post.status));
}

export function orderActualitesFeedPosts(posts: SocialFeedPost[], seed = createActualitesFeedOrderSeed()) {
  const visiblePosts = posts.filter(isCurrentOrRepostedActualitesPost);
  const sponsoredPosts = visiblePosts.filter(isActualitesSponsoredPost);
  const firstSponsoredPost = sponsoredPosts
    .slice()
    .sort((a, b) => {
      const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return getActualitesPostActivityTime(b) - getActualitesPostActivityTime(a);
    })[0];

  const firstSponsoredActivityId = firstSponsoredPost?.activityId || null;
  const remainingPosts = visiblePosts.filter((post) => post.activityId !== firstSponsoredActivityId);

  return [
    ...(firstSponsoredPost ? [firstSponsoredPost] : []),
    ...orderRoughlyChronological(remainingPosts, seed),
  ];
}

function orderRoughlyChronological(posts: SocialFeedPost[], seed: string) {
  const blocks = new Map<number, SocialFeedPost[]>();

  for (const post of posts) {
    const block = Math.floor(getActualitesPostActivityTime(post) / BLOCK_WINDOW_MS);
    const current = blocks.get(block) || [];
    current.push(post);
    blocks.set(block, current);
  }

  return [...blocks.entries()]
    .sort(([a], [b]) => b - a)
    .flatMap(([block, blockPosts]) =>
      blockPosts
        .slice()
        .sort((a, b) => seededCompare(`${seed}:${block}`, a.activityId, b.activityId)),
    );
}

function seededCompare(seed: string, left: string, right: string) {
  return seededNumber(`${seed}:${left}`) - seededNumber(`${seed}:${right}`);
}

function seededNumber(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
