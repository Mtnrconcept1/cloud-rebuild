import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createSocialRealtimeManager } from "@/lib/socialRealtime";
import {
  normalizeSocialFeedScope,
  normalizeSocialAudienceSegment,
  normalizeSocialMarketingGoal,
  normalizeSocialPostCta,
  normalizeSocialPostType,
  normalizeSocialReaction,
  isMissingSocialMarketingSchemaError,
  validateSocialPostDraft,
  type SocialFeedComment,
  type SocialFeedMedia,
  type SocialFeedPost,
  type SocialFeedScope,
  type SocialAudienceSegment,
  type SocialMarketingGoal,
  type SocialPostCtaType,
  type SocialPostType,
  type SocialReactionCounts,
  type SocialReactionType,
} from "@/lib/socialFeed";

const supabase = getSupabase();
const SOCIAL_FEED_BUCKET = "social-post-media";
const MAX_POST_MEDIA = 10;
const SOCIAL_INSIGHTS_BASE_SELECT = "id,likes_count,comments_count,reposts_count,shares_count,status,post_type,cta_type,created_at,scheduled_at";
const SOCIAL_INSIGHTS_MARKETING_SELECT = `${SOCIAL_INSIGHTS_BASE_SELECT},campaign_goal,audience_segment`;

let socialMarketingSchemaAvailable: boolean | null = null;

type SocialFeedRpcRow = {
  activity_id: string;
  activity_type: "post" | "repost";
  post_id: string;
  restaurant_id: string;
  author_id: string;
  body: string;
  status: "draft" | "scheduled" | "published" | "hidden" | "deleted";
  created_at: string;
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

type SocialFeedPage = {
  posts: SocialFeedPost[];
  nextCursor: string | null;
};

type SocialFeedFeedbackInput = {
  post: SocialFeedPost;
  feedbackType: "hide_post" | "hide_restaurant" | "not_interested" | "show_more";
  reason?: string;
};

type ModerationTarget = {
  type: "post" | "comment" | "repost" | "report";
  id: string;
  status: "published" | "hidden" | "deleted" | "open" | "reviewed" | "dismissed" | "resolved";
  reason?: string;
};

type SetPostReactionInput = {
  post: SocialFeedPost;
  reaction: SocialReactionType | null;
};

type SetCommentReactionInput = {
  comment: SocialFeedComment;
  reaction: SocialReactionType | null;
};

export function invalidateSocialQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["social-feed"] });
  void queryClient.invalidateQueries({ queryKey: ["social-feed-v2"] });
  void queryClient.invalidateQueries({ queryKey: ["restaurant-social-posts"] });
  void queryClient.invalidateQueries({ queryKey: ["social-comments"] });
  void queryClient.invalidateQueries({ queryKey: ["social-insights"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-social"] });
}

const socialRealtimeManager = createSocialRealtimeManager<QueryClient>({
  client: supabase as any,
  onInvalidate: invalidateSocialQueries,
});

function isMissingRpc(error: unknown) {
  const message = String((error as { message?: string })?.message || error || "");
  return /function .* does not exist|could not find the function|schema cache|PGRST202/i.test(message);
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function updateReactionCounts(
  counts: SocialReactionCounts,
  currentReaction: SocialReactionType | null,
  nextReaction: SocialReactionType | null,
) {
  const updated: SocialReactionCounts = { ...counts };

  if (currentReaction && currentReaction !== nextReaction) {
    updated[currentReaction] = Math.max(0, Number(updated[currentReaction] || 0) - 1);
  }

  if (nextReaction && nextReaction !== currentReaction) {
    updated[nextReaction] = Math.max(0, Number(updated[nextReaction] || 0) + 1);
  }

  return updated;
}

function mapPostsInUnknownData(data: unknown, postId: string, updater: (post: SocialFeedPost) => SocialFeedPost): unknown {
  if (Array.isArray(data)) {
    return data.map((post) => (post?.id === postId ? updater(post) : post));
  }

  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown[] }).pages)) {
    const infiniteData = data as { pages: SocialFeedPage[]; pageParams: unknown[] };
    return {
      ...infiniteData,
      pages: infiniteData.pages.map((page) => ({
        ...page,
        posts: page.posts.map((post) => (post.id === postId ? updater(post) : post)),
      })),
    };
  }

  return data;
}

