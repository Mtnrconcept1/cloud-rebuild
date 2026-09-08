import { getCommercialDemoSupabase } from "@/integrations/supabase/demoClient";
import {
  getCommercialDemoRealtimeUpdate,
  type CommercialDemoRealtimeStatus,
} from "@/lib/commercialDemoRealtime";
import { isStripeTestCheckoutSessionId } from "@/lib/commercialDemoHostSecurity";
import {
  invokeCommercialDemoFunction,
  invokeCommercialDemoRpc,
} from "@/lib/commercialDemoProject";

export type CommercialDemoSurface = "client" | "restaurant" | "courier" | "system";

export type CommercialDemoItem = {
  menu_item_id?: string;
  name: string;
  quantity: number;
  unit_amount_cents: number;
};

export type CommercialDemoOrderInputItem = CommercialDemoItem & {
  menu_item_id: string;
};

export type CommercialDemoSession = {
  id: string;
  demo_restaurant_id: string;
  created_at?: string | null;
};

export type CommercialDemoRestaurant = {
  id: string;
  name: string;
  description?: string | null;
  cuisine_type?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  image_url?: string | null;
  rating?: number | string | null;
  review_count?: number | null;
  price_range?: number | null;
  delivery_available?: boolean | null;
  delivery_fee?: number | string | null;
  min_order_amount?: number | string | null;
  supports_pickup?: boolean | null;
  supports_dinein?: boolean | null;
  supports_reservation?: boolean | null;
  is_demo: true;
};

export type CommercialDemoCatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  category?: string | null;
  image_url?: string | null;
  is_available: boolean;
};

