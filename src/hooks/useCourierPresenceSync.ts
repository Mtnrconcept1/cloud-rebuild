import { useEffect, useRef, useState } from "react";

import { syncCourierPresence } from "@/lib/courier";

type PositionSnapshot = {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
};

export function useCourierPresenceSync({
  enabled,
  isOnline,
  activeDispatchJobId,
}: {
  enabled: boolean;
  isOnline: boolean;
  activeDispatchJobId?: string | null;
}) {
  const [position, setPosition] = useState<PositionSnapshot | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSyncAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) {
      setIsWatching(false);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geoPosition) => {
        const nextPosition = {
          lat: geoPosition.coords.latitude,
          lng: geoPosition.coords.longitude,
          heading: geoPosition.coords.heading,
          speed: geoPosition.coords.speed,
          accuracy: geoPosition.coords.accuracy,
        };

        setPosition(nextPosition);
        setLocationError(null);
        setIsWatching(true);

        const now = Date.now();
        if (now - lastSyncAtRef.current < 10000) return;
        lastSyncAtRef.current = now;

        void syncCourierPresence({
          isOnline,
          activeDispatchJobId: activeDispatchJobId || null,
          ...nextPosition,
        }).catch((error) => {
          setLocationError(error instanceof Error ? error.message : "Impossible de synchroniser la position");
        });
      },
      (error) => {
        setIsWatching(false);
        setLocationError(error.message || "Geolocalisation indisponible");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsWatching(false);
    };
  }, [activeDispatchJobId, enabled, isOnline]);

  return {
    position,
    locationError,
    isWatching,
  };
}
