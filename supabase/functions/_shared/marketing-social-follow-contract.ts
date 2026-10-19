/** Public, credential-free contract shared by the marketing BFF, Edge and UI. */
export const SOCIAL_PLATFORMS = ["instagram", "facebook"] as const;
export type MarketingSocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const SOCIAL_FOLLOW_STATUSES = ["unknown", "not_followed", "requested", "followed", "ignored"] as const;
export type MarketingSocialFollowStatus = (typeof SOCIAL_FOLLOW_STATUSES)[number];
export const SOCIAL_VERIFICATION_STATUSES = ["needs_review", "verified", "rejected"] as const;
export type MarketingSocialVerificationStatus = (typeof SOCIAL_VERIFICATION_STATUSES)[number];
export const SOCIAL_CRAWL_STATUSES = ["success", "no_profiles", "no_website", "robots_blocked", "error"] as const;
export type MarketingSocialCrawlStatus = (typeof SOCIAL_CRAWL_STATUSES)[number];
export const SOCIAL_COLLECTION_LIMIT = 3;
export const SOCIAL_COLLECTION_BUDGET_MS = 45_000;
export const SOCIAL_SITE_BUDGET_MS = 12_000;

export type MarketingSocialSourceAccount = {
  platform: MarketingSocialPlatform;
  id: string | null;
  label: string;
  profileUrl: string | null;
  configured: boolean;
};

export type MarketingSocialRestaurant = {
  id: string;
  name: string;
  city: string;
  websiteUrl: string | null;
  discoveryStatus: "pending" | "processing" | MarketingSocialCrawlStatus;
};

export type MarketingSocialRestaurantEvidence = {
  id: string;
  name: string;
  city: string;
  sourceUrl: string;
  sourceKind: "website" | "database" | "manual";
  context: string;
};

export type MarketingSocialProfile = {
  id: string;
  platform: MarketingSocialPlatform;
  canonicalKey: string;
  profileUrl: string;
  handle: string;
  followStatus: MarketingSocialFollowStatus;
  verificationStatus: MarketingSocialVerificationStatus;
  sourceAccountId: string | null;
  version: number;
  confirmedAt: string | null;
  confirmedBy: string | null;
  note: string;
  sourceUrl: string;
  sourceKind: "website" | "database" | "manual";
  restaurants: MarketingSocialRestaurantEvidence[];
  restaurantCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type MarketingSocialCollectionProgress = {
  eligibleRestaurants: number;
  totalJobs: number;
  pending: number;
  processing: number;
  completed: number;
  success: number;
  noProfiles: number;
  noWebsite: number;
  robotsBlocked: number;
  errors: number;
  profiles: number;
  hasMore: boolean;
};

export type MarketingSocialFollowList = {
  items: MarketingSocialProfile[];
  total: number;
  counts: Record<MarketingSocialFollowStatus, number>;
  sourceAccounts: MarketingSocialSourceAccount[];
  collection: MarketingSocialCollectionProgress;
};

export type MarketingSocialRestaurantPage = { items: MarketingSocialRestaurant[]; total: number };
export type MarketingSocialCollectResult = {
  processed: number;
  discovered: number;
  deduplicated: number;
  failed: number;
  hasMore: boolean;
  collection: MarketingSocialCollectionProgress;
  results: Array<{ restaurantId: string; status: MarketingSocialCrawlStatus; profilesFound: number }>;
};
export type MarketingSocialAddResult = { profile: MarketingSocialProfile; duplicate: boolean };

export type MarketingSocialFollowRequest =
  | { action: "list"; query: string; platform: MarketingSocialPlatform | "all"; status: MarketingSocialFollowStatus | "all"; limit: number; offset: number }
  | { action: "restaurants"; query: string; limit: number; offset: number }
  | { action: "collect"; limit: number; restaurantId: string | null }
  | { action: "add"; restaurantId: string; profileUrl: string; sourceUrl: string | null; note: string }
  | { action: "record"; profileId: string; followStatus: MarketingSocialFollowStatus; verificationStatus: MarketingSocialVerificationStatus; expectedVersion: number; expectedSourceAccountId: string; confirmedWithTokAccount: boolean; note: string };

export class MarketingSocialInputError extends Error {
  readonly code = "social_follow_invalid_request";
  constructor(message = "Vérifiez les champs de la demande.") {
    super(message);
    this.name = "MarketingSocialInputError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_ID = /^\d{5,32}$/;
const HASH = /^[0-9a-f]{64}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MarketingSocialInputError();
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new MarketingSocialInputError();
}

function text(value: unknown, max: number, fallback?: string): string {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  // eslint-disable-next-line no-control-regex -- Reject non-printable request bytes before storage or rendering.
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new MarketingSocialInputError();
  }
  return value.trim();
}

function integer(value: unknown, min: number, max: number, fallback?: number) {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new MarketingSocialInputError();
  return value;
}

function uuid(value: unknown) {
  const result = text(value, 36);
  if (!UUID.test(result)) throw new MarketingSocialInputError();
  return result.toLowerCase();
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback?: T): T {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !choices.includes(value as T)) throw new MarketingSocialInputError();
  return value as T;
}