export type CommercialDemoOrder = {
  id: string;
  order_number: string;
  status: string;
  version: number;
  customer_name: string;
  delivery_address: string;
  items: CommercialDemoItem[];
  total_amount_cents: number;
  payment_status: string;
  stripe_session_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CommercialDemoMission = {
  id: string;
  status: string;
  courier_name?: string | null;
  updated_at?: string | null;
};

export type CommercialDemoReservation = {
  id: string;
  reference: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  customer_name: string;
  customer_phone?: string | null;
  notes?: string | null;
  status: "pending" | "confirmed" | "arrived" | "no_show" | "cancelled";
  version: number;
  created_at: string;
  updated_at: string;
};

export type CommercialDemoEvent = {
  id: string;
  actor_surface: CommercialDemoSurface;
  event_type: string;
  label: string;
  created_at: string;
};

export type CommercialDemoSnapshot = {
  session: CommercialDemoSession;
  demo_restaurant: CommercialDemoRestaurant;
  catalog_items: CommercialDemoCatalogItem[];
  order: CommercialDemoOrder | null;
  mission: CommercialDemoMission | null;
  reservations: CommercialDemoReservation[];
  active_features: string[];
  events: CommercialDemoEvent[];
  allowed_actions: string[];
};

export type CommercialDemoTransitionAction =
  | "restaurant_accept"
  | "restaurant_start_preparing"
  | "restaurant_mark_ready"
  | "courier_accept"
  | "courier_arrived_pickup"
  | "courier_confirm_pickup"
  | "courier_start_delivery"
  | "courier_confirm_delivery";

export type CommercialDemoReservationTransitionAction =
  | "restaurant_confirm"
  | "restaurant_mark_arrived"
  | "restaurant_mark_no_show"
  | "client_cancel";

export type CommercialDemoCheckoutCreateResult = {
  checkout_url: string;
  stripe_session_id: string;
  mode: "test";
  demo_order_id: string;
  demo_session_id: string;
};

export type CommercialDemoCheckoutConfirmResult = {
  paid: boolean;
  payment_status: string;
  mode: "test";
  stripe_session_id: string;
  demo_order_id: string;
  demo_session_id: string;
  snapshot: CommercialDemoSnapshot;
};

export class CommercialDemoApiError extends Error {
  code: string;

  constructor(message: string, code = "COMMERCIAL_DEMO_ERROR") {
    super(message);
    this.name = "CommercialDemoApiError";
    this.code = code;
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function unwrapRpcResult(value: unknown) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function getErrorCode(error: unknown) {
  const record = asRecord(error);
  return String(record.code || record.context?.code || "COMMERCIAL_DEMO_ERROR");
}

function getErrorMessage(error: unknown, fallback: string) {
  const record = asRecord(error);
  return String(record.message || record.error_description || record.context?.message || fallback);
}

async function toFunctionApiError(error: unknown, fallback: string) {
  const record = asRecord(error);
  const context = record.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      const body = asRecord(payload);
      return new CommercialDemoApiError(
        String(body.error || body.message || fallback),
        String(body.code || getErrorCode(error)),
      );
    } catch {
      // Fall back to the normalized SDK error below.
    }
  }
  return new CommercialDemoApiError(getErrorMessage(error, fallback), getErrorCode(error));
}

function assertTestMode(value: unknown) {
  const record = asRecord(value);
  if (record.mode !== "test" || !isStripeTestCheckoutSessionId(record.stripe_session_id)) {
    throw new CommercialDemoApiError(
      "Le serveur n'a pas confirmé une session Stripe Test. Le paiement a été bloqué par sécurité.",
      "DEMO_STRIPE_MODE_REQUIRED",
    );
  }
  return record;
}

async function invokeRpc<T>(name: string, args: Record<string, unknown>) {
  const data = await invokeCommercialDemoRpc<T | T[]>(name, args);
  return unwrapRpcResult(data) as T;
}

export async function createCommercialDemoSession() {
  return invokeRpc<CommercialDemoSession>("commercial_demo_create_session", {});
}

export async function getCommercialDemoSnapshot(sessionId: string) {
  return invokeRpc<CommercialDemoSnapshot>("commercial_demo_get_snapshot", {
    p_session_id: sessionId,
  });
}

export async function createCommercialDemoOrder(sessionId: string, input: {
  customerName?: string;
  deliveryAddress?: string;
  items?: CommercialDemoOrderInputItem[];
} = {}) {
  let items = input.items;
  if (!items) {
    const current = await getCommercialDemoSnapshot(sessionId);
    if (current.order) return current;
    items = getCommercialDemoPresetItems(current.catalog_items);
  }
  if (!items.length) {
    throw new CommercialDemoApiError(
      "Ajoutez au moins un plat disponible au menu du restaurant simulé.",
      "DEMO_MENU_EMPTY",
    );
  }

  return invokeRpc<CommercialDemoSnapshot>("commercial_demo_create_order", {
    p_session_id: sessionId,
    p_customer_name: input.customerName || "Sophie Martin",
    p_delivery_address: input.deliveryAddress || "18 rue de la Démonstration, 1204 Genève",
    p_items: items,
    p_payment_method: "stripe_test",
  });
}

export async function createCommercialDemoReservation(input: {
  sessionId: string;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
}) {
  return invokeRpc<CommercialDemoSnapshot>("commercial_demo_create_reservation", {
    p_session_id: input.sessionId,
    p_reservation_date: input.reservationDate,
    p_reservation_time: input.reservationTime,
    p_party_size: input.partySize,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone || null,
    p_notes: input.notes || null,
  });
}

export async function transitionCommercialDemoReservation(input: {
  reservationId: string;
  action: CommercialDemoReservationTransitionAction;
  expectedVersion: number;
}) {
  return invokeRpc<CommercialDemoSnapshot>("commercial_demo_transition_reservation", {
    p_reservation_id: input.reservationId,
    p_action: input.action,
    p_expected_version: input.expectedVersion,
  });
}

export async function transitionCommercialDemoOrder({
  orderId,
  action,
  expectedVersion,
}: {
  orderId: string;
  action: CommercialDemoTransitionAction;
  expectedVersion: number;
}) {
  return invokeRpc<CommercialDemoSnapshot>("commercial_demo_transition", {
    p_order_id: orderId,
    p_action: action,
    p_expected_version: expectedVersion,
  });
}

export async function resetCommercialDemoSession(sessionId: string) {
  return invokeRpc<CommercialDemoSnapshot>("commercial_demo_reset_session", {
    p_session_id: sessionId,
  });
}

export async function createCommercialDemoCheckout({
  demoRestaurantId,
  demoSessionId,
  returnUrl,
}: {
  demoRestaurantId: string;
  demoSessionId: string;
  returnUrl: string;
}) {
  try {
    const data = await invokeCommercialDemoFunction<CommercialDemoCheckoutCreateResult>(
      "commercial-demo-checkout",
      {
        action: "create",
        demo_restaurant_id: demoRestaurantId,
        demo_session_id: demoSessionId,
        return_url: returnUrl,
      },
    );
    return assertTestMode(data) as CommercialDemoCheckoutCreateResult;
  } catch (error) {
    throw await toFunctionApiError(error, "Le paiement Stripe Test ne peut pas être ouvert.");
  }
}

export function buildCommercialDemoCheckoutReturnUrl(sessionId: string) {
  const url = new URL("/commercial/demo-live", window.location.origin);
  url.searchParams.set("demo_session_id", sessionId);
  return url.toString();
}

export function openCommercialDemoCheckout(sessionId: string, checkoutUrl: string, stripeSessionId: string) {
  if (!isStripeTestCheckoutSessionId(stripeSessionId)) {
    throw new CommercialDemoApiError("Session Stripe Test invalide. Ouverture bloquée.", "INVALID_TEST_STRIPE_SESSION");
  }
  const url = new URL(checkoutUrl);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") {
    throw new CommercialDemoApiError("URL Stripe Test invalide. Ouverture bloquée.", "INVALID_CHECKOUT_URL");
  }
  if (window.parent === window) {
    window.location.assign(url.toString());
    return;
  }
  window.parent.postMessage({
    type: "commercial-demo:open-checkout",
    sessionId,
    stripeSessionId,
    checkoutUrl: url.toString(),
  }, window.location.origin);
}

