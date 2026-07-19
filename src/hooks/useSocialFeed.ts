import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getSupabase } from "@/integrations/supabase/client";
import { getUserFacingErrorMessage } from "@/lib/userFacingErrors";
import { useAuth } from "@/lib/auth-context";
import { createSocialRealtimeManager } from "@/lib/socialRealtime";
import {
  normalizeSocialFeedScope,
  normalizeSocialAudienceSegment,
  normalizeSocialMarketingGoal,
  normalizeSocialPostCta,
  normalizeSocialPostType,
  normalizeSocialReaction,
  normalizeSocialViewerReaction,
  isMissingSocialMarketingSchemaError,
  type SocialFeedComment,
  type SocialFeedMedia,
  type SocialFeedPost,
  type SocialPostDashboardMetrics,
  type SocialFeedScope,
  type SocialAudienceSegment,
  type SocialMarketingGoal,
  type SocialPostCtaType,
  type SocialPostType,
  type SocialReactionCounts,
  type SocialReactionType,
} from "@/lib/socialFeed";
import {
  filterSocialPostsByHiddenFeedback,
  readSocialFeedHiddenFeedback,
  rememberSocialFeedHiddenFeedback,
} from "@/lib/socialFeedVisibility";
import {
  MAX_SOCIAL_MEDIA_UPLOAD_BYTES,
  SOCIAL_MEDIA_MIME_EXTENSIONS,
  assertSafeFileUpload,
  assertSafeSocialMediaSourceFileUpload,
  getSafeUploadExtension,
} from "@/lib/uploadSecurity";
import { optimizeSocialMediaUpload } from "@/lib/media/socialMediaCompression";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";
import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";

const supabase = getSupabase();
const SOCIAL_FEED_BUCKET = "social-post-media";
const MAX_POST_MEDIA = 10;
const RESTAURANT_SOCIAL_POSTS_LIMIT = 50;
const SOCIAL_COMMENTS_LIMIT = 50;
const SOCIAL_INSIGHTS_BASE_SELECT = "id,likes_count,comments_count,reposts_count,shares_count,status,post_type,cta_type,created_at,scheduled_at";
const SOCIAL_INSIGHTS_MARKETING_SELECT = `${SOCIAL_INSIGHTS_BASE_SELECT},campaign_goal,audience_segment`;

let socialMarketingSchemaAvailable: boolean | null = null;

function isTrackingRpcError(error: unknown) {
  const candidate = error as { message?: string; code?: string; details?: string; hint?: string } | null;
  const text = [candidate?.message, candidate?.code, candidate?.details, candidate?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    !text ||
    isMissingRpc(candidate) ||
    text.includes("connexion requise") ||
    text.includes("post introuvable") ||
    text.includes("record_social_feed_event") ||
    text.includes("social_post_promotions") ||
    text.includes("schema cache") ||
    text.includes("permission denied") ||
    text.includes("forbidden")
  );
}

async function recordSocialEventBestEffort({
  postId,
  eventType,
  metadata = {},
}: {
  postId: string;
  eventType: "impression" | "click" | "cta_click" | "reaction" | "comment" | "share" | "save" | "follow" | "repost";
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await (supabase.rpc as any)("record_social_feed_event", {
    p_post_id: postId,
    p_event_type: eventType,
    p_metadata: metadata,
  });

  if (error) {
    if (isTrackingRpcError(error)) {
      console.warn("Social tracking skipped", {
        eventType,
        postId,
        message: error.message,
        code: error.code,
      });
      return null;
    }
    throw error;
  }

  return data as string | null;
}

type SocialFeedRpcRow = {
  activity_id: string;
  activity_type: "post" | "repost";
  post_id: string;
  restaurant_id: string;
  author_id: string;
  body: string;
  status: "draft" | "scheduled" | "published" | "hidden" | "deleted";
  created_at: string;
  updated_at?: string | null;
  published_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
  reposts_count: number | null;
  shares_count: number | null;
  liked_by_me: boolean | null;
  my_reaction?: string | null;
  reaction_counts?: SocialReactionCounts | null;
  followed_by_me: boolean | null;
  reposted_by_me: boolean | null;
  saved_by_me?: boolean | null;
  recommendation_reasons?: unknown;
  score: number | null;
  media: SocialFeedMedia[] | null;
  restaurant: SocialFeedPost["restaurant"] | null;
  repost: SocialFeedPost["repost"];
  post_type?: string | null;
  cta_type?: string | null;
  cta_target_id?: string | null;
  scheduled_at?: string | null;
  pinned_until?: string | null;
  visibility?: "public" | "followers" | "unlisted" | null;
  campaign_goal?: string | null;
  campaign_name?: string | null;
  audience_segment?: string | null;
  offer_code?: string | null;
  utm_campaign?: string | null;
  premium_banner_id?: string | null;
  premium_banner_audience_count?: number | null;
  premium_banner_impressions_per_viewer?: number | null;
  premium_banner_remaining_impressions?: number | null;
};

type CreateSocialPostInput = {
  restaurantId: string;
  body: string;
  files: File[];
  postType?: SocialPostType;
  ctaType?: SocialPostCtaType;
  ctaTargetId?: string | null;
  scheduledAt?: string | null;
  visibility?: "public" | "followers" | "unlisted";
  campaignGoal?: SocialMarketingGoal;
  campaignName?: string | null;
  audienceSegment?: SocialAudienceSegment;
  offerCode?: string | null;
  utmCampaign?: string | null;
};

type SocialPostPromotionRow = {
  post_id?: string | null;
  campaign_id?: string | null;
  status?: string | null;
};

type AdCampaignPaymentRow = {
  id?: string | null;
  status?: string | null;
  payment_status?: string | null;
};

type SponsoredPostState = {
  isSponsored: boolean;
  promotionStatus: string | null;
  promotionPaymentStatus: string | null;
};

type SocialPostMetricsRow = {
  post_id?: string | null;
  impressions_count?: number | null;
  clicks_count?: number | null;
  cta_clicks_count?: number | null;
  reactions_count?: number | null;
  comments_count?: number | null;
  shares_count?: number | null;
  saves_count?: number | null;
  reposts_count?: number | null;
};

type ViewerPostReactionRow = {
  post_id?: string | null;
  reaction_type?: string | null;
};

type ActualitesSearchRpcRow = {
  post_id?: string | null;
  rank?: number | null;
  total_count?: number | null;
};

export type ActualitesSearchPage = {
  posts: SocialFeedPost[];
  totalCount: number;
  nextOffset: number | null;
};

type SetPostReactionInput = {
  post: SocialFeedPost;
  reaction: SocialReactionType | null;
};

type SetCommentReactionInput = {
  comment: SocialFeedComment;
  reaction: SocialReactionType | null;
};

type PreparedSocialPostMediaFile = {
  file: File;
  sourceName: string;
  mediaType: "image" | "video";
};

export type RestaurantActualitesPremiumBannerAudience = {
  hasAccess: boolean;
  planSlug: string | null;
  audienceCount: number;
  impressionsPerViewer: number;
  activeBannerCount: number;
};

export type RestaurantActualitesAccess = {
  hasAccess: boolean;
  planSlug: string | null;
  weeklyPostLimit: number | null;
  weeklyPostsUsed: number;
  remainingWeeklyPosts: number | null;
  unlimitedPosts: boolean;
  weekStartedAt: string | null;
  weekEndsAt: string | null;
};

type SocialFeedFeedbackInput = {
  post: SocialFeedPost;
  feedbackType: "hide_post" | "hide_restaurant" | "not_interested" | "show_more";
  reason?: string;
};

type ModerationTarget = {
  type: "post" | "comment" | "repost" | "report";
  id: string;
  status: string;
  reason?: string;
};

function isMissingRpc(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message || "";
  return error?.code === "42883" || /Could not find the function|schema cache|does not exist/i.test(message);
}

function isDuplicateOpenSocialReport(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string; constraint?: string } | null;
  const text = [candidate?.message, candidate?.details, candidate?.constraint].filter(Boolean).join(" ");

  return candidate?.code === "23505" || text.includes("social_reports_open_unique_idx");
}

function countReactions(counts: SocialReactionCounts) {
  return Object.values(counts).reduce((total, count) => total + Number(count || 0), 0);
}

function normalizeReactionCounts(value: unknown): SocialReactionCounts {
  if (!value || typeof value !== "object") return {};
  const counts: SocialReactionCounts = {};

  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    const reaction = normalizeSocialReaction(key);
    if (reaction) counts[reaction] = Number(count || 0);
  }

  return counts;
}

function parseRecommendationReasons(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("fr-CH");
}