function removePostFromUnknownData(data: unknown, postId: string): unknown {
  if (Array.isArray(data)) {
    return data.filter((post) => post?.id !== postId);
  }

  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown[] }).pages)) {
    const infiniteData = data as { pages: SocialFeedPage[]; pageParams: unknown[] };
    return {
      ...infiniteData,
      pages: infiniteData.pages.map((page) => ({
        ...page,
        posts: page.posts.filter((post) => post.id !== postId),
      })),
    };
  }

  return data;
}

function patchSocialPost(queryClient: QueryClient, postId: string, updater: (post: SocialFeedPost) => SocialFeedPost) {
  queryClient.setQueriesData({ queryKey: ["social-feed"] }, (data) => mapPostsInUnknownData(data, postId, updater));
  queryClient.setQueriesData({ queryKey: ["social-feed-v2"] }, (data) => mapPostsInUnknownData(data, postId, updater));
  queryClient.setQueriesData({ queryKey: ["restaurant-social-posts"] }, (data) => mapPostsInUnknownData(data, postId, updater));
}

function removeSocialPost(queryClient: QueryClient, postId: string) {
  queryClient.setQueriesData({ queryKey: ["social-feed"] }, (data) => removePostFromUnknownData(data, postId));
  queryClient.setQueriesData({ queryKey: ["social-feed-v2"] }, (data) => removePostFromUnknownData(data, postId));
}

function normalizeReactionCounts(value: unknown): SocialReactionCounts {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value as Record<string, unknown>).reduce<SocialReactionCounts>((counts, [key, count]) => {
    const reaction = normalizeSocialReaction(key);
    if (!reaction) return counts;
    counts[reaction] = Math.max(0, Number(count || 0));
    return counts;
  }, {});
}

function countReactions(counts: SocialReactionCounts) {
  return Object.values(counts).reduce((total, count) => total + Math.max(0, Number(count || 0)), 0);
}

function mapMedia(row: any): SocialFeedMedia {
  return {
    id: String(row.id),
    postId: String(row.postId || row.post_id),
    mediaUrl: String(row.mediaUrl || row.media_url),
    mediaPath: row.mediaPath || row.media_path || null,
    mediaType: row.mediaType || row.media_type || "image",
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    altText: row.altText || row.alt_text || null,
  };
}

function mapFeedRow(row: SocialFeedRpcRow): SocialFeedPost {
  return {
    id: row.post_id,
    activityId: row.activity_id,
    activityType: row.activity_type,
    restaurantId: row.restaurant_id,
    authorId: row.author_id,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    likesCount: Number(row.likes_count || 0),
    reactionCounts: normalizeReactionCounts(row.reaction_counts),
    myReaction: normalizeSocialReaction(row.my_reaction),
    commentsCount: Number(row.comments_count || 0),
    repostsCount: Number(row.reposts_count || 0),
    sharesCount: Number(row.shares_count || 0),
    likedByMe: Boolean(row.liked_by_me || row.my_reaction),
    followedByMe: Boolean(row.followed_by_me),
    repostedByMe: Boolean(row.reposted_by_me),
    savedByMe: Boolean(row.saved_by_me),
    score: Number(row.score || 0),
    media: Array.isArray(row.media) ? row.media.map(mapMedia) : [],
    postType: normalizeSocialPostType(row.post_type),
    ctaType: normalizeSocialPostCta(row.cta_type),
    ctaTargetId: row.cta_target_id || null,
    scheduledAt: row.scheduled_at || null,
    pinnedUntil: row.pinned_until || null,
    visibility: row.visibility || "public",
    campaignGoal: normalizeSocialMarketingGoal(row.campaign_goal),
    campaignName: row.campaign_name || null,
    audienceSegment: normalizeSocialAudienceSegment(row.audience_segment),
    offerCode: row.offer_code || null,
    utmCampaign: row.utm_campaign || null,
    recommendationReasons: parseStringArray(row.recommendation_reasons),
    restaurant: {
      id: row.restaurant?.id || row.restaurant_id,
      name: row.restaurant?.name || "Restaurant",
      imageUrl: row.restaurant?.imageUrl || null,
      city: row.restaurant?.city || null,
      cuisineType: row.restaurant?.cuisineType || null,
    },
    repost: row.repost || null,
  };
}

