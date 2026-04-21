export type CheckoutCompletionOrder = {
  id: string;
  order_number: string | null;
  restaurant_id: string;
  total_amount: number;
  status: string;
  payment_status: string;
};

export type CheckoutCompletionResult = {
  orders: CheckoutCompletionOrder[];
  primaryOrderId: string | null;
  checkoutGroupId: string | null;
  orderReference: string | null;
  newlyFinalized: boolean;
};

export type DashboardCheckoutOrder = {
  id: string;
  order_number?: string | null;
  restaurant_id?: string | null;
  total_amount?: number | string | null;
  status?: string | null;
  payment_status?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ORDER_CHECKOUT_PENDING_SESSION_KEY = "order-checkout-pending-session-id";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readOrderMetadata(order: Pick<DashboardCheckoutOrder, "metadata">) {
  return order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
    ? order.metadata
    : {};
}

export function readPendingOrderCheckoutSessionId() {
  if (typeof window === "undefined") return null;

  const rawValue = sessionStorage.getItem(ORDER_CHECKOUT_PENDING_SESSION_KEY);
  return typeof rawValue === "string" && rawValue.trim() ? rawValue.trim() : null;
}

export function writePendingOrderCheckoutSessionId(sessionId: string | null) {
  if (typeof window === "undefined") return;

  if (sessionId && sessionId.trim()) {
    sessionStorage.setItem(ORDER_CHECKOUT_PENDING_SESSION_KEY, sessionId.trim());
    return;
  }

  sessionStorage.removeItem(ORDER_CHECKOUT_PENDING_SESSION_KEY);
}

export function getOrderStripeSessionId(order: Pick<DashboardCheckoutOrder, "metadata">) {
  const metadata = readOrderMetadata(order);
  const rawValue = metadata.stripe_session_id;
  return typeof rawValue === "string" && rawValue.trim() ? rawValue.trim() : null;
}

export function isOrderCheckoutFinalized(order: Pick<DashboardCheckoutOrder, "status" | "payment_status">) {
  const paymentStatus = normalizeText(order.payment_status);
  const status = normalizeText(order.status);

  if (paymentStatus === "captured" || paymentStatus === "paid") {
    return status !== "payment_failed" && status !== "cancelled";
  }

  return false;
}

export function buildCheckoutCompletionFromDashboardOrders(
  orders: DashboardCheckoutOrder[],
): CheckoutCompletionResult {
  const normalizedOrders = orders.map((order) => ({
    id: String(order.id),
    order_number: typeof order.order_number === "string" && order.order_number.trim()
      ? order.order_number.trim()
      : null,
    restaurant_id: typeof order.restaurant_id === "string" ? order.restaurant_id : "",
    total_amount: Number(order.total_amount || 0),
    status: typeof order.status === "string" && order.status.trim() ? order.status : "confirmed",
    payment_status: typeof order.payment_status === "string" && order.payment_status.trim()
      ? order.payment_status
      : "captured",
  }));

  const primaryOrder = normalizedOrders[0] ?? null;
  const primaryMetadata = primaryOrder ? readOrderMetadata(orders[0]) : {};

  return {
    orders: normalizedOrders,
    primaryOrderId: primaryOrder?.id ?? null,
    checkoutGroupId: typeof primaryMetadata.checkout_group_id === "string"
      ? primaryMetadata.checkout_group_id
      : null,
    orderReference: primaryOrder?.order_number
      ?? (typeof primaryMetadata.order_reference === "string" ? primaryMetadata.order_reference : null),
    newlyFinalized: false,
  };
}