function normalizeSearchText(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("fr-CH")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const COMMERCIAL_DEMO_POST_IDS = [
  "d3e00000-0000-4000-8000-000000000001",
  "d3e00000-0000-4000-8000-000000000002",
  "d3e00000-0000-4000-8000-000000000003",
] as const;

function getCommercialDemoPostDate(snapshot: CommercialDemoSnapshot, index: number) {
  const source = snapshot.events[snapshot.events.length - 1]?.created_at
    || snapshot.order?.created_at
    || snapshot.session.created_at
    || "2026-01-01T12:00:00.000Z";
  const timestamp = new Date(source).getTime();
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.parse("2026-01-01T12:00:00.000Z");
  return new Date(safeTimestamp - index * 3_600_000).toISOString();
}

/**
 * Builds the real Actualites card model exclusively from the isolated demo
 * snapshot. The fixed local post ids deliberately have no database row.
 */
export function buildCommercialDemoSocialPosts(snapshot: CommercialDemoSnapshot): SocialFeedPost[] {
  const restaurant = snapshot.demo_restaurant;
  const availableItems = snapshot.catalog_items.filter((item) => item.is_available);
  const primaryItem = availableItems[0] || null;
  const entries = [
    {
      item: primaryItem,
      body: primaryItem
        ? `${primaryItem.name} est disponible chez ${restaurant.name}. ${primaryItem.description || "Une recette préparée pour la démonstration du parcours de commande."}`
        : `${restaurant.name} présente sa carte de démonstration. ${restaurant.description || "Découvrez le parcours client complet sur TOK."}`,
      postType: "plat" as const,
      ctaType: "order" as const,
      campaignGoal: "orders" as const,
      recommendationReasons: ["Restaurant de démonstration", restaurant.cuisine_type].filter(Boolean) as string[],
    },
    {
      item: availableItems[1] || primaryItem,
      body: availableItems[1] || primaryItem
        ? `À découvrir aujourd’hui chez ${restaurant.name} : ${(availableItems[1] || primaryItem)?.name}. Une offre locale simulée pour tester le parcours sans aucun paiement réel.`
        : `Découvrez les offres locales de ${restaurant.name} dans cet environnement de démonstration isolé.`,
      postType: "promo" as const,
      ctaType: "offer" as const,
      campaignGoal: "offer" as const,
      recommendationReasons: ["Offre du restaurant démo", restaurant.city].filter(Boolean) as string[],
    },
    {
      item: availableItems[2] || primaryItem,
      body: restaurant.supports_reservation
        ? `${restaurant.name} ouvre ses réservations. Choisissez une date et testez le parcours complet de réservation en temps réel.`
        : `${restaurant.name} vous invite à parcourir sa carte et ses services dans l’espace de démonstration.`,
      postType: restaurant.supports_reservation ? "evenement" as const : "annonce" as const,
      ctaType: restaurant.supports_reservation ? "reserve" as const : "menu" as const,
      campaignGoal: restaurant.supports_reservation ? "bookings" as const : "awareness" as const,
      recommendationReasons: [restaurant.city, "Parcours réel TOK"].filter(Boolean) as string[],
    },
  ];

  return entries.map((entry, index): SocialFeedPost => {
    const id = COMMERCIAL_DEMO_POST_IDS[index];
    const publishedAt = getCommercialDemoPostDate(snapshot, index);
    const imageUrl = entry.item?.image_url || restaurant.image_url || null;
    const imageLabel = entry.item?.name || restaurant.name;

    return {
      id,
      activityId: `commercial-demo-activity-${id}`,
      activityType: "post",
      restaurantId: restaurant.id,
      authorId: `commercial-demo-restaurant:${restaurant.id}`,
      body: entry.body,
      status: "published",
      createdAt: publishedAt,
      updatedAt: publishedAt,
      publishedAt,
      likesCount: 0,
      reactionCounts: {},
      myReaction: null,
      commentsCount: 0,
      repostsCount: 0,
      sharesCount: 0,
      likedByMe: false,
      followedByMe: false,
      repostedByMe: false,
      savedByMe: false,
      score: entries.length - index,
      media: imageUrl ? [{
        id: `commercial-demo-media-${index + 1}`,
        postId: id,
        mediaUrl: imageUrl,
        mediaPath: null,
        mediaType: "image",
        sortOrder: 0,
        altText: `${imageLabel} — ${restaurant.name}`,
        metadata: {
          commercial_demo: true,
          image_analysis: {
            alt_text: `${imageLabel} — ${restaurant.name}`,
            seo_title: `${imageLabel} chez ${restaurant.name}`,
            seo_description: entry.body,
          },
        },
      }] : [],
      postType: entry.postType,
      ctaType: entry.ctaType,
      ctaTargetId: entry.item?.id || restaurant.id,
      visibility: "public",
      campaignGoal: entry.campaignGoal,
      campaignName: "Démonstration commerciale",
      isSponsored: false,
      audienceSegment: "local",
      recommendationReasons: entry.recommendationReasons,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        imageUrl: restaurant.image_url || null,
        city: restaurant.city || null,
        cuisineType: restaurant.cuisine_type || null,
      },
      repost: null,
    };
  });
}

function getCommercialDemoCachedPosts(queryClient: QueryClient, snapshot: CommercialDemoSnapshot) {
  const cachedById = new Map<string, SocialFeedPost>();
  const localPostIds = new Set<string>(COMMERCIAL_DEMO_POST_IDS);
  const rememberPages = (data: unknown) => {
    const pages = (data as { pages?: Array<{ posts?: SocialFeedPost[] }> } | undefined)?.pages || [];
    for (const page of pages) {
      for (const post of page.posts || []) {
        if (localPostIds.has(post.id) && post.restaurantId === snapshot.demo_restaurant.id) {
          cachedById.set(post.id, post);
        }
      }
    }
  };

  for (const [, data] of queryClient.getQueriesData({ queryKey: ["social-feed"] })) {
    rememberPages(data);
  }
  for (const [, data] of queryClient.getQueriesData({ queryKey: ["actualites-search"] })) {
    rememberPages(data);
  }
  for (const [, data] of queryClient.getQueriesData({ queryKey: ["social-post-by-id"] })) {
    const post = data as SocialFeedPost | null | undefined;
    if (post && localPostIds.has(post.id) && post.restaurantId === snapshot.demo_restaurant.id) {
      cachedById.set(post.id, post);
    }
  }

  const followedByMe = [...cachedById.values()].some((post) => post.followedByMe);
  return buildCommercialDemoSocialPosts(snapshot).map((post) => {
    const cached = cachedById.get(post.id);
    return cached || { ...post, followedByMe };
  });
}

function filterCommercialDemoPostsByScope(posts: SocialFeedPost[], scope: SocialFeedScope) {
  if (scope === "saved") return posts.filter((post) => post.savedByMe);
  if (scope === "followed") return posts.filter((post) => post.followedByMe);
  if (scope === "offers") return posts.filter((post) => post.postType === "promo" || post.ctaType === "offer");
  return posts;
}

function searchCommercialDemoPosts(posts: SocialFeedPost[], query: string) {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return posts;

  return posts.filter((post) => {
    const searchIndex = normalizeSearchText([
      post.body,
      post.restaurant.name,
      post.restaurant.city,
      post.restaurant.cuisineType,
      post.postType,
      post.ctaType,
      post.media.map((media) => media.altText || "").join(" "),
    ].filter(Boolean).join(" "));
    return tokens.every((token) => searchIndex.includes(token));
  });
}

function hasSponsoredRecommendation(reasons: string[]) {
  return reasons.some((reason) => normalizeSearchText(reason).includes("sponsor"));
}

function updateReactionCounts(
  counts: SocialReactionCounts,
  previousReaction: SocialReactionType | null | undefined,
  nextReaction: SocialReactionType | null,
) {
  const nextCounts: SocialReactionCounts = { ...counts };
  if (previousReaction) nextCounts[previousReaction] = Math.max(0, Number(nextCounts[previousReaction] || 0) - 1);
  if (nextReaction) nextCounts[nextReaction] = Number(nextCounts[nextReaction] || 0) + 1;
  return nextCounts;
}

function mapSocialPost(row: SocialFeedRpcRow): SocialFeedPost {
  const reactionCounts = normalizeReactionCounts(row.reaction_counts);
  const recommendationReasons = parseRecommendationReasons(row.recommendation_reasons);
  const isPremiumBanner = Boolean(row.premium_banner_id);
  const isSponsored = isPremiumBanner || hasSponsoredRecommendation(recommendationReasons);
  return {
    id: row.post_id,
    activityId: row.activity_id,
    activityType: row.activity_type,
    restaurantId: row.restaurant_id,
    authorId: row.author_id,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    publishedAt: row.published_at,
    likesCount: Number(row.likes_count || countReactions(reactionCounts)),
    reactionCounts,
    myReaction: normalizeSocialViewerReaction(row.my_reaction, row.liked_by_me),
    commentsCount: Number(row.comments_count || 0),
    repostsCount: Number(row.reposts_count || 0),
    sharesCount: Number(row.shares_count || 0),
    likedByMe: Boolean(row.liked_by_me),
    followedByMe: Boolean(row.followed_by_me),
    repostedByMe: Boolean(row.reposted_by_me),
    savedByMe: Boolean(row.saved_by_me),
    score: Number(row.score || 0),
    media: row.media || [],
    restaurant: row.restaurant || { id: row.restaurant_id, name: "Restaurant" },
    repost: row.repost || null,
    postType: normalizeSocialPostType(row.post_type),
    ctaType: normalizeSocialPostCta(row.cta_type),
    ctaTargetId: row.cta_target_id || null,
    scheduledAt: row.scheduled_at || null,
    pinnedUntil: row.pinned_until || null,
    visibility: row.visibility || "public",
    campaignGoal: normalizeSocialMarketingGoal(row.campaign_goal),
    campaignName: row.campaign_name || null,
    isSponsored,
    promotionStatus: isSponsored ? "active" : null,
    promotionPaymentStatus: isSponsored ? "paid" : null,
    premiumBannerId: row.premium_banner_id || null,
    premiumBannerAudienceCount: row.premium_banner_audience_count == null ? null : Number(row.premium_banner_audience_count),
    premiumBannerImpressionsPerViewer: row.premium_banner_impressions_per_viewer == null ? null : Number(row.premium_banner_impressions_per_viewer),
    premiumBannerRemainingImpressions: row.premium_banner_remaining_impressions == null ? null : Number(row.premium_banner_remaining_impressions),
    audienceSegment: normalizeSocialAudienceSegment(row.audience_segment),
    offerCode: row.offer_code || null,
    utmCampaign: row.utm_campaign || null,
    recommendationReasons,
  };
}

