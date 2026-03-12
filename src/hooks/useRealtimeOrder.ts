import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OrderUpdate {
  id: string;
  status: string;
  updated_at: string;
  courier_id?: string;
  estimated_delivery_at?: string;
  actual_delivered_at?: string;
}

/**
 * Hook that subscribes to real-time order status changes via Supabase Realtime.
 * Automatically invalidates relevant React Query caches on updates.
 */
export function useRealtimeOrder(orderId: string | undefined) {
  const queryClient = useQueryClient();
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<OrderUpdate | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const newData = payload.new as OrderUpdate;
          setOrderStatus(newData.status);
          setLastUpdate(newData);

          // Invalidate related queries
          queryClient.invalidateQueries({ queryKey: ["order", orderId] });
          queryClient.invalidateQueries({ queryKey: ["order-tracking", orderId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  return { orderStatus, lastUpdate };
}

interface DeliveryTrackingUpdate {
  id: string;
  order_id: string;
  status: string;
  driver_name?: string;
  driver_phone?: string;
  current_lat?: number;
  current_lng?: number;
  estimated_arrival?: string;
}

/**
 * Hook that subscribes to delivery tracking changes for an order.
 */
export function useRealtimeDeliveryTracking(orderId: string | undefined) {
  const queryClient = useQueryClient();
  const [tracking, setTracking] = useState<DeliveryTrackingUpdate | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`delivery-tracking-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_tracking",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const newData = payload.new as DeliveryTrackingUpdate;
          setTracking(newData);
          queryClient.invalidateQueries({ queryKey: ["delivery-tracking", orderId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  return { tracking };
}

interface DispatchJobUpdate {
  id: string;
  order_id: string;
  courier_id?: string;
  status: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  route_geometry?: Record<string, unknown> | null;
  picked_up_at?: string;
  delivered_at?: string;
  proof_photo_url?: string;
}

/**
 * Hook that subscribes to dispatch job changes for an order.
 * Provides courier assignment and delivery progress.
 */
export function useRealtimeDispatchJob(orderId: string | undefined) {
  const queryClient = useQueryClient();
  const [dispatchJob, setDispatchJob] = useState<DispatchJobUpdate | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`dispatch-job-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatch_jobs",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const newData = payload.new as DispatchJobUpdate;
          setDispatchJob(newData);
          queryClient.invalidateQueries({ queryKey: ["dispatch-job", orderId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  return { dispatchJob };
}
