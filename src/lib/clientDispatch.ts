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
  _input: CourierDispatchInput,
): Promise<CourierDispatchResult> {
  return {
    notifiedCount: 0,
    courierIds: [],
    errors: ["Le fallback de dispatch cote client est desactive pour raisons de securite."],
  };
}