function mapRestaurantPostRow(row: any): SocialFeedPost {
  const media = Array.isArray(row.social_post_media)
    ? row.social_post_media
        .sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((item: any) => ({
          id: item.id,
          postId: item.post_id,
          mediaUrl: item.media_url,
          mediaPath: item.media_path,
          mediaType: item.media_type,
          sortOrder: Number(item.sort_order || 0),
          altText: item.alt_text,
          metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : null,
        }))
    : [];
  const reactionCounts = normalizeReactionCounts(row.reaction_counts);
  const myReaction = normalizeSocialViewerReaction(row.my_reaction, row.liked_by_me);

  return {
    id: row.id,
    activityId: row.id,
    activityType: "post",
    restaurantId: row.restaurant_id,
    authorId: row.author_id,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    publishedAt: row.published_at,
    likesCount: Number(row.likes_count || countReactions(reactionCounts)),
    reactionCounts,
    myReaction,
    commentsCount: Number(row.comments_count || 0),
    repostsCount: Number(row.reposts_count || 0),
    sharesCount: Number(row.shares_count || 0),
    likedByMe: Boolean(row.liked_by_me) || Boolean(myReaction),
    followedByMe: Boolean(row.followed_by_me),
    repostedByMe: Boolean(row.reposted_by_me),
    savedByMe: Boolean(row.saved_by_me),
    score: 0,
    media,
    restaurant: {
      id: row.restaurants?.id || row.restaurant_id,
      name: row.restaurants?.name || "Restaurant",
      city: row.restaurants?.city || null,
      imageUrl: row.restaurants?.image_url || null,
      cuisineType: row.restaurants?.cuisine_type || null,
    },
    repost: null,
    postType: normalizeSocialPostType(row.post_type),
    ctaType: normalizeSocialPostCta(row.cta_type),
    ctaTargetId: row.cta_target_id || null,
    scheduledAt: row.scheduled_at || null,
    pinnedUntil: row.pinned_until || null,
    visibility: row.visibility || "public",
    campaignGoal: normalizeSocialMarketingGoal(row.campaign_goal),
    campaignName: row.campaign_name || null,
    isSponsored: Boolean(row.is_sponsored),
    promotionStatus: row.promotion_status || null,
    promotionPaymentStatus: row.promotion_payment_status || null,
    audienceSegment: normalizeSocialAudienceSegment(row.audience_segment),
    offerCode: row.offer_code || null,
    utmCampaign: row.utm_campaign || null,
    recommendationReasons: [],
    dashboardMetrics: row.dashboard_metrics || undefined,
  };
}

function invalidateSocialQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["social-feed"] });
  queryClient.invalidateQueries({ queryKey: ["restaurant-social-posts"] });
  queryClient.invalidateQueries({ queryKey: ["social-insights"] });
  queryClient.invalidateQueries({ queryKey: ["social-post-thread"] });
  queryClient.invalidateQueries({ queryKey: ["actualites-search"] });
  queryClient.invalidateQueries({ queryKey: ["social-post-by-id"] });
  queryClient.invalidateQueries({ queryKey: ["social-comments"] });
  queryClient.invalidateQueries({ queryKey: ["admin-social"] });
  queryClient.invalidateQueries({ queryKey: ["admin-actualites-sponsored"] });
  queryClient.invalidateQueries({ queryKey: ["restaurant-actualites-premium-banner-audience"] });
  queryClient.invalidateQueries({ queryKey: ["restaurant-actualites-access"] });
}

function patchSocialPost(queryClient: QueryClient, postId: string, updater: (post: SocialFeedPost) => SocialFeedPost) {
  queryClient.setQueriesData({ queryKey: ["social-feed"] }, (oldData: any) => {
    if (!oldData?.pages) return oldData;
    return {
      ...oldData,
      pages: oldData.pages.map((page: any) => ({
        ...page,
        posts: page.posts.map((post: SocialFeedPost) => post.id === postId ? updater(post) : post),
      })),
    };
  });

  queryClient.setQueriesData({ queryKey: ["restaurant-social-posts"] }, (oldData: any) => {
    if (!Array.isArray(oldData)) return oldData;
    return oldData.map((post: SocialFeedPost) => post.id === postId ? updater(post) : post);
  });

  queryClient.setQueriesData({ queryKey: ["actualites-search"] }, (oldData: any) => {
    if (!oldData?.pages) return oldData;
    return {
      ...oldData,
      pages: oldData.pages.map((page: ActualitesSearchPage) => ({
        ...page,
        posts: page.posts.map((post) => post.id === postId ? updater(post) : post),
      })),
    };
  });

  queryClient.setQueriesData({ queryKey: ["social-post-by-id", postId] }, (oldData: unknown) => {
    if (!oldData || typeof oldData !== "object") return oldData;
    return updater(oldData as SocialFeedPost);
  });
}

function removeSocialPost(queryClient: QueryClient, postId: string) {
  queryClient.setQueriesData({ queryKey: ["social-feed"] }, (oldData: any) => {
    if (!oldData?.pages) return oldData;
    return {
      ...oldData,
      pages: oldData.pages.map((page: any) => ({
        ...page,
        posts: page.posts.filter((post: SocialFeedPost) => post.id !== postId),
      })),
    };
  });

  queryClient.setQueriesData({ queryKey: ["actualites-search"] }, (oldData: any) => {
    if (!oldData?.pages) return oldData;
    return {
      ...oldData,
      pages: oldData.pages.map((page: ActualitesSearchPage) => ({
        ...page,
        posts: page.posts.filter((post) => post.id !== postId),
        totalCount: Math.max(0, page.totalCount - (page.posts.some((post) => post.id === postId) ? 1 : 0)),
      })),
    };
  });
}

function patchSocialComments(
  queryClient: QueryClient,
  postId: string,
  updater: (comments: SocialFeedComment[]) => SocialFeedComment[],
) {
  queryClient.setQueriesData({ queryKey: ["social-comments", postId] }, (oldData: unknown) => (
    Array.isArray(oldData) ? updater(oldData as SocialFeedComment[]) : updater([])
  ));
}

function patchAdminSocialModeration(queryClient: QueryClient, target: ModerationTarget) {
  queryClient.setQueryData(["admin-social"], (oldData: any) => {
    if (!oldData || typeof oldData !== "object") return oldData;

    if (target.type === "post" && Array.isArray(oldData.posts)) {
      return {
        ...oldData,
        posts: oldData.posts.map((post: SocialFeedPost) =>
          post.id === target.id ? { ...post, status: target.status as SocialFeedPost["status"] } : post
        ),
      };
    }

    if (target.type === "report" && Array.isArray(oldData.reports)) {
      const reviewedAt = target.status === "open" ? null : new Date().toISOString();

      return {
        ...oldData,
        reports: oldData.reports.map((report: any) =>
          report.id === target.id
            ? {
                ...report,
                status: target.status,
                reviewed_at: reviewedAt ?? report.reviewed_at,
              }
            : report
        ),
      };
    }

    return oldData;
  });
}

async function replaceReaction(
  table: "social_post_likes" | "social_comment_reactions",
  target: { post_id: string } | { comment_id: string },
  userId: string,
  reaction: SocialReactionType | null,
) {
  let deleteQuery = (supabase.from(table as any) as any).delete().eq("user_id", userId);
  for (const [column, value] of Object.entries(target)) {
    deleteQuery = deleteQuery.eq(column, value);
  }

  const deleteResult = await deleteQuery;
  if (deleteResult.error) throw deleteResult.error;
  if (!reaction) return;

  const insertResult = await (supabase.from(table as any) as any).insert({
    ...target,
    user_id: userId,
    reaction_type: reaction,
  });
  if (insertResult.error) throw insertResult.error;
}

async function getSponsoredStateByPostId(postIds: string[]) {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));
  const stateByPostId = new Map<string, SponsoredPostState>();
  if (uniquePostIds.length === 0) return stateByPostId;

  const { data: promotions, error: promotionsError } = await (supabase.from("social_post_promotions" as any) as any)
    .select("post_id,campaign_id,status")
    .in("post_id", uniquePostIds);

  if (promotionsError) {
    if (!isMissingSocialMarketingSchemaError(promotionsError) && !isMissingRpc(promotionsError)) {
      console.warn("Sponsored post promotion metadata unavailable", promotionsError);
    }
    return stateByPostId;
  }

  const promotionRows = (promotions || []) as SocialPostPromotionRow[];
  const campaignIds = Array.from(new Set(promotionRows.map((promotion) => promotion.campaign_id).filter(Boolean))) as string[];
  if (campaignIds.length === 0) return stateByPostId;

  const { data: campaigns, error: campaignsError } = await (supabase.from("ad_campaigns" as any) as any)
    .select("id,status,payment_status")
    .in("id", campaignIds);

  if (campaignsError) {
    if (!isMissingSocialMarketingSchemaError(campaignsError) && !isMissingRpc(campaignsError)) {
      console.warn("Sponsored campaign payment metadata unavailable", campaignsError);
    }
    return stateByPostId;
  }

  const campaignById = new Map<string, AdCampaignPaymentRow>(
    ((campaigns || []) as AdCampaignPaymentRow[])
      .filter((campaign) => Boolean(campaign.id))
      .map((campaign) => [campaign.id as string, campaign]),
  );

  for (const promotion of promotionRows) {
    const postId = promotion.post_id;
    const campaign = promotion.campaign_id ? campaignById.get(promotion.campaign_id) : null;
    if (!postId) continue;

    const promotionStatus = normalizeStatus(promotion.status);
    const campaignStatus = normalizeStatus(campaign?.status);
    const paymentStatus = normalizeStatus(campaign?.payment_status);
    const isSponsored = promotionStatus === "active" && campaignStatus === "active" && paymentStatus === "paid";
    const current = stateByPostId.get(postId);

    if (!current || isSponsored || (!current.isSponsored && promotionStatus === "active")) {
      stateByPostId.set(postId, {
        isSponsored,
        promotionStatus: promotionStatus || null,
        promotionPaymentStatus: paymentStatus || null,
      });
    }
  }

  return stateByPostId;
}

async function getDashboardMetricsByPostId(postIds: string[]) {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));
  const metricsByPostId = new Map<string, SocialPostDashboardMetrics>();
  if (uniquePostIds.length === 0) return metricsByPostId;

  const { data, error } = await (supabase.from("social_post_metrics_daily" as any) as any)
    .select("post_id,impressions_count,clicks_count,cta_clicks_count,reactions_count,comments_count,shares_count,saves_count,reposts_count")
    .in("post_id", uniquePostIds);

  if (error) {
    if (!/social_post_metrics_daily|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("Dashboard social post metrics unavailable", error);
    }
    return metricsByPostId;
  }

  for (const row of (data || []) as SocialPostMetricsRow[]) {
    const postId = row.post_id;
    if (!postId) continue;
    const current = metricsByPostId.get(postId) || {
      impressions: 0,
      views: 0,
      ctaClicks: 0,
      interactions: 0,
    };

    const views = Number(row.clicks_count || 0);
    const ctaClicks = Number(row.cta_clicks_count || 0);
    current.impressions += Number(row.impressions_count || 0);
    current.views += views;
    current.ctaClicks += ctaClicks;
    current.interactions +=
      Number(row.reactions_count || 0) +
      Number(row.comments_count || 0) +
      Number(row.shares_count || 0) +
      Number(row.saves_count || 0) +
      Number(row.reposts_count || 0) +
      ctaClicks;

    metricsByPostId.set(postId, current);
  }

  return metricsByPostId;
}

