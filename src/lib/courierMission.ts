import type { RealtimeNotification } from "@/hooks/useRealtimeNotifications";

export type CourierMissionStep = {
  id: string;
  type: "pickup" | "dropoff";
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  restaurantName?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  stepIndex: number;
};

export type CourierMissionPreview = {
  dispatchJobId: string | null;
  dispatchAttemptId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  restaurantName: string | null;
  deliveryAddress: string | null;
  totalAmount: number | null;
  itemsCount: number | null;
  itemsSummary: string | null;
  estimatedEarnings: number | null;
  distanceKm: number | null;
  deliveryWindowLabel: string | null;
  scheduledDeliveryLabel: string | null;
  multiRestaurant: boolean;
  routeSteps: CourierMissionStep[];
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildFallbackRouteSteps(data: Record<string, unknown>) {
  const routeSteps: CourierMissionStep[] = [];
  const restaurantName = toStringValue(data.restaurant_name) || "Restaurant";
  const restaurantAddress = toStringValue(data.restaurant_address) || "";
  const restaurantLat = toNumberValue(data.restaurant_lat);
  const restaurantLng = toNumberValue(data.restaurant_lng);
  const deliveryAddress = toStringValue(data.delivery_address) || "";
  const deliveryLat = toNumberValue(data.delivery_lat);
  const deliveryLng = toNumberValue(data.delivery_lng);

  if (restaurantLat !== null && restaurantLng !== null) {
    routeSteps.push({
      id: "pickup-1",
      type: "pickup",
      label: "Retrait",
      address: restaurantAddress,
      latitude: restaurantLat,
      longitude: restaurantLng,
      restaurantName,
      stepIndex: 1,
    });
  }

  if (deliveryLat !== null && deliveryLng !== null) {
    routeSteps.push({
      id: `dropoff-${routeSteps.length + 1}`,
      type: "dropoff",
      label: "Livraison",
      address: deliveryAddress,
      latitude: deliveryLat,
      longitude: deliveryLng,
      stepIndex: routeSteps.length + 1,
    });
  }

  return routeSteps;
}

export function normalizeCourierMissionSteps(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(asObject(value)?.steps)
      ? (asObject(value)?.steps as unknown[])
      : [];

  const steps = source
    .map((entry, index): CourierMissionStep | null => {
      const item = asObject(entry);
      if (!item) return null;

      return {
        id: toStringValue(item.id) || `step-${index + 1}`,
        type: toStringValue(item.type) === "dropoff" ? "dropoff" : "pickup",
        label: toStringValue(item.label) || (toStringValue(item.type) === "dropoff" ? "Livraison" : `Retrait ${index + 1}`),
        address: toStringValue(item.address) || "",
        latitude: toNumberValue(item.latitude),
        longitude: toNumberValue(item.longitude),
        restaurantName: toStringValue(item.restaurant_name),
        orderId: toStringValue(item.order_id),
        orderNumber: toStringValue(item.order_number),
        stepIndex: toNumberValue(item.step_index) ?? (index + 1),
      } satisfies CourierMissionStep;
    })
    .filter((step): step is CourierMissionStep => Boolean(step));

  return steps.sort((left, right) => left.stepIndex - right.stepIndex);
}

function normalizeMissionPreview(data: Record<string, unknown>): CourierMissionPreview | null {
  const dispatchJobId = toStringValue(data.dispatch_job_id);
  const dispatchAttemptId = toStringValue(data.dispatch_attempt_id);

  if (!dispatchJobId && !dispatchAttemptId) return null;

  const routeSteps = normalizeCourierMissionSteps(data.route_steps);
  const fallbackSteps = routeSteps.length > 0 ? routeSteps : buildFallbackRouteSteps(data);

  return {
    dispatchJobId,
    dispatchAttemptId,
    orderId: toStringValue(data.order_id),
    orderNumber: toStringValue(data.order_number),
    restaurantName: toStringValue(data.restaurant_name),
    deliveryAddress: toStringValue(data.delivery_address),
    totalAmount: toNumberValue(data.total_amount),
    itemsCount: toNumberValue(data.items_count),
    itemsSummary: toStringValue(data.items_summary),
    estimatedEarnings: toNumberValue(data.estimated_earnings),
    distanceKm: toNumberValue(data.distance_km),
    deliveryWindowLabel: toStringValue(data.delivery_window_label),
    scheduledDeliveryLabel: toStringValue(data.scheduled_delivery_label),
    multiRestaurant: Boolean(data.multi_restaurant),
    routeSteps: fallbackSteps,
  };
}

export function buildCourierMissionFromNotification(notification: RealtimeNotification) {
  const data = asObject(notification.data);
  if (!data) return null;
  return normalizeMissionPreview(data);
}

export function buildCourierMissionFromOffer(offer: any) {
  const dispatchJob = asObject(offer?.dispatch_jobs) || {};
  const order = asObject(dispatchJob.orders) || {};
  const restaurant = asObject(order.restaurants) || {};
  const metadata = asObject(order.metadata) || {};
  const routeGeometry = asObject(dispatchJob.route_geometry);

  return normalizeMissionPreview({
    dispatch_job_id: dispatchJob.id || offer?.dispatch_job_id || null,
    dispatch_attempt_id: offer?.id || null,
    order_id: order.id || dispatchJob.order_id || null,
    order_number: order.order_number || null,
    restaurant_name: restaurant.name || null,
    restaurant_address: restaurant.address || null,
    restaurant_lat: restaurant.latitude || dispatchJob.pickup_lat || null,
    restaurant_lng: restaurant.longitude || dispatchJob.pickup_lng || null,
    delivery_address: order.delivery_address || null,
    delivery_lat: metadata.delivery_lat || dispatchJob.dropoff_lat || null,
    delivery_lng: metadata.delivery_lng || dispatchJob.dropoff_lng || null,
    total_amount: order.total_amount || null,
    items_count: metadata.items_count || null,
    items_summary: metadata.items_summary || null,
    estimated_earnings: offer?.estimated_earnings || null,
    distance_km: offer?.distance_to_pickup_meters ? Number(offer.distance_to_pickup_meters) / 1000 : null,
    delivery_window_label: metadata.delivery_window_label || null,
    scheduled_delivery_label: metadata.scheduled_delivery_label || null,
    multi_restaurant: metadata.multi_restaurant || false,
    route_steps: routeGeometry?.steps || routeGeometry || null,
  });
}

export function buildCourierMissionFromJob(job: any) {
  const order = asObject(job?.orders) || {};
  const restaurant = asObject(order.restaurants) || {};
  const metadata = asObject(order.metadata) || {};
  const routeGeometry = asObject(job?.route_geometry);

  return normalizeMissionPreview({
    dispatch_job_id: job?.id || null,
    order_id: order.id || job?.order_id || null,
    order_number: order.order_number || null,
    restaurant_name: restaurant.name || null,
    restaurant_address: restaurant.address || null,
    restaurant_lat: restaurant.latitude || job?.pickup_lat || null,
    restaurant_lng: restaurant.longitude || job?.pickup_lng || null,
    delivery_address: order.delivery_address || null,
    delivery_lat: metadata.delivery_lat || job?.dropoff_lat || null,
    delivery_lng: metadata.delivery_lng || job?.dropoff_lng || null,
    total_amount: order.total_amount || null,
    items_count: metadata.items_count || null,
    items_summary: metadata.items_summary || null,
    estimated_earnings: (Number(job?.earnings_base || 0) + Number(job?.earnings_tip || 0) + Number(job?.earnings_bonus || 0)) || null,
    distance_km: job?.distance_meters ? Number(job.distance_meters) / 1000 : null,
    delivery_window_label: metadata.delivery_window_label || null,
    scheduled_delivery_label: metadata.scheduled_delivery_label || null,
    multi_restaurant: metadata.multi_restaurant || false,
    route_steps: routeGeometry?.steps || routeGeometry || null,
  });
}
