import { useEffect, useRef } from "react";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { rememberActualitesPostSignal } from "@/lib/actualitesPersonalizedTrends";
import {
  createAnalyticsTrackingCallId,
  getOrCreateAnalyticsViewerId,
  recordSponsoredSocialFeedEvent,
} from "@/lib/analytics";
import type { SocialFeedPost } from "@/lib/socialFeed";
import SocialPostCard from "./SocialPostCard";

type TrackedSocialPostCardProps = {
  post: SocialFeedPost;
  compact?: boolean;
  highlighted?: boolean;
  source?: string;
};

function getLinkMetadata(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return null;
  return {
    href: link.getAttribute("href") || "",
    text: link.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null,
  };
}

export default function TrackedSocialPostCard({
  post,
  compact = false,
  highlighted = false,
  source = "actualites",
}: TrackedSocialPostCardProps) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const productionTrackingEnabled = commercialDemoFrame?.surface !== "client";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const impressionRecordedRef = useRef(false);
  const impressionRetryCountRef = useRef(0);
  const impressionRetryTimerRef = useRef<number | null>(null);
  const impressionTrackingRef = useRef<{
    postId: string;
    trackingCallId: string;
  } | null>(null);
  const lastClickAtRef = useRef(0);

  useEffect(() => {
    impressionTrackingRef.current = {
      postId: post.id,
      trackingCallId: createAnalyticsTrackingCallId(),
    };
    impressionRecordedRef.current = false;
    impressionRetryCountRef.current = 0;
    lastClickAtRef.current = 0;
    if (impressionRetryTimerRef.current !== null) {
      window.clearTimeout(impressionRetryTimerRef.current);
      impressionRetryTimerRef.current = null;
    }

    return () => {
      if (impressionRetryTimerRef.current !== null) {
        window.clearTimeout(impressionRetryTimerRef.current);
        impressionRetryTimerRef.current = null;
      }
    };
  }, [post.id]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || impressionRecordedRef.current) return;
    const browserWindow = typeof window === "undefined" ? null : window;
    let disposed = false;

    const clearImpressionRetryTimer = () => {
      if (impressionRetryTimerRef.current === null || !browserWindow) return;
      browserWindow.clearTimeout(impressionRetryTimerRef.current);
      impressionRetryTimerRef.current = null;
    };

    const recordImpression = () => {
      if (disposed || impressionRecordedRef.current) return;
      const impressionTracking = impressionTrackingRef.current;
      if (!impressionTracking || impressionTracking.postId !== post.id) return;
      impressionRecordedRef.current = true;
      if (!productionTrackingEnabled) return;
      void recordSponsoredSocialFeedEvent({
        postId: post.id,
        eventType: "impression",
        trackingCallId: impressionTracking.trackingCallId,
        metadata: {
          source,
          page: "actualites",
          viewerId: getOrCreateAnalyticsViewerId(),
          activityId: post.activityId,
          activityType: post.activityType,
          restaurantId: post.restaurantId,
          premiumBannerId: post.premiumBannerId || undefined,
          premiumBanner: Boolean(post.premiumBannerId),
          premiumBannerImpressionsPerViewer: post.premiumBannerImpressionsPerViewer || undefined,
          premiumBannerRemainingImpressions: post.premiumBannerRemainingImpressions || undefined,
        },
      }).then((result) => {
        if (disposed) return;
        if (result.eventId || result.queued || result.reason) {
          impressionRetryCountRef.current = 0;
          return;
        }
        if (impressionRetryCountRef.current >= 2) return;

        impressionRetryCountRef.current += 1;
        impressionRecordedRef.current = false;
        impressionRetryTimerRef.current = browserWindow?.setTimeout(() => {
          impressionRetryTimerRef.current = null;
          if (element.isConnected && !impressionRecordedRef.current) {
            recordImpression();
          }
        }, 2_000 * impressionRetryCountRef.current) ?? null;
      });
    };

    if (!browserWindow || !("IntersectionObserver" in browserWindow)) {
      const timeout = browserWindow?.setTimeout(recordImpression, 1200);
      if (!timeout) {
        recordImpression();
        return;
      }
      return () => {
        disposed = true;
        browserWindow.clearTimeout(timeout);
        clearImpressionRetryTimer();
      };
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
    return () => {
      disposed = true;
      observer.disconnect();
      clearImpressionRetryTimer();
    };
  }, [
    post.activityId,
    post.activityType,
    post.id,
    post.premiumBannerId,
    post.premiumBannerImpressionsPerViewer,
    post.premiumBannerRemainingImpressions,
    post.restaurantId,
    productionTrackingEnabled,
    source,
  ]);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-social-sponsored-cta='true']")) {
      return;
    }
    if (event.target.closest("button,input,textarea,select,[role='button'],[role='menuitem']")) {
      return;
    }

    const now = Date.now();
    if (now - lastClickAtRef.current < 500) return;
    lastClickAtRef.current = now;

    const link = getLinkMetadata(event.target);
    rememberActualitesPostSignal(post);

    if (!productionTrackingEnabled) return;
    void recordSponsoredSocialFeedEvent({
      postId: post.id,
      eventType: "click",
      trackingCallId: createAnalyticsTrackingCallId(),
      metadata: {
        source,
        page: "actualites",
        viewerId: getOrCreateAnalyticsViewerId(),
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