function publicLink(value: unknown): string {
  const raw = text(value, 2_048);
  if (!raw || /[\\\s]/.test(raw)) throw new MarketingSocialInputError("Utilisez une URL HTTP ou HTTPS complète.");
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname
      || (parsed.port && !["80", "443"].includes(parsed.port))) throw new Error("invalid_url");
    return parsed.toString();
  } catch {
    throw new MarketingSocialInputError("Utilisez une URL HTTP ou HTTPS complète.");
  }
}

/** Rejects credentials, arbitrary internal operations, URLs to crawl and unknown fields. */
export function parseMarketingSocialFollowRequest(value: unknown): MarketingSocialFollowRequest {
  const input = object(value);
  const action = choice(input.action, ["list", "restaurants", "collect", "add", "record"] as const);
  if (action === "list") {
    fields(input, ["action", "query", "platform", "status", "limit", "offset"]);
    return { action, query: text(input.query, 120, ""), platform: choice(input.platform, [...SOCIAL_PLATFORMS, "all"] as const, "all"),
      status: choice(input.status, [...SOCIAL_FOLLOW_STATUSES, "all"] as const, "all"), limit: integer(input.limit, 1, 50, 20), offset: integer(input.offset, 0, 100_000, 0) };
  }
  if (action === "restaurants") {
    fields(input, ["action", "query", "limit", "offset"]);
    return { action, query: text(input.query, 120, ""), limit: integer(input.limit, 1, 50, 20), offset: integer(input.offset, 0, 100_000, 0) };
  }
  if (action === "collect") {
    fields(input, ["action", "limit", "restaurantId"]);
    return { action, limit: integer(input.limit, 1, SOCIAL_COLLECTION_LIMIT, SOCIAL_COLLECTION_LIMIT),
      restaurantId: input.restaurantId === undefined || input.restaurantId === null ? null : uuid(input.restaurantId) };
  }
  if (action === "add") {
    fields(input, ["action", "restaurantId", "profileUrl", "sourceUrl", "note"]);
    return { action, restaurantId: uuid(input.restaurantId), profileUrl: publicLink(input.profileUrl),
      sourceUrl: input.sourceUrl === undefined || input.sourceUrl === null || input.sourceUrl === "" ? null : publicLink(input.sourceUrl), note: text(input.note, 500, "") };
  }
  fields(input, ["action", "profileId", "followStatus", "verificationStatus", "expectedVersion", "expectedSourceAccountId", "confirmedWithTokAccount", "note"]);
  const followStatus = choice(input.followStatus, SOCIAL_FOLLOW_STATUSES);
  const verificationStatus = choice(input.verificationStatus, SOCIAL_VERIFICATION_STATUSES);
  const expectedSourceAccountId = text(input.expectedSourceAccountId, 32);
  if (!ACCOUNT_ID.test(expectedSourceAccountId)) throw new MarketingSocialInputError("Le compte TOK configuré doit être confirmé.");
  if (input.confirmedWithTokAccount !== undefined && typeof input.confirmedWithTokAccount !== "boolean") throw new MarketingSocialInputError();
  const confirmedWithTokAccount = input.confirmedWithTokAccount === true;
  if ((followStatus === "followed" || followStatus === "requested") && (!confirmedWithTokAccount || verificationStatus !== "verified")) {
    throw new MarketingSocialInputError("Confirmez l’identité du restaurant et le compte TOK utilisé.");
  }
  return { action, profileId: uuid(input.profileId), followStatus, verificationStatus,
    expectedVersion: integer(input.expectedVersion, 0, 2_147_483_646), expectedSourceAccountId,
    confirmedWithTokAccount, note: text(input.note, 500, "") };
}

/** Server-only envelope: the browser parser above always rejects these proofs. */
export function parseMarketingSocialFollowEnvelope(value: unknown) {
  const input = object(value);
  fields(input, ["request", "sessionHash", "csrfHash"]);
  const sessionHash = text(input.sessionHash, 64);
  const csrfHash = text(input.csrfHash, 64);
  if (!HASH.test(sessionHash) || !HASH.test(csrfHash)) throw new MarketingSocialInputError();
  return { request: parseMarketingSocialFollowRequest(input.request), sessionHash, csrfHash };
}

export { parseMarketingSocialFollowRequest as parseSocialFollowRequest, MarketingSocialInputError as SocialFollowInputError };
export type SocialFollowRequest = MarketingSocialFollowRequest;
