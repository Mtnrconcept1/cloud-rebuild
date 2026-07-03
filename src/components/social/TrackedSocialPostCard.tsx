import { useEffect, useRef } from "react";

import { getSupabase } from "@/integrations/supabase/client";
import { rememberActualitesPostSignal } from "@/lib/actualitesPersonalizedTrends";
import type { SocialFeedPost } from "@/lib/socialFeed";
import SocialPostCard from "./SocialPostCard";

type TrackedSocialPostCardProps = {
  post: SocialFeedPost;
  compact?: boolean;
  highlighted?: boolean;
  source?: string;
};

const ACTUALITES_VIEWER_KEY = "tok-actualites-viewer-v1";

function getOrCreateViewerId() {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(ACTUALITES_VIEWER_KEY);
    if (existing) return existing;
    const created = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(ACTUALITES_VIEWER_KEY, created);
    return created;
  } catch {
    return "ephemeral-viewer";
  }
}

function getLinkMetadata(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return null;
  return {
    href: link.getAttribute("href") || "",
    text: link.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null,
  };
}

async function recordActualitesEvent({
  postId,
  eventType,
  metadata,
}: {
  postId: string;
  eventType: "impression" | "click";
  metadata: Record<string, unknown>;
}) {
  try {
    await (getSupabase().rpc as any)("record_social_feed_event", {
      p_post_id: postId,
      p_event_type: eventType,
      p_metadata: metadata,
    });
  } catch {
    // Tracking must never block the public feed.
  }
}

export default function TrackedSocialPostCard({
  post,
  compact = false,
  highlighted = false,
  source = "actualites",
}: TrackedSocialPostCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const impressionRecordedRef = useRef(false);
  const lastClickAtRef = useRef(0);

  useEffect(() => {
    impressionRecordedRef.current = false;
  }, [post.id]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || impressionRecordedRef.current) return;
    const browserWindow = typeof window === "undefined" ? null : window;

    const recordImpression = () => {
      if (impressionRecordedRef.current) return;
      impressionRecordedRef.current = true;
      void recordActualitesEvent({
        postId: post.id,
        eventType: "impression",
        metadata: {
          source,
          page: "actualites",
          viewerId: getOrCreateViewerId(),
          activityId: post.activityId,
          activityType: post.activityType,
          restaurantId: post.restaurantId,
          premiumBannerId: post.premiumBannerId || undefined,
          premiumBanner: Boolean(post.premiumBannerId),
          premiumBannerImpressionsPerViewer: post.premiumBannerImpressionsPerViewer || undefined,
          premiumBannerRemainingImpressions: post.premiumBannerRemainingImpressions || undefined,
        },
      });
    };

    if (!browserWindow || !("IntersectionObserver" in browserWindow)) {
      const timeout = browserWindow?.setTimeout(recordImpression, 1200);
      if (!timeout) {
        recordImpression();
        return;
      }
      return () => browserWindow.clearTimeout(timeout);
    }

    const observer = new browserWindow.IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.55) {
          recordImpression();
          observer.disconnect();
        }
      },
      { threshold: [0.55] },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [
    post.activityId,
    post.activityType,
    post.id,
    post.premiumBannerId,
    post.premiumBannerImpressionsPerViewer,
    post.premiumBannerRemainingImpressions,
    post.restaurantId,
    source,
  ]);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastClickAtRef.current < 500) return;
    lastClickAtRef.current = now;

    const link = getLinkMetadata(event.target);
    rememberActualitesPostSignal(post);

    void recordActualitesEvent({
      postId: post.id,
      eventType: "click",
      metadata: {
        source,
        page: "actualites",
        viewerId: getOrCreateViewerId(),
        action: link ? "link_click" : "card_click",
        href: link?.href,
        label: link?.text,
        activityId: post.activityId,
        activityType: post.activityType,
        restaurantId: post.restaurantId,
        premiumBannerId: post.premiumBannerId || undefined,
        premiumBanner: Boolean(post.premiumBannerId),
      },
    });
  };

  return (
    <div ref={containerRef} onClickCapture={handleClickCapture}>
      <SocialPostCard post={post} compact={compact} highlighted={highlighted} />
    </div>
  );
}
