import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { SocialFeedComment, SocialFeedMedia, SocialFeedPost } from "@/lib/socialFeed";

const supabase = getSupabase();
const SOCIAL_FEED_BUCKET = "social-post-media";
const MAX_POST_MEDIA = 10;

type SocialFeedRpcRow = {
  activity_id: string;
  activity_type: "post" | "repost";
  post_id: string;
  restaurant_id: string;
  author_id: string;
  body: string;
  status: "published" | "hidden" | "deleted";
  created_at: string;
  published_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
  reposts_count: number | null;
  shares_count: number | null;
  liked_by_me: boolean | null;
  followed_by_me: boolean | null;
  reposted_by_me: boolean | null;
  score: number | null;
  media: SocialFeedMedia[] | null;
  restaurant: SocialFeedPost["restaurant"] | null;
  repost: SocialFeedPost["repost"];
};

type CreateSocialPostInput = {
  restaurantId: string;
  body: string;
  files: File[];
};

type ModerationTarget = {
  type: "post" | "comment" | "repost" | "report";
  id: string;
  status: "published" | "hidden" | "deleted" | "open" | "reviewed" | "dismissed" | "resolved";
  reason?: string;
};

export function invalidateSocialQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["social-feed"] });
  void queryClient.invalidateQueries({ queryKey: ["restaurant-social-posts"] });
  void queryClient.invalidateQueries({ queryKey: ["social-comments"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-social"] });
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
    commentsCount: Number(row.comments_count || 0),
    repostsCount: Number(row.reposts_count || 0),
    sharesCount: Number(row.shares_count || 0),
    likedByMe: Boolean(row.liked_by_me),
    followedByMe: Boolean(row.followed_by_me),
    repostedByMe: Boolean(row.reposted_by_me),
    score: Number(row.score || 0),
    media: Array.isArray(row.media) ? row.media.map(mapMedia) : [],
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
    commentsCount: Number(row.comments_count || 0),
    repostsCount: Number(row.reposts_count || 0),
    sharesCount: Number(row.shares_count || 0),
    likedByMe: false,
    followedByMe: false,
    repostedByMe: false,
    score: 0,
    media: Array.isArray(row.social_post_media) ? row.social_post_media.map(mapMedia) : [],
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

    const channel = supabase
      .channel(`social-feed:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_posts" }, () => invalidateSocialQueries(queryClient))
      .on("postgres_changes", { event: "*", schema: "public", table: "social_post_media" }, () => invalidateSocialQueries(queryClient))
      .on("postgres_changes", { event: "*", schema: "public", table: "social_post_likes" }, () => invalidateSocialQueries(queryClient))
      .on("postgres_changes", { event: "*", schema: "public", table: "social_post_comments" }, () => invalidateSocialQueries(queryClient))
      .on("postgres_changes", { event: "*", schema: "public", table: "social_post_reposts" }, () => invalidateSocialQueries(queryClient))
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_follows" }, () => invalidateSocialQueries(queryClient))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

export function useCreateSocialPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ restaurantId, body, files }: CreateSocialPostInput) => {
      if (!user?.id) throw new Error("Connexion requise.");
      assertMediaFiles(files);

      const cleanBody = body.trim();
      if (!cleanBody) throw new Error("Le texte du post est requis.");

      const { data: post, error } = await (supabase.from("social_posts" as any) as any)
        .insert({
          restaurant_id: restaurantId,
          author_id: user.id,
          body: cleanBody,
          status: "published",
        })
        .select("id")
        .single();

      if (error) throw error;
      await uploadPostMedia(restaurantId, post.id, files);
      return post.id as string;
    },
    onSuccess: () => {
      toast.success("Post publie.");
      invalidateSocialQueries(queryClient);
    },
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useToggleSocialLike() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: SocialFeedPost) => {
      if (!user?.id) throw new Error("Connexion requise.");

      if (post.likedByMe) {
        const { error } = await (supabase.from("social_post_likes" as any) as any)
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }

      const { error } = await (supabase.from("social_post_likes" as any) as any).insert({
        post_id: post.id,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
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

      const { error } = await (supabase.from("restaurant_follows" as any) as any).insert({
        restaurant_id: post.restaurantId,
        user_id: user.id,
      });
      if (error) throw error;
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
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
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
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
    onError: (error) => toast.error((error as Error).message),
  });
}

export function useSocialComments(postId?: string | null) {
  useSocialRealtime(!!postId);

  return useQuery({
    queryKey: ["social-comments", postId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("social_post_comments" as any) as any)
        .select("*")
        .eq("post_id", postId)
        .eq("status", "published")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []).map((row: any): SocialFeedComment => ({
        id: row.id,
        postId: row.post_id,
        userId: row.user_id,
        body: row.body,
        status: row.status,
        createdAt: row.created_at,
        authorName: null,
      }));
    },
    enabled: !!postId,
  });
}

export function useAddSocialComment(postId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (body: string) => {
      if (!user?.id) throw new Error("Connexion requise.");
      const cleanBody = body.trim();
      if (!cleanBody) throw new Error("Le commentaire est vide.");

      const { error } = await (supabase.from("social_post_comments" as any) as any).insert({
        post_id: postId,
        user_id: user.id,
        body: cleanBody,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateSocialQueries(queryClient),
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
