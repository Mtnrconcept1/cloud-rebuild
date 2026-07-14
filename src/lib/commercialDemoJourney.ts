import { getSupabase } from "@/integrations/supabase/client";
import {
  getCommercialDemoRealtimeUpdate,
  type CommercialDemoRealtimeStatus,
} from "@/lib/commercialDemoRealtime";
import { invokeSupabaseFunction, invokeSupabaseRpc } from "@/lib/session";

export type CommercialDemoSurface = "client" | "restaurant" | "courier" | "system";

export type CommercialDemoItem = {
  name: string;
  quantity: number;
  unit_amount_cents: number;
};

export type CommercialDemoSession = {
  id: string;
  demo_restaurant_id: string;
  created_at?: string | null;
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

export type CommercialDemoEvent = {
  id: string;
  actor_surface: CommercialDemoSurface;
  event_type: string;
  label: string;
  created_at: string;
};

export type CommercialDemoSnapshot = {
  session: CommercialDemoSession;
  order: CommercialDemoOrder | null;
  mission: CommercialDemoMission | null;
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

const DEMO_ITEMS: CommercialDemoItem[] = [
  { name: "Menu signature", quantity: 2, unit_amount_cents: 2_450 },
  { name: "Tiramisu maison", quantity: 1, unit_amount_cents: 950 },
];

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
  if (record.mode !== "test") {
    throw new CommercialDemoApiError(
      "Le serveur n'a pas confirmé le mode Stripe Test. Le paiement a été bloqué par sécurité.",
      "DEMO_STRIPE_MODE_REQUIRED",
    );
  }
  return record;
}

async function invokeRpc<T>(name: string, args: Record<string, unknown>) {
  const data = await invokeSupabaseRpc<T | T[]>(name, { body: args });
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

export async function createCommercialDemoOrder(sessionId: string) {
  return invokeRpc<CommercialDemoSnapshot>("commercial_demo_create_order", {
    p_session_id: sessionId,
    p_customer_name: "Sophie Martin",
    p_delivery_address: "18 rue de la Démonstration, 1204 Genève",
    p_items: DEMO_ITEMS,
    p_payment_method: "stripe_test",
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
  const { data, error } = await invokeSupabaseFunction<CommercialDemoCheckoutCreateResult>("commercial-demo-checkout", {
    body: {
      action: "create",
      demo_restaurant_id: demoRestaurantId,
      demo_session_id: demoSessionId,
      return_url: returnUrl,
    },
  });
  if (error) {
    throw await toFunctionApiError(error, "Le paiement Stripe Test ne peut pas être ouvert.");
  }
  return assertTestMode(data) as CommercialDemoCheckoutCreateResult;
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
  const { data, error } = await invokeSupabaseFunction<CommercialDemoCheckoutConfirmResult>("commercial-demo-checkout", {
    body: {
      action: "confirm",
      demo_restaurant_id: demoRestaurantId,
      demo_session_id: demoSessionId,
      stripe_session_id: stripeSessionId,
    },
  });
  if (error) {
    throw await toFunctionApiError(error, "Le paiement Stripe Test n'a pas pu être vérifié.");
  }
  return assertTestMode(data) as CommercialDemoCheckoutConfirmResult;
}

export function subscribeToCommercialDemoSession(
  sessionId: string,
  onChange: () => void,
  onStatus: (status: CommercialDemoRealtimeStatus) => void = () => undefined,
) {
  const supabase = getSupabase();
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

export function getCommercialDemoPresetItems() {
  return DEMO_ITEMS;
}