export async function confirmCommercialDemoCheckout({
  demoRestaurantId,
  demoSessionId,
  stripeSessionId,
}: {
  demoRestaurantId: string;
  demoSessionId: string;
  stripeSessionId: string;
}) {
  try {
    const data = await invokeCommercialDemoFunction<CommercialDemoCheckoutConfirmResult>(
      "commercial-demo-checkout",
      {
        action: "confirm",
        demo_restaurant_id: demoRestaurantId,
        demo_session_id: demoSessionId,
        stripe_session_id: stripeSessionId,
      },
    );
    return assertTestMode(data) as CommercialDemoCheckoutConfirmResult;
  } catch (error) {
    throw await toFunctionApiError(error, "Le paiement Stripe Test n'a pas pu être vérifié.");
  }
}

/**
 * Compatibility bridge for screens that were built while the commercial demo
 * used an immediate server-side payment simulator. The public function name is
 * kept so those screens do not break, but the implementation now opens a real
 * Stripe Checkout session backed exclusively by an sk_test key. The promise
 * intentionally remains pending until the browser leaves for Stripe; callers
 * therefore cannot accidentally mark the order paid before the server confirms
 * the returned cs_test session.
 */
export async function simulateCommercialDemoPayment({
  demoRestaurantId,
  demoSessionId,
}: {
  demoRestaurantId: string;
  demoSessionId: string;
}): Promise<CommercialDemoCheckoutConfirmResult> {
  const checkout = await createCommercialDemoCheckout({
    demoRestaurantId,
    demoSessionId,
    returnUrl: buildCommercialDemoCheckoutReturnUrl(demoSessionId),
  });
  openCommercialDemoCheckout(
    demoSessionId,
    checkout.checkout_url,
    checkout.stripe_session_id,
  );
  return await new Promise<CommercialDemoCheckoutConfirmResult>(() => undefined);
}

export function subscribeToCommercialDemoSession(
  sessionId: string,
  onChange: () => void,
  onStatus: (status: CommercialDemoRealtimeStatus) => void = () => undefined,
) {
  const supabase = getCommercialDemoSupabase();
  let disposed = false;
  const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
  const emitStatus = (status: CommercialDemoRealtimeStatus) => {
    if (!disposed) onStatus(status);
  };
  const resync = () => {
    if (!disposed) onChange();
  };
  const handleOnline = () => {
    emitStatus("reconnecting");
    resync();
  };
  const handleOffline = () => emitStatus("offline");

  emitStatus(isOnline() ? "connecting" : "offline");
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  const channel = supabase
    .channel(`commercial-demo-session:${sessionId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "commercial_demo_orders", filter: `session_id=eq.${sessionId}` },
      resync,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "commercial_demo_delivery_missions", filter: `session_id=eq.${sessionId}` },
      resync,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "commercial_demo_reservations", filter: `session_id=eq.${sessionId}` },
      resync,
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "commercial_demo_order_events", filter: `session_id=eq.${sessionId}` },
      resync,
    )
    .subscribe((channelStatus) => {
      const update = getCommercialDemoRealtimeUpdate(channelStatus, isOnline());
      emitStatus(update.status);
      if (update.shouldResync) resync();
    });

  return () => {
    disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
    void supabase.removeChannel(channel);
  };
}

export function getCommercialDemoPresetItems(
  catalogItems: CommercialDemoCatalogItem[],
): CommercialDemoOrderInputItem[] {
  return catalogItems.slice(0, 2).map((item, index) => ({
    menu_item_id: item.id,
    name: item.name,
    quantity: index === 0 ? 2 : 1,
    unit_amount_cents: Math.round(Number(item.price) * 100),
  }));
}
