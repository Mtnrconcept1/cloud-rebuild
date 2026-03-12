export type DeliveryRouteStep = {
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

function getOrderSequence(order: any) {
  const orderNumber = toStringValue(order?.order_number);
  if (orderNumber) {
    const suffixMatch = /-(\d+)$/.exec(orderNumber);
    if (suffixMatch) return Number(suffixMatch[1]);
  }

  const createdAt = toStringValue(order?.created_at);
  if (createdAt) return Date.parse(createdAt);
  return Number.MAX_SAFE_INTEGER;
}

export function normalizeDeliveryRouteSteps(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(asObject(value)?.steps)
      ? (asObject(value)?.steps as unknown[])
      : [];

  return source
    .map((entry, index) => {
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
      } satisfies DeliveryRouteStep;
    })
    .filter((step): step is DeliveryRouteStep => Boolean(step))
    .sort((left, right) => left.stepIndex - right.stepIndex);
}

type OrderLike = {
  id?: string | null;
  order_number?: string | null;
  created_at?: string | null;
  delivery_address?: string | null;
  metadata?: Record<string, unknown> | null;
  restaurants?: Record<string, unknown> | null;
  restaurant?: Record<string, unknown> | null;
};

export function buildDeliveryRouteSteps(input: {
  routeGeometry?: unknown;
  orders?: OrderLike[];
  deliveryAddress?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
}) {
  const normalizedSteps = normalizeDeliveryRouteSteps(input.routeGeometry);
  if (normalizedSteps.length > 0) return normalizedSteps;

  const orders = (input.orders || [])
    .filter(Boolean)
    .sort((left, right) => getOrderSequence(left) - getOrderSequence(right));

  const uniqueRestaurants = orders.reduce((acc: DeliveryRouteStep[], order, index) => {
    const restaurant = (asObject(order.restaurants) || asObject(order.restaurant) || {}) as Record<string, unknown>;
    const restaurantId = toStringValue(restaurant.id) || `${restaurant.name || "restaurant"}-${index + 1}`;

    if (acc.some((item) => item.id === `pickup-${restaurantId}`)) {
      return acc;
    }

    acc.push({
      id: `pickup-${restaurantId}`,
      type: "pickup",
      label: orders.length > 1 ? `Retrait ${acc.length + 1}` : "Retrait",
      address: toStringValue(restaurant.address) || "",
      latitude: toNumberValue(restaurant.latitude),
      longitude: toNumberValue(restaurant.longitude),
      restaurantName: toStringValue(restaurant.name),
      orderId: toStringValue(order.id),
      orderNumber: toStringValue(order.order_number),
      stepIndex: acc.length + 1,
    });

    return acc;
  }, []);

  const firstMetadata = asObject(orders[0]?.metadata) || {};
  const deliveryAddress = input.deliveryAddress || toStringValue(orders[0]?.delivery_address) || "";
  const deliveryLat = input.deliveryLat ?? toNumberValue(firstMetadata.delivery_lat);
  const deliveryLng = input.deliveryLng ?? toNumberValue(firstMetadata.delivery_lng);

  if (deliveryLat !== null && deliveryLng !== null) {
    uniqueRestaurants.push({
      id: "dropoff",
      type: "dropoff",
      label: "Livraison",
      address: deliveryAddress,
      latitude: deliveryLat,
      longitude: deliveryLng,
      stepIndex: uniqueRestaurants.length + 1,
    });
  }

  return uniqueRestaurants;
}
