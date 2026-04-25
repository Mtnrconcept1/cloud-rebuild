import { useEffect, useId, useRef } from "react";

import { createSponsoredImpressionEventId, trackSponsoredImpression } from "@/lib/analytics";

type UseSponsoredImpressionOnViewOptions = {
  campaignId?: string | null;
  restaurantId?: string | null;
  source: string;
  placementKey: string;
  enabled?: boolean;
  threshold?: number;
};

export function useSponsoredImpressionOnView({
  campaignId,
  restaurantId,
  source,
  placementKey,
  enabled = true,
  threshold = 0.45,
}: UseSponsoredImpressionOnViewOptions) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const trackedRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);
  const instanceId = useId();

  useEffect(() => {
    trackedRef.current = false;
  }, [campaignId, restaurantId, source, placementKey]);

  useEffect(() => {
    if (!enabled || !campaignId || !restaurantId) return;

    const node = elementRef.current;
    if (!node) return;

    const finalPlacementKey = `${placementKey}:${instanceId}`;

    const fireImpression = () => {
      if (trackedRef.current) return;

      const eventId = createSponsoredImpressionEventId(finalPlacementKey);
      if (!eventId) {
        trackedRef.current = true;
        return;
      }

      trackedRef.current = true;
      void trackSponsoredImpression(campaignId, restaurantId, source, eventId);
    };

    if (typeof IntersectionObserver === "undefined") {
      fallbackTimerRef.current = window.setTimeout(fireImpression, 300);
      return () => {
        if (fallbackTimerRef.current !== null) {
          window.clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
          fireImpression();
          observer.disconnect();
        }
      },
      {
        threshold: [threshold],
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [campaignId, restaurantId, source, placementKey, enabled, threshold, instanceId]);

  return elementRef;
}