function mapRestaurantPostRow(row: any): SocialFeedPost {
  const restaurant = row.restaurants || {};
  return {
    id: String(row.id),
    activityId: String(row.id),
    activityType: "post",
    restaurantId: String(row.restaurant_id),
    authorId: String(row.author_id),
    body: String(row.body || ""),
    status: row.status || "published",
    createdAt: row.created_at,
    publishedAt: row.published_at || null,
    likesCount: Number(row.likes_count || 0),
    reactionCounts: {},
    myReaction: null,
    commentsCount: Number(row.comments_count || 0),
    repostsCount: Number(row.reposts_count || 0),
    sharesCount: Number(row.shares_count || 0),
    likedByMe: false,
    followedByMe: false,
    repostedByMe: false,
    savedByMe: false,
    score: 0,
    media: Array.isArray(row.social_post_media) ? row.social_post_media.map(mapMedia) : [],
    postType: normalizeSocialPostType(row.post_type),
    ctaType: normalizeSocialPostCta(row.cta_type),
    ctaTargetId: row.cta_target_id || null,
    scheduledAt: row.scheduled_at || null,
    pinnedUntil: row.pinned_until || null,
    visibility: row.visibility || "public",
    campaignGoal: normalizeSocialMarketingGoal(row.campaign_goal),
    campaignName: row.campaign_name || null,
    audienceSegment: normalizeSocialAudienceSegment(row.audience_segment),
    offerCode: row.offer_code || null,
    utmCampaign: row.utm_campaign || null,
    recommendationReasons: [],
    restaurant: {
      id: row.restaurant_id,
      name: restaurant.name || "Restaurant",
      imageUrl: restaurant.image_url || null,
      city: restaurant.city || null,
      cuisineType: restaurant.cuisine_type || null,
    },
    repost: null,
  };
}

async function replaceReaction(
  table: "social_post_likes" | "social_comment_reactions",
  keys: { post_id: string } | { comment_id: string },
  userId: string,
  nextReaction: SocialReactionType | null,
  currentReaction: SocialReactionType | null,
) {
  let query = (supabase.from(table as any) as any).delete().eq("user_id", userId);
  for (const [key, value] of Object.entries(keys)) {
    query = query.eq(key, value);
  }

  if (currentReaction || nextReaction) {
    const { error: deleteError } = await query;
    if (deleteError) throw deleteError;
  }

  if (!nextReaction || nextReaction === currentReaction) return;

  const insertPayload = {
    ...keys,
    user_id: userId,
    reaction_type: nextReaction,
  };

  const { error: insertError } = await (supabase.from(table as any) as any).insert(insertPayload);
  if (insertError) throw insertError;
}

function sanitizeFileName(fileName: string) {
  const safe = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return safe || "media";
}

function getMediaType(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

function assertMediaFiles(files: File[]) {
  if (files.length > MAX_POST_MEDIA) {
    throw new Error(`Maximum ${MAX_POST_MEDIA} medias par post.`);
  }

  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      throw new Error("Seuls les fichiers image et video sont acceptes.");
    }
  }
}

