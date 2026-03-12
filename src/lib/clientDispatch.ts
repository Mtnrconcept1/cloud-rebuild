import { supabase } from "@/integrations/supabase/client";

type CourierDispatchInput = {
  orderId: string;
  orderNumber: string | null;
  restaurantName: string;
  restaurantAddress: string | null;
  restaurantLat: number | null;
  restaurantLng: number | null;
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  totalAmount: number | null;
  itemsSummary: string | null;
  itemsCount: number | null;
  deliveryWindowLabel: string;
  scheduledDeliveryLabel: string | null;
};

type CourierDispatchResult = {
  notifiedCount: number;
  courierIds: string[];
  errors: string[];
};

/**
 * Client-side dispatch that directly notifies available couriers
 * by inserting notifications via the enqueue_notification RPC.
 *
 * This is meant as a fallback when the server-side dispatch-order
 * edge function is unavailable. Couriers receive the notification
 * in real-time via Supabase Realtime → useRealtimeNotifications.
 */
export async function dispatchToCouriersClientSide(
  input: CourierDispatchInput,
): Promise<CourierDispatchResult> {
  const result: CourierDispatchResult = {
    notifiedCount: 0,
    courierIds: [],
    errors: [],
  };

  // 1. Find available couriers (online + approved)
  const { data: couriers, error: courierError } = await supabase
    .from("couriers" as any)
    .select("id, user_id, current_lat, current_lng, vehicle_type")
    .eq("is_online", true)
    .eq("status", "approved")
    .limit(10);

  if (courierError) {
    result.errors.push(`Erreur couriers: ${courierError.message}`);
    return result;
  }

  if (!couriers || couriers.length === 0) {
    result.errors.push("Aucun livreur en ligne.");
    return result;
  }

  // 2. Compute distance if restaurant has coordinates
  const couriersWithDistance = (couriers as any[]).map((courier) => {
    let distanceKm = 1.0;
    if (
      input.restaurantLat != null &&
      input.restaurantLng != null &&
      courier.current_lat != null &&
      courier.current_lng != null
    ) {
      const R = 6371;
      const dLat = ((courier.current_lat - input.restaurantLat) * Math.PI) / 180;
      const dLng = ((courier.current_lng - input.restaurantLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((input.restaurantLat * Math.PI) / 180) *
          Math.cos((courier.current_lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const baseFee = 5.0;
    const distanceBonus = Math.max(0, (distanceKm - 1) * 1.5);
    const estimatedEarnings = Math.round((baseFee + distanceBonus) * 100) / 100;

    return { ...courier, distanceKm, estimatedEarnings };
  });

  // 3. Notify each courier via enqueue_notification RPC
  for (const courier of couriersWithDistance) {
    const bodyParts = [
      input.restaurantName,
      input.itemsSummary,
      input.deliveryAddress,
      input.scheduledDeliveryLabel || input.deliveryWindowLabel,
    ].filter(Boolean);

    const notificationData = {
      dispatch_job_id: `client-dispatch-${input.orderId}`,
      dispatch_attempt_id: `client-attempt-${courier.id}-${Date.now()}`,
      order_id: input.orderId,
      order_number: input.orderNumber,
      restaurant_name: input.restaurantName,
      restaurant_address: input.restaurantAddress,
      restaurant_lat: input.restaurantLat,
      restaurant_lng: input.restaurantLng,
      delivery_address: input.deliveryAddress,
      delivery_lat: input.deliveryLat,
      delivery_lng: input.deliveryLng,
      total_amount: input.totalAmount,
      items_count: input.itemsCount,
      items_summary: input.itemsSummary,
      distance_km: Math.round(courier.distanceKm * 10) / 10,
      estimated_earnings: courier.estimatedEarnings,
      delivery_window_label: input.deliveryWindowLabel,
      scheduled_delivery_label: input.scheduledDeliveryLabel,
      multi_restaurant: false,
      delivery_proof_required: true,
      url: "/courier/jobs",
      route_steps: [
        ...(input.restaurantLat != null && input.restaurantLng != null
          ? [
              {
                id: `pickup-${input.orderId}`,
                type: "pickup",
                label: "Retrait",
                address: input.restaurantAddress || "",
                latitude: input.restaurantLat,
                longitude: input.restaurantLng,
                restaurant_name: input.restaurantName,
                step_index: 1,
              },
            ]
          : []),
        ...(input.deliveryLat != null && input.deliveryLng != null
          ? [
              {
                id: "dropoff",
                type: "dropoff",
                label: "Livraison",
                address: input.deliveryAddress || "",
                latitude: input.deliveryLat,
                longitude: input.deliveryLng,
                step_index: 2,
              },
            ]
          : []),
      ],
      requested_channels: { in_app: true, push: true, email: false },
    };

    try {
      const { error: rpcError } = await supabase.rpc(
        "enqueue_notification" as any,
        {
          p_user_id: courier.user_id,
          p_title: "Nouvelle course dans votre zone",
          p_body: bodyParts.join(" - "),
          p_type: "dispatch",
          p_category: "transactional",
          p_data: notificationData,
        },
      );

      if (rpcError) {
        result.errors.push(`Livreur ${courier.id}: ${rpcError.message}`);
      } else {
        result.notifiedCount++;
        result.courierIds.push(courier.id);
      }
    } catch (err) {
      result.errors.push(
        `Livreur ${courier.id}: ${err instanceof Error ? err.message : "erreur inconnue"}`,
      );
    }
  }

  return result;
}
