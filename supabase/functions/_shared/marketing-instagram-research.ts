/** Public contract shared by the browser, BFF and read-only Meta adapter. */
export type InstagramResearchRequest =
  | { action: "instagram_discover"; hashtags: string[]; usernames: string[]; days: 7 | 30 | 90 }
  | { action: "instagram_comments"; mediaId: string; after?: string };

export type InstagramPost = {
  id: string; caption: string; url: string; timestamp: string | null;
  username: string | null; followers: number | null; likes: number | null;
  comments: number | null; interactions: number | null; engagementRate: number | null;
  source: string; owned: boolean; localEvidence: string;
};
export type InstagramAccount = {
  username: string; name: string; followers: number | null; url: string;
  medianEngagementRate: number | null; sampledPosts: number; measuredPosts: number;
};
export type InstagramComment = { id: string; username: string | null; text: string; likes: number | null; timestamp: string | null };
export type InstagramResearchResult =
  | { kind: "discovery"; observedAt: string; accountUsername: string; days: number;
      accounts: InstagramAccount[]; posts: InstagramPost[];
      warnings: { source: string; code: string }[]; truncatedSources: string[] }
  | { kind: "comments"; observedAt: string; mediaId: string; url: string;
      comments: InstagramComment[]; nextCursor: string | null };

export class InstagramInputError extends Error {
  constructor() { super("instagram_request_invalid"); this.name = "InstagramInputError"; }
}
export const instagramRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
export const instagramText = (value: unknown, max = 2200) => typeof value === "string" ? value.trim().slice(0, max) : "";
export const instagramCount = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
export const instagramId = (value: unknown): value is string => typeof value === "string" && /^\d{5,64}$/.test(value);
export const instagramUsername = (value: unknown): value is string => typeof value === "string" && /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9._]{1,30}$/.test(value);

function sources(value: unknown, prefix: string, max: number, pattern: RegExp): string[] {
  if (!Array.isArray(value) || value.length > max) throw new InstagramInputError();
  const entries = value.map((entry) => {
    if (typeof entry !== "string" || entry.length > 64) throw new InstagramInputError();
    const trimmed = entry.trim();
    const normalized = (trimmed.startsWith(prefix) ? trimmed.slice(1) : trimmed).normalize("NFC").toLowerCase();
    if (!pattern.test(normalized)) throw new InstagramInputError();
    return normalized;
  });
  return [...new Set(entries)];
}

export function parseInstagramResearchRequest(value: unknown): InstagramResearchRequest {
  const row = instagramRecord(value);
  if (row.action === "instagram_comments") {
    if (Object.keys(row).some((key) => !["action", "mediaId", "after"].includes(key)) || !instagramId(row.mediaId)
      || (row.after !== undefined && (typeof row.after !== "string" || !/^[A-Za-z0-9_=-]{1,1024}$/.test(row.after)))) throw new InstagramInputError();
    return { action: row.action, mediaId: row.mediaId, ...(row.after === undefined ? {} : { after: row.after as string }) };
  }
  if (row.action !== "instagram_discover" || Object.keys(row).some((key) => !["action", "hashtags", "usernames", "days"].includes(key))
    || ![7, 30, 90].includes(row.days as number)) throw new InstagramInputError();
  const hashtags = sources(row.hashtags, "#", 3, /^[\p{L}\p{N}_]{1,50}$/u);
  const usernames = sources(row.usernames, "@", 3, /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/);
  return { action: row.action, hashtags, usernames, days: row.days as 7 | 30 | 90 };
}

export function instagramPostUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.instagram.com", "instagram.com"].includes(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash
      || !/^\/(p|reel)\/[A-Za-z0-9_-]{1,100}\/$/.test(url.pathname)) return null;
    return `https://www.instagram.com${url.pathname}`;
  } catch { return null; }
}

export function publicEngagementRate(likes: number | null, comments: number | null, followers: number | null): number | null {
  if (instagramCount(likes) === null || instagramCount(comments) === null || instagramCount(followers) === null || !followers) return null;
  return ((likes! + comments!) / followers) * 100;
}
export function rankInstagramPosts(posts: InstagramPost[], mode: "rate" | "interactions"): InstagramPost[] {
  return [...posts].sort((a, b) => {
    const left = mode === "rate" ? a.engagementRate : a.interactions;
    const right = mode === "rate" ? b.engagementRate : b.interactions;
    return (right ?? -1) - (left ?? -1) || a.id.localeCompare(b.id);
  });
}
export function summarizeInstagramAccount(username: string, name: string, followers: number | null, posts: InstagramPost[]): InstagramAccount {
  const rates = posts.flatMap((post) => post.engagementRate === null ? [] : [post.engagementRate]).sort((a, b) => a - b);
  const middle = Math.floor(rates.length / 2);
  return { username, name, followers, url: `https://www.instagram.com/${username}/`,
    sampledPosts: posts.length, measuredPosts: rates.length,
    medianEngagementRate: rates.length ? (rates.length % 2 ? rates[middle] : (rates[middle - 1] + rates[middle]) / 2) : null };
}

/** A relevance signal, never a claim that a venue's physical location was verified. */
export function instagramLocalEvidence(caption: string, profile: string, hashtag: string): string | null {
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const context = normalize(`${caption} ${profile}`);
  const local = /geneve|geneva|carouge|plainpalais|eaux[ -]?vives|paquis|puplinge|meyrin|vernier|versoix/;
  const topic = /restaur|cuisin|food|brunch|bistro|cafe|gastronom|sorti|cocktail|diner|dinner|dejeun|terrasse|sushi|pizza/;
  if (local.test(context) && topic.test(context)) return "Profil ou légende : Genève et restauration/sorties";
  if (local.test(normalize(hashtag)) && topic.test(normalize(hashtag))) return `Hashtag local : #${hashtag} (lieu à vérifier)`;
  return null;
}

export const INSTAGRAM_REPLY_TOPICS = {
  discovery: "découverte de restaurants", reservation: "réservation", offers: "offres du moment", zero_attente: "zéro attente",
} as const;
export type InstagramReplyTopic = keyof typeof INSTAGRAM_REPLY_TOPICS;
export function buildInstagramReply(username: string, topic: InstagramReplyTopic, mediaId: string): string {
  if (!instagramUsername(username) || !Object.prototype.hasOwnProperty.call(INSTAGRAM_REPLY_TOPICS, topic) || !instagramId(mediaId)) throw new InstagramInputError();
  const messages: Record<InstagramReplyTopic, string> = {
    discovery: "Pour découvrir des restaurants à Genève, vous pouvez explorer TOK et choisir selon vos envies.",
    reservation: "Pour réserver une table à Genève, vous pouvez consulter les restaurants et créneaux proposés sur TOK.",
    offers: "Pour découvrir les offres proposées par les restaurants sur TOK, vous pouvez consulter le site.",
    zero_attente: "Pour préparer votre prochaine pause déjeuner, découvrez la fonctionnalité Zéro attente sur TOK.",
  };
  const url = new URL(topic === "zero_attente" ? "/zero-attente" : topic === "offers" ? "/ventes-flash" : "/recherche", "https://www.thetok.ch");
  url.search = new URLSearchParams({ utm_source: "instagram", utm_medium: "comment", utm_campaign: "geneve_community", utm_content: mediaId }).toString();
  return `@${username} ${messages[topic]} ${url.toString()}`;
}