async function getViewerPostReactionsByPostId(postIds: string[], viewerId?: string | null) {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));
  const reactionByPostId = new Map<string, SocialReactionType>();
  if (uniquePostIds.length === 0 || !viewerId) return reactionByPostId;

  const { data, error } = await (supabase.from("social_post_likes" as any) as any)
    .select("post_id,reaction_type")
    .eq("user_id", viewerId)
    .in("post_id", uniquePostIds)
    .limit(uniquePostIds.length);

  if (error) {
    if (!/social_post_likes|reaction_type|schema cache|does not exist|permission denied|forbidden/i.test(error.message || "")) {
      console.warn("Viewer social post reactions unavailable", error);
    }
    return reactionByPostId;
  }

  for (const row of (data || []) as ViewerPostReactionRow[]) {
    const postId = row.post_id;
    const reaction = normalizeSocialReaction(row.reaction_type);
    if (postId && reaction) reactionByPostId.set(postId, reaction);
  }

  return reactionByPostId;
}

async function getViewerSocialState(
  postIds: string[],
  restaurantIds: string[],
  viewerId?: string | null,
) {
  const followedRestaurantIds = new Set<string>();
  const repostedPostIds = new Set<string>();
  const savedPostIds = new Set<string>();
  if (!viewerId || postIds.length === 0) {
    return { followedRestaurantIds, repostedPostIds, savedPostIds };
  }

  const [followsResult, repostsResult, savesResult] = await Promise.all([
    restaurantIds.length
      ? (supabase.from("restaurant_follows" as any) as any)
          .select("restaurant_id")
          .eq("user_id", viewerId)
          .in("restaurant_id", Array.from(new Set(restaurantIds)))
      : Promise.resolve({ data: [], error: null }),
    (supabase.from("social_post_reposts" as any) as any)
      .select("post_id")
      .eq("user_id", viewerId)
      .eq("status", "published")
      .in("post_id", postIds),
    (supabase.from("social_post_saves" as any) as any)
      .select("post_id")
      .eq("user_id", viewerId)
      .in("post_id", postIds),
  ]);

  if (!followsResult.error) {
    for (const row of followsResult.data || []) {
      if (row.restaurant_id) followedRestaurantIds.add(String(row.restaurant_id));
    }
  }
  if (!repostsResult.error) {
    for (const row of repostsResult.data || []) {
      if (row.post_id) repostedPostIds.add(String(row.post_id));
    }
  }
  if (!savesResult.error) {
    for (const row of savesResult.data || []) {
      if (row.post_id) savedPostIds.add(String(row.post_id));
    }
  }

  return { followedRestaurantIds, repostedPostIds, savedPostIds };
}

async function loadPublicSocialPostsById(postIds: string[], viewerId?: string | null) {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));
  if (uniquePostIds.length === 0) return [] as SocialFeedPost[];

  const { data, error } = await (supabase.from("social_posts" as any) as any)
    .select("*, restaurants(id,name,image_url,city,cuisine_type), social_post_media(*)")
    .in("id", uniquePostIds)
    .eq("status", "published")
    .eq("visibility", "public")
    .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const restaurantIds = rows.map((row: any) => String(row.restaurant_id || "")).filter(Boolean);
  const [viewerReactionByPostId, viewerState] = await Promise.all([
    getViewerPostReactionsByPostId(uniquePostIds, viewerId),
    getViewerSocialState(uniquePostIds, restaurantIds, viewerId),
  ]);

  const postById = new Map<string, SocialFeedPost>();
  for (const row of rows) {
    const postId = String(row.id || "");
    const restaurantId = String(row.restaurant_id || "");
    const viewerReaction = viewerReactionByPostId.get(postId) || null;
    postById.set(postId, mapRestaurantPostRow({
      ...row,
      my_reaction: viewerReaction,
      liked_by_me: Boolean(viewerReaction),
      followed_by_me: viewerState.followedRestaurantIds.has(restaurantId),
      reposted_by_me: viewerState.repostedPostIds.has(postId),
      saved_by_me: viewerState.savedPostIds.has(postId),
    }));
  }

  return uniquePostIds.flatMap((postId) => {
    const post = postById.get(postId);
    return post ? [post] : [];
  });
}

