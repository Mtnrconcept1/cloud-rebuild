import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { watchPosition } from "@/lib/geolocation-native";

const supabase = getSupabase();

interface CourierPosition {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

/**
 * Hook that subscribes to real-time courier location updates via Supabase Broadcast.
 * Uses Broadcast channels for high-frequency location data (every 5-10 seconds).
 */
export function useRealtimeCourierLocation(dispatchJobId: string | undefined) {
  const [position, setPosition] = useState<CourierPosition | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const positionHistory = useRef<CourierPosition[]>([]);

  useEffect(() => {
    if (!dispatchJobId) return;

    const channel = supabase
      .channel(`courier-location-${dispatchJobId}`)
      .on("broadcast", { event: "location" }, (payload) => {
        const pos = payload.payload as CourierPosition;
        setPosition(pos);

        // Keep last 20 positions for smooth animation
        positionHistory.current = [
          ...positionHistory.current.slice(-19),
          pos,
        ];
      })
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dispatchJobId]);

  return {
    position,
    isConnected,
    positionHistory: positionHistory.current,
  };
}

/**
 * Hook for the courier to broadcast their location.
 * Uses the Geolocation API and sends updates via Supabase Broadcast.
 */
export function useCourierLocationBroadcast(
  dispatchJobId: string | undefined,
  enabled: boolean = false
) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const watchRef = useRef<{ clear: () => void } | null>(null);

  const startBroadcasting = useCallback(() => {
    if (!dispatchJobId || !enabled) return;

    // Create broadcast channel
    const channel = supabase.channel(`courier-location-${dispatchJobId}`);
    channel.subscribe();
    channelRef.current = channel;

    // Start watching position
    const watcher = watchPosition(
      (pos) => {
        const locationData: CourierPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
          timestamp: new Date().toISOString(),
        };

        // Broadcast to subscribers
        channel.send({
          type: "broadcast",
          event: "location",
          payload: locationData,
        });
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );
    watchRef.current = watcher;
  }, [dispatchJobId, enabled]);

  const stopBroadcasting = useCallback(() => {
    watchRef.current?.clear();
    watchRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startBroadcasting();
    }
    return () => {
      stopBroadcasting();
    };
  }, [enabled, startBroadcasting, stopBroadcasting]);

  return { startBroadcasting, stopBroadcasting };
}

/**
 * Hook that subscribes to real-time chat messages via Supabase Realtime.
 */
export function useRealtimeChat(conversationId: string | undefined) {
  const [newMessage, setNewMessage] = useState<any | null>(null);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setNewMessage(payload.new);
          setMessageCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { newMessage, messageCount };
}

/**
 * Hook for restaurant dashboard to receive real-time new orders.
 */
export function useRealtimeRestaurantOrders(restaurantId: string | undefined) {
  const [newOrder, setNewOrder] = useState<any | null>(null);
  const [orderCount, setOrderCount] = useState(0);

  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`restaurant-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setNewOrder(payload.new);
          setOrderCount((c) => c + 1);

          // Play notification sound
          try {
            const audioCtx = new AudioContext();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = 800;
            oscillator.type = "sine";
            gainNode.gain.value = 0.3;
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
            setTimeout(() => {
              const osc2 = audioCtx.createOscillator();
              osc2.connect(gainNode);
              osc2.frequency.value = 1000;
              osc2.type = "sine";
              osc2.start();
              osc2.stop(audioCtx.currentTime + 0.3);
            }, 350);
          } catch {
            // Audio not supported
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          // Order status changed — invalidate queries
          setNewOrder(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  return { newOrder, orderCount };
}