async function uploadPostMedia(restaurantId: string, postId: string, files: File[]) {
  assertMediaFiles(files);

  const mediaRows = [];

  for (const [index, file] of files.entries()) {
    const path = `${restaurantId}/${postId}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(SOCIAL_FEED_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage.from(SOCIAL_FEED_BUCKET).getPublicUrl(path);
    mediaRows.push({
      post_id: postId,
      media_url: publicUrl.publicUrl,
      media_path: path,
      media_type: getMediaType(file),
      sort_order: index,
      alt_text: file.name,
      metadata: { size: file.size, type: file.type },
    });
  }

  if (mediaRows.length === 0) return;

  const { error } = await (supabase.from("social_post_media" as any) as any).insert(mediaRows);
  if (error) throw error;
}

export function useSocialRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!enabled || !user?.id) return;

    return socialRealtimeManager.retain(user.id, queryClient);
  }, [enabled, queryClient, user?.id]);
}

export function useSocialFeed(limit = 30) {
  const { user } = useAuth();
  useSocialRealtime(!!user?.id);

  return useQuery({
    queryKey: ["social-feed", user?.id, limit],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_social_feed", {
        p_limit: limit,
        p_cursor: null,
      });

      if (error) throw error;
      return ((data || []) as SocialFeedRpcRow[]).map(mapFeedRow);
    },
    enabled: !!user?.id,
  });
}

export function useInfiniteSocialFeed(scope: SocialFeedScope | string = "for_you", limit = 12) {
  const { user } = useAuth();
  const normalizedScope = normalizeSocialFeedScope(scope);
  useSocialRealtime(!!user?.id);

  return useInfiniteQuery({
    queryKey: ["social-feed-v2", user?.id, normalizedScope, limit],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const v2Result = await (supabase.rpc as any)("get_social_feed_v2", {
        p_limit: limit,
        p_cursor: pageParam,
        p_scope: normalizedScope,
      });

      if (v2Result.error && !isMissingRpc(v2Result.error)) throw v2Result.error;

      const result = v2Result.error
        ? await (supabase.rpc as any)("get_social_feed", {
            p_limit: limit,
            p_cursor: pageParam,
          })
        : v2Result;

      if (result.error) throw result.error;

      const posts = ((result.data || []) as SocialFeedRpcRow[]).map(mapFeedRow);
      const lastPost = posts.at(-1);

      return {
        posts,
        nextCursor: posts.length >= limit ? lastPost?.createdAt || null : null,
      } satisfies SocialFeedPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!user?.id,
  });
}

export function useRestaurantSocialPosts(restaurantId?: string | null) {
  useSocialRealtime(!!restaurantId);

  return useQuery({
    queryKey: ["restaurant-social-posts", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("social_posts" as any) as any)
        .select("*, social_post_media(*), restaurants(id, name, image_url, city, cuisine_type)")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map(mapRestaurantPostRow);
    },
    enabled: !!restaurantId,
  });
}

export function useSocialInsights(restaurantId?: string | null) {
  useSocialRealtime(!!restaurantId);

  return useQuery({
    queryKey: ["social-insights", restaurantId],
    queryFn: async () => {
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
          ? "Ajoutez un CTA clair sur les posts qui doivent generer commandes, reservations ou offres."
          : null,
        scheduledCount < Math.ceil(posts.length * 0.4)
          ? "Programmez les actualites avant les pics: 10h30-11h30, 17h30-18h30 ou la veille d'un evenement."
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
      assertMediaFiles(files);

      const cleanBody = body.trim();
      const errors = validateSocialPostDraft({
        body: cleanBody,
        filesCount: files.length,
        postType,
        ctaType,
        scheduledAt,
      });
      if (errors.length > 0) throw new Error(errors[0]);

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
      await uploadPostMedia(restaurantId, post.id, files);
      return post.id as string;
    },
    onSuccess: (_, input) => {
      toast.success(input.scheduledAt ? "Post programme." : "Post publie.");
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useSocialPostMutation() {
  return useCreateSocialPost();
}

export function useToggleSocialLike() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
      if (!user?.id) throw new Error("Connexion requise.");

      await replaceReaction(
        "social_post_likes",
        { post_id: post.id },
        user.id,
        post.myReaction ? null : "like",
        post.myReaction,
      );
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useSetSocialPostReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ post, reaction }: SetPostReactionInput) => {
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.rpc as any)("set_social_reaction", {
        p_target_type: "post",
        p_target_id: post.id,
        p_reaction: reaction,
      });

      if (error && !isMissingRpc(error)) throw error;
      if (error) {
        await replaceReaction("social_post_likes", { post_id: post.id }, user.id, reaction, post.myReaction);
      }

      const eventResult = await (supabase.rpc as any)("record_social_feed_event", {
        p_post_id: post.id,
        p_event_type: "reaction",
        p_metadata: { reaction },
      });
      if (eventResult.error && !isMissingRpc(eventResult.error)) throw eventResult.error;
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
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => {
      toast.error((error as Error).message);
      invalidateSocialQueries(queryClient);
    },
  });
}

export function useDeleteSocialPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
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
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useToggleRestaurantFollow() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
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

      const eventResult = await (supabase.rpc as any)("record_social_feed_event", {
        p_post_id: post.id,
        p_event_type: "follow",
        p_metadata: { restaurantId: post.restaurantId },
      });
      if (eventResult.error && !isMissingRpc(eventResult.error)) throw eventResult.error;
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useToggleSocialRepost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
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

      const eventResult = await (supabase.rpc as any)("record_social_feed_event", {
        p_post_id: post.id,
        p_event_type: "repost",
        p_metadata: {},
      });
      if (eventResult.error && !isMissingRpc(eventResult.error)) throw eventResult.error;
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useToggleSocialSave() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
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
        const eventResult = await (supabase.rpc as any)("record_social_feed_event", {
          p_post_id: post.id,
          p_event_type: "save",
          p_metadata: {},
        });
        if (eventResult.error && !isMissingRpc(eventResult.error)) throw eventResult.error;
      }
      return saved;
    },
    onMutate: async (post) => {
      patchSocialPost(queryClient, post.id, (currentPost) => ({
        ...currentPost,
        savedByMe: !currentPost.savedByMe,
      }));
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => {
      toast.error((error as Error).message);
      invalidateSocialQueries(queryClient);
    },
  });
}

export function useRecordExternalShare() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, channel = "link" }: { postId: string; channel?: string }) => {
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.from("social_post_external_shares" as any) as any).insert({
        post_id: postId,
        user_id: user.id,
        channel,
      });
      if (error) throw error;

      const eventResult = await (supabase.rpc as any)("record_social_feed_event", {
        p_post_id: postId,
        p_event_type: "share",
        p_metadata: { channel },
      });
      if (eventResult.error && !isMissingRpc(eventResult.error)) throw eventResult.error;
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useRecordSocialFeedEvent() {
  const { user } = useAuth();

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
      if (!user?.id) return null;
      const { data, error } = await (supabase.rpc as any)("record_social_feed_event", {
        p_post_id: postId,
        p_event_type: eventType,
        p_metadata: metadata,
      });
      if (error && !isMissingRpc(error)) throw error;
      return data as string | null;
    },
  });
}

export function useSocialFeedFeedback() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ post, feedbackType, reason }: SocialFeedFeedbackInput) => {
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
      return feedbackType;
    },
    onMutate: async ({ post, feedbackType }) => {
      if (feedbackType === "hide_post" || feedbackType === "hide_restaurant" || feedbackType === "not_interested") {
        removeSocialPost(queryClient, post.id);
      }
    },
    onSuccess: (feedbackType, input) => {
      if (feedbackType === "hide_post" || feedbackType === "hide_restaurant" || feedbackType === "not_interested") {
        removeSocialPost(queryClient, input.post.id);
      }
      toast.success(feedbackType === "show_more" ? "Preference prise en compte." : "Le fil s'adapte a votre retour.");
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useSocialComments(postId?: string | null) {
  useSocialRealtime(!!postId);
  const { user } = useAuth();

  return useQuery({
    queryKey: ["social-comments", postId, user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("social_post_comments" as any) as any)
        .select("*")
        .eq("post_id", postId)
        .eq("status", "published")
        .order("created_at", { ascending: true });

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
              .select("user_id,full_name")
              .in("user_id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const reactionErrorMessage = reactionResult.error?.message || "";
      const missingReactionSchema = /social_comment_reactions|reaction_type|schema cache|does not exist/i.test(reactionErrorMessage);
      if (reactionResult.error && !missingReactionSchema) throw reactionResult.error;

      const profileNames = new Map<string, string>();
      for (const profile of profileResult.data || []) {
        if (profile.user_id && profile.full_name) {
          profileNames.set(String(profile.user_id), String(profile.full_name));
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
          reactionsCount: Number(row.reactions_count || countReactions(reactionCounts)),
          reactionCounts,
          myReaction: myReactionByComment.get(String(row.id)) || null,
        };
      });
    },
    enabled: !!postId,
  });
}

export function useSocialPostThread(postId?: string | null) {
  useSocialRealtime(!!postId);

  return useQuery({
    queryKey: ["social-post-thread", postId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_social_post_thread", {
        p_post_id: postId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row || { post: null, comments: [] };
    },
    enabled: !!postId,
  });
}

export function useAddSocialComment(postId: string, parentCommentId?: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (body: string) => {
      if (!user?.id) throw new Error("Connexion requise.");
      const cleanBody = body.trim();
      if (!cleanBody) throw new Error("Le commentaire est vide.");

      const { error } = await (supabase.from("social_post_comments" as any) as any).insert({
        post_id: postId,
        parent_comment_id: parentCommentId || null,
        user_id: user.id,
        body: cleanBody,
      });
      if (error) throw error;

      const eventResult = await (supabase.rpc as any)("record_social_feed_event", {
        p_post_id: postId,
        p_event_type: "comment",
        p_metadata: { parentCommentId: parentCommentId || null },
      });
      if (eventResult.error && !isMissingRpc(eventResult.error)) throw eventResult.error;
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useSetSocialCommentReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ comment, reaction }: SetCommentReactionInput) => {
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
          comment.myReaction,
        );
      }
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useDeleteSocialComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (comment: SocialFeedComment) => {
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
    onSuccess: () => {
      toast.success("Commentaire supprime.");
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useReportSocialItem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ targetType, targetId, reason }: { targetType: "post" | "comment" | "repost"; targetId: string; reason: string }) => {
      if (!user?.id) throw new Error("Connexion requise.");
      const { error } = await (supabase.from("social_reports" as any) as any).insert({
        target_type: targetType,
        target_id: targetId,
        reporter_id: user.id,
        reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signalement transmis.");
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error((error as Error).message),
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
    onSuccess: () => {
      toast.success("Moderation mise a jour.");
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error((error as Error).message),
  });
}