async function assertRestaurantAccess(restaurantId: string, userId: string) {
  const { data, error } = await (supabase.from("restaurants" as any) as any)
    .select("id")
    .eq("id", restaurantId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Restaurant non autorise.");
}

async function uploadPostMedia(restaurantId: string, postId: string, files: PreparedSocialPostMediaFile[]) {
  for (let index = 0; index < files.length; index += 1) {
    const item = files[index];
    const file = item.file;
    const extension = getSafeUploadExtension(file, SOCIAL_MEDIA_MIME_EXTENSIONS);
    const path = `${restaurantId}/${postId}/${index}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(SOCIAL_FEED_BUCKET).upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
    });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(SOCIAL_FEED_BUCKET).getPublicUrl(path);

    const { error: insertError } = await (supabase.from("social_post_media" as any) as any).insert({
      post_id: postId,
      media_url: data.publicUrl,
      media_path: path,
      media_type: item.mediaType,
      sort_order: index,
      alt_text: item.sourceName,
    });

    if (insertError) throw insertError;
  }
}

function assertSocialPostMediaFiles(files: File[]) {
  if (files.length > MAX_POST_MEDIA) throw new Error(`Maximum ${MAX_POST_MEDIA} medias par post.`);
  for (const file of files) {
    assertSafeSocialMediaSourceFileUpload(file);
  }
}

async function prepareSocialPostMediaFiles(files: File[]) {
  assertSocialPostMediaFiles(files);

  const prepared: PreparedSocialPostMediaFile[] = [];
  for (const sourceFile of files) {
    const file = await optimizeSocialMediaUpload(sourceFile);
    assertSafeFileUpload(file, {
      allowedMimeTypes: SOCIAL_MEDIA_MIME_EXTENSIONS,
      maxBytes: MAX_SOCIAL_MEDIA_UPLOAD_BYTES,
      label: "Media social",
    });
    prepared.push({
      file,
      sourceName: sourceFile.name,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
    });
  }

  return prepared;
}

function validateSocialPostDraft(input: {
  body: string;
  filesCount: number;
  postType: SocialPostType;
  ctaType: SocialPostCtaType;
  scheduledAt?: string | null;
}) {
  const errors: string[] = [];
  if (!input.body || input.body.length < 8) errors.push("Ajoutez un message d'au moins 8 caracteres.");
  if (input.body.length > 2200) errors.push("Le message est limite a 2200 caracteres.");
  if (input.filesCount === 0 && input.postType === "plat") errors.push("Ajoutez une photo ou une video pour un post plat.");
  if (input.ctaType === "offer" && input.postType !== "promo") errors.push("Le CTA offre doit être associe a un post de type promo.");
  if (input.scheduledAt) {
    const date = new Date(input.scheduledAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now() - 60 * 1000) {
      errors.push("La date de programmation doit être dans le futur.");
    }
  }
  return errors;
}

function normalizePremiumBannerAudience(value: unknown): RestaurantActualitesPremiumBannerAudience {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    hasAccess: Boolean(raw.hasAccess),
    planSlug: typeof raw.planSlug === "string" ? raw.planSlug : null,
    audienceCount: Math.max(0, Number(raw.audienceCount || 0)),
    impressionsPerViewer: Math.max(1, Number(raw.impressionsPerViewer || 5)),
    activeBannerCount: Math.max(0, Number(raw.activeBannerCount || 0)),
  };
}

function normalizeActualitesAccess(value: unknown): RestaurantActualitesAccess {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const weeklyPostLimit = raw.weeklyPostLimit == null ? null : Math.max(0, Number(raw.weeklyPostLimit || 0));
  const remainingWeeklyPosts = raw.remainingWeeklyPosts == null
    ? null
    : Math.max(0, Number(raw.remainingWeeklyPosts || 0));

  return {
    hasAccess: Boolean(raw.hasAccess),
    planSlug: typeof raw.planSlug === "string" ? raw.planSlug : null,
    weeklyPostLimit,
    weeklyPostsUsed: Math.max(0, Number(raw.weeklyPostsUsed || 0)),
    remainingWeeklyPosts,
    unlimitedPosts: Boolean(raw.unlimitedPosts),
    weekStartedAt: typeof raw.weekStartedAt === "string" ? raw.weekStartedAt : null,
    weekEndsAt: typeof raw.weekEndsAt === "string" ? raw.weekEndsAt : null,
  };
}

async function getPremiumBannerRows(scope: SocialFeedScope, limit: number) {
  if (typeof (supabase.rpc as any) !== "function" || scope === "saved") return [] as SocialFeedRpcRow[];

  const { data, error } = await (supabase.rpc as any)("get_social_feed_premium_banners", {
    p_limit: Math.max(1, Math.min(1, limit)),
    p_scope: scope,
  });

  if (error) {
    if (!isMissingRpc(error)) {
      console.warn("Actualites premium banner RPC unavailable", error);
    }
    return [] as SocialFeedRpcRow[];
  }

  return Array.isArray(data) ? data as SocialFeedRpcRow[] : [];
}

export function useSocialRealtime(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const manager = createSocialRealtimeManager(supabase);
    return manager.subscribeAll();
  }, [enabled]);
}

export function useInfiniteSocialFeed(scope: SocialFeedScope = "for_you", limit = 20) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  useSocialRealtime(!isCommercialDemoClient);
  const { user } = useAuth();
  const userId = user?.id || null;
  const queryClient = useQueryClient();
  const viewerKey = isCommercialDemoClient
    ? `commercial-demo:${commercialDemoFrame.config.sessionId}`
    : userId;

  return useInfiniteQuery({
    queryKey: ["social-feed", scope, limit, viewerKey],
    queryFn: async ({ pageParam }) => {
      if (isCommercialDemoClient) {
        const posts = filterCommercialDemoPostsByScope(
          getCommercialDemoCachedPosts(queryClient, commercialDemoFrame.snapshot),
          scope,
        );
        return { posts, nextCursor: null };
      }

      const hiddenFeedback = readSocialFeedHiddenFeedback(userId);
      const { data, error } = await (supabase.rpc as any)("get_social_feed_v2", {
        p_limit: limit,
        p_cursor: pageParam || null,
        p_scope: scope,
      });
      if (error && !isMissingRpc(error)) throw error;

      if (error) {
        if (scope === "saved" && !userId) {
          return { posts: [], nextCursor: null };
        }

        let savedPostIds: string[] | null = null;
        if (scope === "saved") {
          const savedResult = await (supabase.from("social_post_saves" as any) as any)
            .select("post_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);

          if (savedResult.error) throw savedResult.error;
          savedPostIds = (savedResult.data || []).map((row: any) => row.post_id).filter(Boolean);
          if (savedPostIds.length === 0) {
            return { posts: [], nextCursor: null };
          }
        }

        let fallbackQuery = (supabase.from("social_posts" as any) as any)
          .select("*, restaurants(id,name,image_url,city,cuisine_type), social_post_media(*)")
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(limit);

        if (savedPostIds) fallbackQuery = fallbackQuery.in("id", savedPostIds);

        const fallbackResult = await fallbackQuery;
        if (fallbackResult.error) throw fallbackResult.error;
        const rows = fallbackResult.data || [];
        return {
          posts: filterSocialPostsByHiddenFeedback(rows.map(mapRestaurantPostRow), hiddenFeedback),
          nextCursor: null,
        };
      }

      const organicRows = Array.isArray(data) ? data as SocialFeedRpcRow[] : [];
      const premiumRows = pageParam ? [] : await getPremiumBannerRows(scope, limit);
      const premiumPostIds = new Set(premiumRows.map((row) => row.post_id));
      const rows = [
        ...premiumRows,
        ...organicRows.filter((row) => !premiumPostIds.has(row.post_id)),
      ];
      const posts = filterSocialPostsByHiddenFeedback(rows.map(mapSocialPost), hiddenFeedback);
      const nextCursor = organicRows.length === limit ? organicRows[organicRows.length - 1]?.created_at || null : null;
      return { posts, nextCursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: isCommercialDemoClient ? Infinity : undefined,
    refetchOnWindowFocus: !isCommercialDemoClient,
  });
}

export function useSearchActualitesPosts(query: string, limit = 20) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const { user } = useAuth();
  const viewerId = user?.id || null;
  const queryClient = useQueryClient();
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit || 20)));
  const viewerKey = isCommercialDemoClient
    ? `commercial-demo:${commercialDemoFrame.config.sessionId}`
    : viewerId;

  return useInfiniteQuery({
    queryKey: ["actualites-search", normalizedQuery, safeLimit, viewerKey],
    queryFn: async ({ pageParam }): Promise<ActualitesSearchPage> => {
      const offset = Math.max(0, Number(pageParam || 0));
      if (isCommercialDemoClient) {
        const matches = searchCommercialDemoPosts(
          getCommercialDemoCachedPosts(queryClient, commercialDemoFrame.snapshot),
          normalizedQuery,
        );
        const posts = matches.slice(offset, offset + safeLimit);
        const nextOffset = offset + posts.length < matches.length ? offset + posts.length : null;
        return { posts, totalCount: matches.length, nextOffset };
      }

      const { data, error } = await (supabase.rpc as any)("search_actualites_posts", {
        p_query: normalizedQuery,
        p_limit: safeLimit,
        p_offset: offset,
      });

      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as ActualitesSearchRpcRow[];
      const postIds = rows.map((row) => String(row.post_id || "")).filter(Boolean);
      const posts = await loadPublicSocialPostsById(postIds, viewerId);
      const totalCount = Math.max(0, Number(rows[0]?.total_count || 0));
      const consumed = rows.length;
      const nextOffset = consumed > 0 && offset + consumed < totalCount
        ? offset + consumed
        : null;

      return { posts, totalCount, nextOffset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: normalizedQuery.length >= 2,
    staleTime: isCommercialDemoClient ? Infinity : undefined,
    refetchOnWindowFocus: !isCommercialDemoClient,
  });
}

export function useSocialPostById(postId?: string | null) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  useSocialRealtime(Boolean(postId) && !isCommercialDemoClient);
  const { user } = useAuth();
  const viewerId = user?.id || null;
  const queryClient = useQueryClient();
  const viewerKey = isCommercialDemoClient
    ? `commercial-demo:${commercialDemoFrame.config.sessionId}`
    : viewerId;

  return useQuery({
    queryKey: ["social-post-by-id", postId, viewerKey],
    queryFn: async () => {
      if (isCommercialDemoClient) {
        return getCommercialDemoCachedPosts(queryClient, commercialDemoFrame.snapshot)
          .find((post) => post.id === postId) || null;
      }
      const posts = await loadPublicSocialPostsById(postId ? [postId] : [], viewerId);
      return posts[0] || null;
    },
    enabled: Boolean(postId),
    staleTime: isCommercialDemoClient ? Infinity : undefined,
    refetchOnWindowFocus: !isCommercialDemoClient,
  });
}

export function useRestaurantSocialPosts(restaurantId?: string | null) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const queryClient = useQueryClient();
  useSocialRealtime(Boolean(restaurantId) && !isCommercialDemo);
  const { user } = useAuth();
  const viewerId = user?.id || null;
  const demoSessionId = isCommercialDemo ? commercialDemoFrame.config.sessionId : null;

  return useQuery({
    queryKey: ["restaurant-social-posts", restaurantId, viewerId, demoSessionId || "live"],
    queryFn: async () => {
      if (isCommercialDemo) {
        const fallback = getCommercialDemoCachedPosts(queryClient, commercialDemoFrame.snapshot);
        return readCommercialDemoToolState<SocialFeedPost[]>(
          commercialDemoFrame.config.sessionId,
          "actualites-posts",
          fallback,
        );
      }

      const { data, error } = await (supabase.from("social_posts" as any) as any)
        .select("*, restaurants(id,name,image_url,city,cuisine_type), social_post_media(*)")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(RESTAURANT_SOCIAL_POSTS_LIMIT);

      if (error) throw error;
      const rows = data || [];
      const postIds = rows.map((row: any) => row.id).filter(Boolean);
      const [sponsoredStateByPostId, dashboardMetricsByPostId, viewerReactionByPostId] = await Promise.all([
        getSponsoredStateByPostId(postIds),
        getDashboardMetricsByPostId(postIds),
        getViewerPostReactionsByPostId(postIds, viewerId),
      ]);

      return rows.map((row: any) => {
        const sponsoredState = sponsoredStateByPostId.get(row.id);
        const dashboardMetrics = dashboardMetricsByPostId.get(row.id);
        const viewerReaction = viewerReactionByPostId.get(row.id) || null;
        return mapRestaurantPostRow({
          ...row,
          is_sponsored: sponsoredState?.isSponsored ?? false,
          promotion_status: sponsoredState?.promotionStatus ?? null,
          promotion_payment_status: sponsoredState?.promotionPaymentStatus ?? null,
          dashboard_metrics: dashboardMetrics,
          my_reaction: viewerReactionByPostId.get(row.id) || null,
          liked_by_me: Boolean(viewerReaction),
        });
      });
    },
    enabled: !!restaurantId,
    staleTime: isCommercialDemo ? Infinity : undefined,
    refetchOnWindowFocus: !isCommercialDemo,
  });
}

export function useRestaurantActualitesPremiumBannerAudience(restaurantId?: string | null) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  return useQuery({
    queryKey: ["restaurant-actualites-premium-banner-audience", restaurantId, isCommercialDemo ? commercialDemoFrame.config.sessionId : "live"],
    queryFn: async () => {
      if (isCommercialDemo) {
        return {
          hasAccess: true,
          planSlug: "elite",
          audienceCount: 1860,
          impressionsPerViewer: 5,
          activeBannerCount: 1,
        } satisfies RestaurantActualitesPremiumBannerAudience;
      }
      const { data, error } = await (supabase.rpc as any)("get_restaurant_actualites_premium_banner_audience", {
        p_restaurant_id: restaurantId,
      });

      if (error && !isMissingRpc(error)) throw error;
      if (error) {
        return {
          hasAccess: false,
          planSlug: null,
          audienceCount: 0,
          impressionsPerViewer: 5,
          activeBannerCount: 0,
        } satisfies RestaurantActualitesPremiumBannerAudience;
      }

      return normalizePremiumBannerAudience(data);
    },
    enabled: !!restaurantId,
  });
}

export function useRestaurantActualitesAccess(restaurantId?: string | null) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  return useQuery({
    queryKey: ["restaurant-actualites-access", restaurantId, isCommercialDemo ? commercialDemoFrame.config.sessionId : "live"],
    queryFn: async () => {
      if (isCommercialDemo) {
        return {
          hasAccess: true,
          planSlug: "elite",
          weeklyPostLimit: null,
          weeklyPostsUsed: 0,
          remainingWeeklyPosts: null,
          unlimitedPosts: true,
          weekStartedAt: null,
          weekEndsAt: null,
        } satisfies RestaurantActualitesAccess;
      }
      const { data, error } = await (supabase.rpc as any)("get_restaurant_actualites_access", {
        p_restaurant_id: restaurantId,
      });

      if (error && !isMissingRpc(error)) throw error;
      if (error) {
        return {
          hasAccess: true,
          planSlug: null,
          weeklyPostLimit: null,
          weeklyPostsUsed: 0,
          remainingWeeklyPosts: null,
          unlimitedPosts: true,
          weekStartedAt: null,
          weekEndsAt: null,
        } satisfies RestaurantActualitesAccess;
      }

      return normalizeActualitesAccess(data);
    },
    enabled: !!restaurantId,
  });
}

export function useCreatePremiumActualitesBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await (supabase.rpc as any)("create_premium_actualites_banner", {
        p_post_id: postId,
      });

      if (error) throw error;
      return data as {
        bannerId?: string;
        audienceCount?: number;
        impressionsPerViewer?: number;
        planSlug?: string | null;
      };
    },
    onSuccess: () => {
      invalidateSocialQueries(queryClient);
    },
  });
}

export function useSocialInsights(restaurantId?: string | null) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const queryClient = useQueryClient();
  useSocialRealtime(Boolean(restaurantId) && !isCommercialDemo);

  return useQuery({
    queryKey: ["social-insights", restaurantId, isCommercialDemo ? commercialDemoFrame.config.sessionId : "live"],
    queryFn: async () => {
      if (isCommercialDemo) {
        const fallback = getCommercialDemoCachedPosts(queryClient, commercialDemoFrame.snapshot);
        const posts = readCommercialDemoToolState<SocialFeedPost[]>(
          commercialDemoFrame.config.sessionId,
          "actualites-posts",
          fallback,
        );
        const publishedCount = posts.filter((post) => post.status === "published").length;
        const scheduledCount = posts.filter((post) => post.status === "scheduled").length;
        const interactions = posts.reduce(
          (total, post) => total + post.likesCount + post.commentsCount + post.repostsCount + post.sharesCount,
          0,
        );
        const impressions = Math.max(2840, posts.length * 1100);
        return {
          postsCount: posts.length,
          publishedCount,
          hiddenCount: 0,
          impressions,
          clicks: Math.max(186, posts.length * 54),
          ctaClicks: Math.max(82, posts.length * 24),
          saves: Math.max(18, posts.length * 6),
          interactions: Math.max(164, interactions),
          engagementRate: Math.round((Math.max(164, interactions) / impressions) * 1000) / 10,
          conversionFocus: 68,
          scheduledCount,
          campaignGoals: { awareness: 1, orders: 1, bookings: 1 },
          recommendations: [
            "Publier le plat du jour avant le service de midi.",
            "Associer un appel à la réservation aux publications les plus vues.",
            "Réutiliser le meilleur visuel OpenAI dans une campagne locale.",
          ],
          campaigns: { orders: 14, reservations: 9, zero_wait: 3 },
        };
      }
      const insightsRpc = await (supabase.rpc as any)("get_restaurant_actualites_insights", {
        p_restaurant_id: restaurantId,
        p_days: 30,
      });

      if (!insightsRpc.error && insightsRpc.data) {
        return insightsRpc.data as {
          postsCount: number;
          publishedCount: number;
          hiddenCount: number;
          impressions: number;
          clicks: number;
          ctaClicks: number;
          saves: number;
          interactions: number;
          engagementRate: number;
          conversionFocus: number;
          scheduledCount: number;
          campaignGoals: Record<string, number>;
          recommendations?: string[];
          campaigns?: Record<string, number>;
        };
      }

      if (insightsRpc.error && !isMissingRpc(insightsRpc.error)) {
        console.warn("Actualités insights RPC unavailable", insightsRpc.error);
      }

      let postsResult = await (supabase.from("social_posts" as any) as any)
        .select(socialMarketingSchemaAvailable === false ? SOCIAL_INSIGHTS_BASE_SELECT : SOCIAL_INSIGHTS_MARKETING_SELECT)
        .eq("restaurant_id", restaurantId);

      if (postsResult.error && isMissingSocialMarketingSchemaError(postsResult.error)) {
        socialMarketingSchemaAvailable = false;
        postsResult = await (supabase.from("social_posts" as any) as any)
          .select(SOCIAL_INSIGHTS_BASE_SELECT)
          .eq("restaurant_id", restaurantId);
      } else if (!postsResult.error) {
        socialMarketingSchemaAvailable = true;
      }

      if (postsResult.error) throw postsResult.error;

      const posts = postsResult.data || [];
      const postIds = posts.map((post: any) => post.id).filter(Boolean);
      const metricsResult = postIds.length
        ? await (supabase.from("social_post_metrics_daily" as any) as any)
            .select("*")
            .in("post_id", postIds)
            .gte("metric_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        : { data: [], error: null };

      if (metricsResult.error && !/social_post_metrics_daily|schema cache|does not exist/i.test(metricsResult.error.message || "")) {
        throw metricsResult.error;
      }

      const metrics = metricsResult.error ? [] : metricsResult.data || [];
      const totals = metrics.reduce(
        (acc: Record<string, number>, row: any) => {
          acc.impressions += Number(row.impressions_count || 0);
          acc.clicks += Number(row.clicks_count || 0);
          acc.ctaClicks += Number(row.cta_clicks_count || 0);
          acc.saves += Number(row.saves_count || 0);
          acc.reactions += Number(row.reactions_count || 0);
          acc.comments += Number(row.comments_count || 0);
          acc.shares += Number(row.shares_count || 0);
          acc.reposts += Number(row.reposts_count || 0);
          return acc;
        },
        { impressions: 0, clicks: 0, ctaClicks: 0, saves: 0, reactions: 0, comments: 0, shares: 0, reposts: 0 },
      );

      const fallbackInteractions = posts.reduce(
        (total: number, post: any) =>
          total +
          Number(post.likes_count || 0) +
          Number(post.comments_count || 0) +
          Number(post.reposts_count || 0) +
          Number(post.shares_count || 0),
        0,
      );
      const measuredInteractions =
        totals.reactions + totals.comments + totals.shares + totals.reposts + totals.saves + totals.ctaClicks;
      const campaignGoals = posts.reduce((acc: Record<string, number>, post: any) => {
        const goal = normalizeSocialMarketingGoal(post.campaign_goal);
        acc[goal] = (acc[goal] || 0) + 1;
        return acc;
      }, {});
      const postsWithCta = posts.filter((post: any) => normalizeSocialPostCta(post.cta_type) !== "none").length;
      const scheduledCount = posts.filter((post: any) => Boolean(post.scheduled_at)).length;
      const conversionFocus = posts.length > 0 ? Math.round((postsWithCta / posts.length) * 100) : 0;
      const recommendations = [
        postsWithCta < Math.ceil(posts.length * 0.6)
          ? "Ajoutez un CTA clair sur les posts qui doivent generer commandes, réservations ou offres."
          : null,
        scheduledCount < Math.ceil(posts.length * 0.4)
          ? "Programmez les actualités avant les pics: 10h30-11h30, 17h30-18h30 ou la veille d'un evenement."
          : null,
        totals.impressions > 0 && totals.ctaClicks === 0
          ? "Les posts sont vus mais ne convertissent pas encore: testez une offre courte ou un bouton Commander."
          : null,
      ].filter(Boolean) as string[];

      return {
        postsCount: posts.length,
        publishedCount: posts.filter((post: any) => post.status === "published").length,
        hiddenCount: posts.filter((post: any) => post.status !== "published").length,
        impressions: totals.impressions,
        clicks: totals.clicks,
        ctaClicks: totals.ctaClicks,
        saves: totals.saves,
        interactions: measuredInteractions || fallbackInteractions,
        engagementRate: totals.impressions > 0 ? Math.round(((measuredInteractions || fallbackInteractions) / totals.impressions) * 1000) / 10 : 0,
        conversionFocus,
        scheduledCount,
        campaignGoals,
        recommendations,
      };
    },
    enabled: !!restaurantId,
  });
}

export function useCreateSocialPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";

  return useMutation({
    mutationFn: async ({
      restaurantId,
      body,
      files,
      postType = "annonce",
      ctaType = "none",
      ctaTargetId = null,
      scheduledAt = null,
      visibility = "public",
      campaignGoal = "awareness",
      campaignName = null,
      audienceSegment = "local",
      offerCode = null,
      utmCampaign = null,
    }: CreateSocialPostInput) => {
      if (!user?.id) throw new Error("Connexion requise.");
      const cleanBody = body.trim();
      const errors = validateSocialPostDraft({
        body: cleanBody,
        filesCount: files.length,
        postType,
        ctaType,
        scheduledAt,
      });
      if (errors.length > 0) throw new Error(errors[0]);
      if (isCommercialDemo && commercialDemoFrame) {
        const id = globalThis.crypto?.randomUUID?.() || `demo-social-post-${Date.now()}`;
        const fallback = getCommercialDemoCachedPosts(queryClient, commercialDemoFrame.snapshot);
        const current = readCommercialDemoToolState<SocialFeedPost[]>(
          commercialDemoFrame.config.sessionId,
          "actualites-posts",
          fallback,
        );
        const template = fallback[0];
        if (!template) throw new Error("Modèle Actualités Démo indisponible.");
        const createdAt = new Date().toISOString();
        const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
        const post: SocialFeedPost = {
          ...template,
          id,
          activityId: `commercial-demo-activity-${id}`,
          body: cleanBody,
          status: scheduledIso ? "scheduled" : "published",
          createdAt,
          updatedAt: createdAt,
          publishedAt: scheduledIso || createdAt,
          postType,
          ctaType,
          ctaTargetId,
          visibility,
          campaignGoal,
          campaignName: campaignName?.trim() || "Démonstration commerciale",
          audienceSegment,
          media: [],
          recommendationReasons: ["Publication créée dans le restaurant Démo actif"],
        };
        writeCommercialDemoToolState(
          commercialDemoFrame.config.sessionId,
          "actualites-posts",
          [post, ...current.filter((item) => item.id !== id)].slice(0, RESTAURANT_SOCIAL_POSTS_LIMIT),
        );
        return id;
      }

      const accessResult = await (supabase.rpc as any)("get_restaurant_actualites_access", {
        p_restaurant_id: restaurantId,
      });

      if (accessResult.error && !isMissingRpc(accessResult.error)) throw accessResult.error;
      if (!accessResult.error) {
        const access = normalizeActualitesAccess(accessResult.data);
        if (!access.hasAccess) {
          throw new Error("Actualités est inclus à partir de TOK Pro.");
        }
        if (!access.unlimitedPosts && access.remainingWeeklyPosts === 0) {
          throw new Error("Quota Pro atteint: 1 post Actualités par semaine.");
        }
      }

      const preparedMediaFiles = await prepareSocialPostMediaFiles(files);
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
      const scheduledIso = scheduledDate && Number.isFinite(scheduledDate.getTime()) ? scheduledDate.toISOString() : null;
      const status = scheduledIso ? "scheduled" : "published";

      const baseInsertPayload = {
        restaurant_id: restaurantId,
        author_id: user.id,
        body: cleanBody,
        status,
        post_type: postType,
        cta_type: ctaType,
        cta_target_id: ctaTargetId,
        scheduled_at: scheduledIso,
        published_at: scheduledIso || new Date().toISOString(),
        visibility,
      };
      const insertPayload = socialMarketingSchemaAvailable === false ? baseInsertPayload : {
        ...baseInsertPayload,
        campaign_goal: campaignGoal,
        campaign_name: campaignName?.trim() || null,
        audience_segment: audienceSegment,
        offer_code: offerCode?.trim() || null,
        utm_campaign: utmCampaign?.trim() || null,
      };

      let { data: post, error } = await (supabase.from("social_posts" as any) as any)
        .insert(insertPayload)
        .select("id")
        .single();

      if (error && isMissingSocialMarketingSchemaError(error)) {
        socialMarketingSchemaAvailable = false;
        const fallback = await (supabase.from("social_posts" as any) as any)
          .insert(baseInsertPayload)
          .select("id")
          .single();
        post = fallback.data;
        error = fallback.error;
      } else if (error && /post_type|cta_type|scheduled_at|visibility|schema cache|column/i.test(error.message || "")) {
        if (scheduledIso) {
          throw new Error("La programmation des actualites n'est pas encore disponible cote serveur.");
        }

        const fallback = await (supabase.from("social_posts" as any) as any)
          .insert({
            restaurant_id: restaurantId,
            author_id: user.id,
            body: cleanBody,
            status: "published",
          })
          .select("id")
          .single();
        post = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      try {
        await uploadPostMedia(restaurantId, post.id, preparedMediaFiles);
      } catch (mediaError) {
        await (supabase.from("social_posts" as any) as any)
          .update({
            status: "deleted",
            hidden_reason: "Echec upload media",
            hidden_by: user.id,
            hidden_at: new Date().toISOString(),
          })
          .eq("id", post.id);
        throw mediaError;
      }
      return post.id as string;
    },
    onSuccess: (_, input) => {
      toast.success(isCommercialDemo
        ? (input.scheduledAt ? "Post programmé dans la démonstration." : "Post publié dans la démonstration.")
        : (input.scheduledAt ? "Post programme." : "Post publie."));
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useSocialPostMutation() {
  return useCreateSocialPost();
}

export function useToggleSocialLike() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");

      await replaceReaction(
        "social_post_likes",
        { post_id: post.id },
        user.id,
        post.myReaction ? null : "like",
      );
    },
    onMutate: async (post) => {
      if (!isCommercialDemoClient) return;
      patchSocialPost(queryClient, post.id, (currentPost) => {
        const reaction = currentPost.myReaction ? null : "like";
        const reactionCounts = updateReactionCounts(currentPost.reactionCounts, currentPost.myReaction, reaction);
        return {
          ...currentPost,
          myReaction: reaction,
          likedByMe: Boolean(reaction),
          reactionCounts,
          likesCount: countReactions(reactionCounts),
        };
      });
    },
    onSuccess: () => {
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useSetSocialPostReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async ({ post, reaction }: SetPostReactionInput) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.rpc as any)("set_social_reaction", {
        p_target_type: "post",
        p_target_id: post.id,
        p_reaction: reaction,
      });

      if (error && !isMissingRpc(error)) throw error;
      if (error) {
        await replaceReaction("social_post_likes", { post_id: post.id }, user.id, reaction);
      }

      await recordSocialEventBestEffort({
        postId: post.id,
        eventType: "reaction",
        metadata: { reaction },
      });
    },
    onMutate: async ({ post, reaction }) => {
      patchSocialPost(queryClient, post.id, (currentPost) => {
        const reactionCounts = updateReactionCounts(currentPost.reactionCounts, currentPost.myReaction, reaction);
        return {
          ...currentPost,
          myReaction: reaction,
          likedByMe: Boolean(reaction),
          reactionCounts,
          likesCount: countReactions(reactionCounts),
        };
      });
    },
    onSuccess: () => {
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => {
      toast.error(getUserFacingErrorMessage(error));
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
  });
}

export function useDeleteSocialPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.from("social_posts" as any) as any)
        .update({
          status: "deleted",
          hidden_reason: "Suppression par l'auteur",
          hidden_by: user.id,
          hidden_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: (_, post) => {
      toast.success("Post supprime.");
      removeSocialPost(queryClient, post.id);
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useToggleRestaurantFollow() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");

      if (post.followedByMe) {
        const { error } = await (supabase.from("restaurant_follows" as any) as any)
          .delete()
          .eq("restaurant_id", post.restaurantId)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase.from("restaurant_follows" as any) as any).upsert(
        {
          restaurant_id: post.restaurantId,
          user_id: user.id,
        },
        { onConflict: "restaurant_id,user_id", ignoreDuplicates: true },
      );
      if (error) throw error;

      await recordSocialEventBestEffort({
        postId: post.id,
        eventType: "follow",
        metadata: { restaurantId: post.restaurantId },
      });
    },
    onMutate: async (post) => {
      if (!isCommercialDemoClient || !commercialDemoFrame) return;
      for (const demoPost of buildCommercialDemoSocialPosts(commercialDemoFrame.snapshot)) {
        patchSocialPost(queryClient, demoPost.id, (currentPost) => ({
          ...currentPost,
          followedByMe: currentPost.restaurantId === post.restaurantId ? !post.followedByMe : currentPost.followedByMe,
        }));
      }
    },
    onSuccess: () => {
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useToggleSocialRepost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");

      if (post.repostedByMe) {
        const { error } = await (supabase.from("social_post_reposts" as any) as any)
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase.from("social_post_reposts" as any) as any).insert({
        post_id: post.id,
        user_id: user.id,
      });
      if (error) throw error;

      await recordSocialEventBestEffort({ postId: post.id, eventType: "repost", metadata: {} });
    },
    onMutate: async (post) => {
      if (!isCommercialDemoClient) return;
      patchSocialPost(queryClient, post.id, (currentPost) => ({
        ...currentPost,
        repostedByMe: !currentPost.repostedByMe,
        repostsCount: Math.max(0, currentPost.repostsCount + (currentPost.repostedByMe ? -1 : 1)),
      }));
    },
    onSuccess: () => {
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useToggleSocialSave() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
      if (isCommercialDemoClient) return !post.savedByMe;
      if (!user?.id) throw new Error("Connexion requise.");

      const { data, error } = await (supabase.rpc as any)("toggle_social_save", {
        p_post_id: post.id,
      });

      if (error && !isMissingRpc(error)) throw error;

      if (error) {
        if (post.savedByMe) {
          const { error: deleteError } = await (supabase.from("social_post_saves" as any) as any)
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", user.id);
          if (deleteError) throw deleteError;
          return false;
        }

        const { error: insertError } = await (supabase.from("social_post_saves" as any) as any).insert({
          post_id: post.id,
          user_id: user.id,
        });
        if (insertError) throw insertError;
        return true;
      }

      const saved = Boolean(data);
      if (saved) {
        await recordSocialEventBestEffort({ postId: post.id, eventType: "save", metadata: {} });
      }
      return saved;
    },
    onMutate: async (post) => {
      patchSocialPost(queryClient, post.id, (currentPost) => ({
        ...currentPost,
        savedByMe: !currentPost.savedByMe,
      }));
    },
    onSuccess: () => {
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => {
      toast.error(getUserFacingErrorMessage(error));
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
  });
}

export function useRecordExternalShare() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async ({ postId, channel = "link" }: { postId: string; channel?: string }) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.from("social_post_external_shares" as any) as any).insert({
        post_id: postId,
        user_id: user.id,
        channel,
      });
      if (error) throw error;

      await recordSocialEventBestEffort({ postId, eventType: "share", metadata: { channel } });
    },
    onMutate: async ({ postId }) => {
      if (!isCommercialDemoClient) return;
      patchSocialPost(queryClient, postId, (post) => ({ ...post, sharesCount: post.sharesCount + 1 }));
    },
    onSuccess: () => {
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useRecordSocialFeedEvent() {
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async ({
      postId,
      eventType,
      metadata = {},
    }: {
      postId: string;
      eventType: "impression" | "click" | "cta_click";
      metadata?: Record<string, unknown>;
    }) => {
      if (isCommercialDemoClient) return null;
      if (!user?.id) return null;
      return recordSocialEventBestEffort({ postId, eventType, metadata });
    },
    onError: (error) => {
      console.warn("Social feed tracking failed", error);
    },
  });
}

export function useSocialFeedFeedback() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async ({ post, feedbackType, reason }: SocialFeedFeedbackInput) => {
      if (isCommercialDemoClient) return feedbackType;
      if (!user?.id) throw new Error("Connexion requise.");

      const payload = {
        user_id: user.id,
        post_id: feedbackType === "hide_restaurant" ? null : post.id,
        restaurant_id: post.restaurantId,
        feedback_type: feedbackType,
        reason: reason || null,
      };

      let cleanupQuery = (supabase.from("social_feed_feedback" as any) as any)
        .delete()
        .eq("user_id", user.id)
        .eq("feedback_type", feedbackType);

      cleanupQuery = feedbackType === "hide_restaurant"
        ? cleanupQuery.eq("restaurant_id", post.restaurantId)
        : cleanupQuery.eq("post_id", post.id);

      const cleanupResult = await cleanupQuery;
      if (cleanupResult.error) throw cleanupResult.error;

      const { error } = await (supabase.from("social_feed_feedback" as any) as any).insert(payload);
      if (error && error.code !== "23505") throw error;

      await recordSocialEventBestEffort({
        postId: post.id,
        eventType: "click",
        metadata: { action: "feed_feedback", feedback_type: feedbackType },
      }).catch((trackingError) => {
        console.warn("Social feedback tracking skipped", trackingError);
      });

      return feedbackType;
    },
    onMutate: async ({ post, feedbackType }) => {
      if (feedbackType === "hide_post" || feedbackType === "hide_restaurant" || feedbackType === "not_interested") {
        if (!isCommercialDemoClient) rememberSocialFeedHiddenFeedback(user?.id, post, feedbackType);
        removeSocialPost(queryClient, post.id);
      }
    },
    onSuccess: (feedbackType, input) => {
      if (feedbackType === "hide_post" || feedbackType === "hide_restaurant" || feedbackType === "not_interested") {
        removeSocialPost(queryClient, input.post.id);
      }
      toast.success(feedbackType === "show_more" ? "Preference prise en compte." : "Le fil s'adapté à votre retour.");
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useSocialComments(postId?: string | null) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  useSocialRealtime(!!postId && !isCommercialDemoClient);
  const { user } = useAuth();
  const viewerKey = isCommercialDemoClient
    ? `commercial-demo:${commercialDemoFrame.config.sessionId}`
    : user?.id;

  return useQuery({
    queryKey: ["social-comments", postId, viewerKey],
    queryFn: async () => {
      if (isCommercialDemoClient) return [] as SocialFeedComment[];
      const { data, error } = await (supabase.from("social_post_comments" as any) as any)
        .select("*")
        .eq("post_id", postId)
        .eq("status", "published")
        .order("created_at", { ascending: true })
        .limit(SOCIAL_COMMENTS_LIMIT);

      if (error) throw error;
      const rows = data || [];
      const commentIds = rows.map((row: any) => row.id).filter(Boolean);
      const userIds = Array.from(new Set(rows.map((row: any) => row.user_id).filter(Boolean)));

      const [reactionResult, profileResult] = await Promise.all([
        commentIds.length
          ? (supabase.from("social_comment_reactions" as any) as any)
              .select("comment_id,user_id,reaction_type")
              .in("comment_id", commentIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? (supabase.from("profiles" as any) as any)
              .select("user_id,full_name,avatar_url")
              .in("user_id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const reactionErrorMessage = reactionResult.error?.message || "";
      const missingReactionSchema = /social_comment_reactions|reaction_type|schema cache|does not exist/i.test(reactionErrorMessage);
      if (reactionResult.error && !missingReactionSchema) throw reactionResult.error;

      const profileNames = new Map<string, string>();
      const profileAvatarUrls = new Map<string, string>();
      for (const profile of profileResult.data || []) {
        if (profile.user_id && profile.full_name) {
          profileNames.set(String(profile.user_id), String(profile.full_name));
        }
        if (profile.user_id && profile.avatar_url) {
          profileAvatarUrls.set(String(profile.user_id), String(profile.avatar_url));
        }
      }

      const countsByComment = new Map<string, SocialReactionCounts>();
      const myReactionByComment = new Map<string, SocialReactionType>();

      for (const reactionRow of missingReactionSchema ? [] : reactionResult.data || []) {
        const commentId = String(reactionRow.comment_id);
        const reaction = normalizeSocialReaction(reactionRow.reaction_type);
        if (!reaction) continue;
        const counts = countsByComment.get(commentId) || {};
        counts[reaction] = (counts[reaction] || 0) + 1;
        countsByComment.set(commentId, counts);
        if (reactionRow.user_id === user?.id) {
          myReactionByComment.set(commentId, reaction);
        }
      }

      return rows.map((row: any): SocialFeedComment => {
        const reactionCounts = countsByComment.get(String(row.id)) || {};
        return {
          id: row.id,
          postId: row.post_id,
          parentCommentId: row.parent_comment_id || null,
          userId: row.user_id,
          body: row.body,
          status: row.status,
          createdAt: row.created_at,
          authorName: profileNames.get(String(row.user_id)) || null,
          authorAvatarUrl: profileAvatarUrls.get(String(row.user_id)) || null,
          reactionsCount: Number(row.reactions_count || countReactions(reactionCounts)),
          reactionCounts,
          myReaction: myReactionByComment.get(String(row.id)) || null,
        };
      });
    },
    enabled: !!postId,
    staleTime: isCommercialDemoClient ? Infinity : undefined,
    refetchOnWindowFocus: !isCommercialDemoClient,
  });
}

export function useSocialPostThread(postId?: string | null) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  useSocialRealtime(!!postId && !isCommercialDemoClient);

  return useQuery({
    queryKey: isCommercialDemoClient
      ? ["social-post-thread", postId, commercialDemoFrame.config.sessionId]
      : ["social-post-thread", postId],
    queryFn: async () => {
      if (isCommercialDemoClient) {
        return {
          post: buildCommercialDemoSocialPosts(commercialDemoFrame.snapshot).find((post) => post.id === postId) || null,
          comments: [],
        };
      }
      const { data, error } = await (supabase.rpc as any)("get_social_post_thread", {
        p_post_id: postId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row || { post: null, comments: [] };
    },
    enabled: !!postId,
    staleTime: isCommercialDemoClient ? Infinity : undefined,
    refetchOnWindowFocus: !isCommercialDemoClient,
  });
}

export function useAddSocialComment(postId: string, parentCommentId?: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async (body: string) => {
      const cleanBody = body.trim();
      if (!cleanBody) throw new Error("Le commentaire est vide.");
      if (isCommercialDemoClient) {
        return {
          id: `commercial-demo-comment-${Date.now()}`,
          postId,
          parentCommentId: parentCommentId || null,
          userId: user?.id || "commercial-demo-client",
          body: cleanBody,
          status: "published",
          createdAt: new Date().toISOString(),
          authorName: "Client démo",
          authorAvatarUrl: null,
          reactionsCount: 0,
          reactionCounts: {},
          myReaction: null,
        } satisfies SocialFeedComment;
      }

      if (!user?.id) throw new Error("Connexion requise.");

      const { error } = await (supabase.from("social_post_comments" as any) as any).insert({
        post_id: postId,
        parent_comment_id: parentCommentId || null,
        user_id: user.id,
        body: cleanBody,
      });
      if (error) throw error;

      await recordSocialEventBestEffort({
        postId,
        eventType: "comment",
        metadata: { parentCommentId: parentCommentId || null },
      });
      return null;
    },
    onSuccess: (comment) => {
      if (isCommercialDemoClient && comment) {
        patchSocialComments(queryClient, postId, (comments) => [...comments, comment]);
        patchSocialPost(queryClient, postId, (post) => ({ ...post, commentsCount: post.commentsCount + 1 }));
        return;
      }
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useSetSocialCommentReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async ({ comment, reaction }: SetCommentReactionInput) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.rpc as any)("set_social_reaction", {
        p_target_type: "comment",
        p_target_id: comment.id,
        p_reaction: reaction,
      });

      if (error && !isMissingRpc(error)) throw error;
      if (error) {
        await replaceReaction(
          "social_comment_reactions",
          { comment_id: comment.id },
          user.id,
          reaction,
        );
      }
    },
    onMutate: async ({ comment, reaction }) => {
      if (!isCommercialDemoClient) return;
      patchSocialComments(queryClient, comment.postId, (comments) => comments.map((current) => {
        if (current.id !== comment.id) return current;
        const reactionCounts = updateReactionCounts(current.reactionCounts, current.myReaction, reaction);
        return {
          ...current,
          myReaction: reaction,
          reactionCounts,
          reactionsCount: countReactions(reactionCounts),
        };
      }));
    },
    onSuccess: () => {
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useDeleteSocialComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async (comment: SocialFeedComment) => {
      if (isCommercialDemoClient) return;
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.from("social_post_comments" as any) as any)
        .update({
          status: "deleted",
          hidden_reason: "Suppression par l'auteur",
          hidden_by: user.id,
          hidden_at: new Date().toISOString(),
        })
        .eq("id", comment.id);
      if (error) throw error;
    },
    onSuccess: (_, comment) => {
      toast.success("Commentaire supprime.");
      if (isCommercialDemoClient) {
        patchSocialComments(queryClient, comment.postId, (comments) => comments.filter((current) => current.id !== comment.id));
        patchSocialPost(queryClient, comment.postId, (post) => ({
          ...post,
          commentsCount: Math.max(0, post.commentsCount - 1),
        }));
        return;
      }
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useReportSocialItem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";

  return useMutation({
    mutationFn: async ({
      targetType,
      targetId,
      reason,
    }: {
      targetType: "post" | "comment" | "repost";
      targetId: string;
      reason: string;
    }): Promise<{ alreadyReported: boolean }> => {
      if (isCommercialDemoClient) return { alreadyReported: false };
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.from("social_reports" as any) as any).insert({
        target_type: targetType,
        target_id: targetId,
        reporter_id: user.id,
        reason,
      });
      if (error) {
        if (isDuplicateOpenSocialReport(error)) return { alreadyReported: true };
        throw error;
      }
      return { alreadyReported: false };
    },
    onSuccess: (result) => {
      toast.success(result.alreadyReported ? "Signalement déjà transmis." : "Signalement transmis.");
      if (!isCommercialDemoClient) invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}

export function useAdminSocialModeration() {
  useSocialRealtime(true);

  return useQuery({
    queryKey: ["admin-social"],
    queryFn: async () => {
      const [posts, reports] = await Promise.all([
        (supabase.from("social_posts" as any) as any)
          .select("*, restaurants(id, name, city), social_post_media(*)")
          .order("created_at", { ascending: false })
          .limit(100),
        (supabase.from("social_reports" as any) as any)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (posts.error) throw posts.error;
      if (reports.error) throw reports.error;

      return {
        posts: (posts.data || []).map(mapRestaurantPostRow),
        reports: reports.data || [],
      };
    },
  });
}

export function useModerateSocialContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, id, status, reason }: ModerationTarget) => {
      const rpcResult = await (supabase.rpc as any)("moderate_social_target", {
        p_target_type: type,
        p_target_id: id,
        p_status: status,
        p_reason: reason || null,
      });

      if (!rpcResult.error) return;
      if (!isMissingRpc(rpcResult.error)) throw rpcResult.error;

      const payload: Record<string, unknown> = { status };

      if (type !== "report" && (status === "hidden" || status === "deleted")) {
        payload.hidden_reason = reason || "Moderation admin";
        payload.hidden_at = new Date().toISOString();
      }

      if (type === "report" && status !== "open") {
        payload.reviewed_at = new Date().toISOString();
      }

      const table =
        type === "post"
          ? "social_posts"
          : type === "comment"
            ? "social_post_comments"
            : type === "repost"
              ? "social_post_reposts"
              : "social_reports";

      const { error } = await (supabase.from(table as any) as any).update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success("Moderation mise à jour.");
      patchAdminSocialModeration(queryClient, variables);
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error(getUserFacingErrorMessage(error)),
  });
}
