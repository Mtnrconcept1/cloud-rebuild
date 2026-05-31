import { useEffect, useRef } from "react";

import { useRecordSocialFeedEvent } from "@/hooks/useSocialFeed";
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const impressionRecordedRef = useRef(false);
  const lastClickAtRef = useRef(0);
  const recordEvent = useRecordSocialFeedEvent();

  useEffect(() => {
    impressionRecordedRef.current = false;
  }, [post.id]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || impressionRecordedRef.current) return;

    const recordImpression = () => {
      if (impressionRecordedRef.current) return;
      impressionRecordedRef.current = true;
      recordEvent.mutate({
        postId: post.id,
        eventType: "impression",
        metadata: {
          source,
          page: "actualites",
          activityId: post.activityId,
          activityType: post.activityType,
          restaurantId: post.restaurantId,
        },
      });
    };

    if (!("IntersectionObserver" in window)) {
      const timeout = window.setTimeout(recordImpression, 1200);
      return () => window.clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
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
  }, [post.activityId, post.activityType, post.id, post.restaurantId, recordEvent, source]);

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const link = getLinkMetadata(event.target);
    if (!link) return;

    const now = Date.now();
    if (now - lastClickAtRef.current < 500) return;
    lastClickAtRef.current = now;

    recordEvent.mutate({
      postId: post.id,
      eventType: "click",
      metadata: {
        source,
        page: "actualites",
        action: "link_click",
        href: link.href,
        label: link.text,
        activityId: post.activityId,
        activityType: post.activityType,
        restaurantId: post.restaurantId,
      },
    });
  };

  return (
    <div ref={containerRef} onClickCapture={handleClickCapture}>
      <SocialPostCard post={post} compact={compact} highlighted={highlighted} />
    </div>
  );
}
