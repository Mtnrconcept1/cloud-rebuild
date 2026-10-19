import { z } from "zod";

import { marketingBffRequest } from "@/marketing/marketingBffClient";
import {
  parseMarketingSocialFollowRequest,
  SOCIAL_COLLECTION_LIMIT,
  SOCIAL_CRAWL_STATUSES,
  SOCIAL_FOLLOW_STATUSES,
  SOCIAL_PLATFORMS,
  SOCIAL_VERIFICATION_STATUSES,
} from "../../supabase/functions/_shared/marketing-social-follow-contract";
import type {
  MarketingSocialAddResult,
  MarketingSocialCollectResult,
  MarketingSocialFollowList,
  MarketingSocialFollowRequest,
  MarketingSocialFollowStatus,
  MarketingSocialPlatform,
  MarketingSocialProfile,
  MarketingSocialRestaurantPage,
  MarketingSocialSourceAccount,
} from "../../supabase/functions/_shared/marketing-social-follow-contract";
import { canonicalizeSocialProfileUrl } from "../../supabase/functions/_shared/marketing-social-profile";

const ENDPOINT = "/api/marketing/social-follow";
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const shortText = z.string().max(2_048);
const sourceKind = z.enum(["website", "database", "manual"]);
const collectionSchema = z.object({
  eligibleRestaurants: count,
  totalJobs: count,
  pending: count,
  processing: count,
  completed: count,
  success: count,
  noProfiles: count,
  noWebsite: count,
  robotsBlocked: count,
  errors: count,
  profiles: count,
  hasMore: z.boolean(),
});
const restaurantSchema = z.object({
  id: z.string().uuid(),
  name: shortText,
  city: shortText,
  websiteUrl: shortText.nullable(),
  discoveryStatus: z.enum(["pending", "processing", ...SOCIAL_CRAWL_STATUSES]),
});
const profileSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(SOCIAL_PLATFORMS),
  canonicalKey: shortText,
  profileUrl: shortText,
  handle: shortText,
  followStatus: z.enum(SOCIAL_FOLLOW_STATUSES),
  verificationStatus: z.enum(SOCIAL_VERIFICATION_STATUSES),
  sourceAccountId: shortText.nullable(),
  version: count,
  confirmedAt: shortText.nullable(),
  confirmedBy: shortText.nullable(),
  note: z.string().max(500),
  sourceUrl: shortText,
  sourceKind,
  restaurants: z.array(z.object({
    id: z.string().uuid(),
    name: shortText,
    city: shortText,
    sourceUrl: shortText,
    sourceKind,
    context: shortText,
  })).max(5_000),
  restaurantCount: count,
  firstSeenAt: shortText,
  lastSeenAt: shortText,
});
const listSchema = z.object({
  items: z.array(profileSchema).max(50),
  total: count,
  counts: z.object({ unknown: count, not_followed: count, requested: count, followed: count, ignored: count }),
  sourceAccounts: z.array(z.object({
    platform: z.enum(SOCIAL_PLATFORMS),
    id: shortText.nullable(),
    label: shortText,
    profileUrl: shortText.nullable(),
    configured: z.boolean(),
  })).max(2),
  collection: collectionSchema,
});
const restaurantPageSchema = z.object({ items: z.array(restaurantSchema).max(50), total: count });
const collectSchema = z.object({
  processed: count,
  discovered: count,
  deduplicated: count,
  failed: count,
  hasMore: z.boolean(),
  collection: collectionSchema,
  results: z.array(z.object({
    restaurantId: z.string().uuid(),
    status: z.enum(SOCIAL_CRAWL_STATUSES),
    profilesFound: count,
  })).max(SOCIAL_COLLECTION_LIMIT),
});
const addSchema = z.object({ profile: profileSchema, duplicate: z.boolean() });

export type SocialFollowListInput = Omit<Extract<MarketingSocialFollowRequest, { action: "list" }>, "action">;
export type SocialRestaurantListInput = Omit<Extract<MarketingSocialFollowRequest, { action: "restaurants" }>, "action">;
export type SocialFollowRecordInput = Omit<Extract<MarketingSocialFollowRequest, { action: "record" }>, "action">;
export type SocialFollowAddInput = Omit<Extract<MarketingSocialFollowRequest, { action: "add" }>, "action">;

/** Parsing fails closed: a missing backend response is never turned into an empty queue. */
function parseResponse<T>(schema: z.ZodTypeAny, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("La réponse du suivi social est incomplète. Actualisez les données.");
  return result.data as T;
}

async function request(body: MarketingSocialFollowRequest, signal?: AbortSignal) {
  return marketingBffRequest<unknown>(ENDPOINT, {
    body: parseMarketingSocialFollowRequest(body),
    requireCsrf: true,
    signal,
    // Include the BFF session/admin checks before the bounded Edge request.
    timeoutMs: body.action === "collect" ? 95_000 : 50_000,
  });
}

export async function listSocialFollowProfiles(input: SocialFollowListInput, signal?: AbortSignal): Promise<MarketingSocialFollowList> {
  return parseResponse(listSchema, await request({ action: "list", ...input }, signal));
}

export async function listSocialFollowRestaurants(input: SocialRestaurantListInput, signal?: AbortSignal): Promise<MarketingSocialRestaurantPage> {
  return parseResponse(restaurantPageSchema, await request({ action: "restaurants", ...input }, signal));
}

export async function collectSocialFollowProfiles(restaurantId: string | null, signal?: AbortSignal): Promise<MarketingSocialCollectResult> {
  return parseResponse(collectSchema, await request({ action: "collect", limit: SOCIAL_COLLECTION_LIMIT, restaurantId }, signal));
}

export async function recordSocialFollow(input: SocialFollowRecordInput): Promise<MarketingSocialProfile> {
  return parseResponse(profileSchema, await request({ action: "record", ...input }));
}

export async function addSocialFollowProfile(input: SocialFollowAddInput): Promise<MarketingSocialAddResult> {
  const profile = canonicalizeSocialProfileUrl(input.profileUrl);
  if (!profile) throw new Error("Utilisez une URL de profil Instagram ou de page Facebook, sans publication ni lien de partage.");
  return parseResponse(addSchema, await request({ action: "add", ...input, profileUrl: profile.url }));
}

/** This only validates the destination; it does not check the restaurant's identity or follow state. */
export function socialProfileHref(value: unknown, platform?: MarketingSocialPlatform): string | null {
  return canonicalizeSocialProfileUrl(value, platform)?.url ?? null;
}

/** Evidence is opened by the person, never fetched by the browser application. */
export function socialSourceHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048 || /\s/.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || (url.port && !["80", "443"].includes(url.port))) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function socialFollowStatusForAccount(
  profile: MarketingSocialProfile,
  account: MarketingSocialSourceAccount | undefined,
): MarketingSocialFollowStatus {
  return account?.configured && account.id && profile.sourceAccountId === account.id ? profile.followStatus : "unknown";
}

export function socialFollowErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Le service de suivi social est indisponible.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 240);
}
