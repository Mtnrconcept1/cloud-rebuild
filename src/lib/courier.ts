import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

export const COURIER_ACTIVE_JOB_STATUSES = [
  "accepted",
  "arriving_pickup",
  "picked_up",
  "arriving_dropoff",
] as const;

export const COURIER_JOB_STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: "En recherche", tone: "bg-muted text-muted-foreground" },
  searching: { label: "Recherche coursier", tone: "bg-muted text-muted-foreground" },
  assigned: { label: "Assignee", tone: "bg-sky-100 text-sky-700" },
  accepted: { label: "Acceptee", tone: "bg-blue-100 text-blue-700" },
  arriving_pickup: { label: "Vers le restaurant", tone: "bg-amber-100 text-amber-700" },
  picked_up: { label: "Commande recuperee", tone: "bg-indigo-100 text-indigo-700" },
  arriving_dropoff: { label: "Vers le client", tone: "bg-violet-100 text-violet-700" },
  delivered: { label: "Livree", tone: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Annulee", tone: "bg-red-100 text-red-700" },
  expired: { label: "Expiree", tone: "bg-red-100 text-red-700" },
  no_courier: { label: "Aucun coursier", tone: "bg-red-100 text-red-700" },
};

export const COURIER_APPROVAL_STATUS_META: Record<string, { label: string; tone: string }> = {
  pending_approval: { label: "En attente d'approbation", tone: "bg-amber-100 text-amber-700" },
  approved: { label: "Approuve", tone: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "Suspendu", tone: "bg-red-100 text-red-700" },
  rejected: { label: "Refuse", tone: "bg-red-100 text-red-700" },
};

export const COURIER_VEHICLE_OPTIONS = [
  { value: "bicycle", label: "Velo" },
  { value: "scooter", label: "Scooter" },
  { value: "car", label: "Voiture" },
  { value: "walk", label: "A pied" },
] as const;

export const COURIER_WEEK_DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
] as const;

export type CourierShiftInput = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export function formatCourierName(profile: any) {
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || profile?.phone || "Coursier";
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

export function getOfferExpiresAt(offeredAt: string, timeoutSeconds: number) {
  return new Date(Date.parse(offeredAt) + (timeoutSeconds || 45) * 1000);
}

export function getOfferTimeLeftSeconds(
  offeredAt: string,
  timeoutSeconds: number,
  nowMs = Date.now(),
) {
  return Math.max(
    0,
    Math.floor((getOfferExpiresAt(offeredAt, timeoutSeconds).getTime() - nowMs) / 1000),
  );
}

export function getNextCourierJobAction(status: string) {
  switch (status) {
    case "accepted":
      return { nextStatus: "arriving_pickup", label: "Je pars au restaurant" };
    case "arriving_pickup":
      return { nextStatus: "picked_up", label: "Commande recuperee" };
    case "picked_up":
      return { nextStatus: "arriving_dropoff", label: "Je pars chez le client" };
    case "arriving_dropoff":
      return { nextStatus: "delivered", label: "Confirmer la livraison" };
    default:
      return null;
  }
}

export function mapCourierEarningTypeLabel(type: string) {
  switch (type) {
    case "delivery":
      return "Course";
    case "tip":
      return "Pourboire";
    case "bonus":
      return "Bonus";
    case "payout":
      return "Virement";
    case "adjustment":
      return "Ajustement";
    case "penalty":
      return "Penalite";
    default:
      return type;
  }
}

async function getFreshAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;

  const expiresSoon = Boolean(
    session?.expires_at && (session.expires_at * 1000) <= (Date.now() + 60_000),
  );

  if (!session || expiresSoon) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new Error("Session expirée. Reconnectez-vous.");
    }
    session = refreshedData.session;
  }

  if (!session?.access_token) {
    throw new Error("Session expirée. Reconnectez-vous.");
  }

  return session.access_token;
}

function isUnauthorizedFunctionsError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: number }).status === 401,
  );
}

async function callCourierPortal<T>(accessToken: string, payload: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/courier-portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await response.text();
  let parsedBody: any = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = { error: rawBody };
    }
  }

  if (!response.ok) {
    const error = new Error(parsedBody?.error || `Erreur ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return parsedBody as T;
}

export async function invokeCourierPortal<T>(action: string, payload: Record<string, unknown> = {}) {
  const requestPayload = {
    action,
    ...payload,
  };

  let accessToken = await getFreshAccessToken();
  let data: T;

  try {
    data = await callCourierPortal<T>(accessToken, requestPayload);
  } catch (error) {
    if (!isUnauthorizedFunctionsError(error)) {
      throw error;
    }

    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    accessToken = refreshedData.session?.access_token || "";

    if (refreshError || !accessToken) {
      throw new Error("Session expirée. Reconnectez-vous.");
    }

    data = await callCourierPortal<T>(accessToken, requestPayload);
  }

  if (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string") {
    throw new Error((data as { error: string }).error);
  }

  return data;
}

export async function ensureCourierProfile() {
  const response = await invokeCourierPortal<{ courier: any }>("ensure_profile");
  return response.courier;
}

export async function saveCourierProfile(payload: {
  first_name: string;
  last_name: string;
  phone: string;
  vehicle_type: string;
  license_plate: string;
  iban: string;
  shifts: CourierShiftInput[];
}) {
  return invokeCourierPortal<{ courier: any; shifts: any[] }>("save_profile", payload);
}

export async function syncCourierPresence(payload: {
  isOnline?: boolean;
  lat?: number;
  lng?: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  activeDispatchJobId?: string | null;
}) {
  const response = await invokeCourierPortal<{ courier: any }>("sync_presence", {
    is_online: payload.isOnline,
    lat: payload.lat,
    lng: payload.lng,
    heading: payload.heading ?? null,
    speed: payload.speed ?? null,
    accuracy: payload.accuracy ?? null,
    active_dispatch_job_id: payload.activeDispatchJobId ?? null,
  });
  return response.courier;
}

export async function respondToDispatchAttempt(attemptId: string, decision: "accept" | "decline") {
  return invokeCourierPortal<{ status: string; dispatch_job?: any }>("respond_attempt", {
    attempt_id: attemptId,
    decision,
  });
}

export async function updateCourierJobStatus(dispatchJobId: string, status: string) {
  return invokeCourierPortal<{ dispatch_job: any }>("update_job_status", {
    dispatch_job_id: dispatchJobId,
    status,
  });
}

export async function verifyCourierDelivery(
  dispatchJobId: string,
  proofCode: string,
  verificationMethod: "qr" | "manual_code",
) {
  return invokeCourierPortal<{ dispatch_job: any; proof: any }>("verify_delivery_proof", {
    dispatch_job_id: dispatchJobId,
    proof_code: proofCode,
    verification_method: verificationMethod,
  });
}

export async function fetchCourierProfile(userId: string) {
  const { data, error } = await supabase
    .from("couriers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchCourierOffers(courierId: string) {
  const { data, error } = await (supabase.from("dispatch_attempts") as any)
    .select(`
      id,
      dispatch_job_id,
      status,
      offered_at,
      responded_at,
      timeout_seconds,
      distance_to_pickup_meters,
      estimated_earnings,
      dispatch_jobs!inner(
        id,
        order_id,
        status,
        created_at,
        assigned_at,
        accepted_at,
        earnings_base,
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        route_geometry,
        orders!inner(
          id,
          order_number,
          delivery_address,
          status,
          total_amount,
          tip_amount,
          metadata,
          created_at,
          restaurants!inner(
            id,
            name,
            address,
            city,
            latitude,
            longitude,
            image_url,
            phone
          )
        )
      )
    `)
    .eq("courier_id", courierId)
    .eq("status", "pending")
    .order("offered_at", { ascending: false });

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchCourierActiveJobs(courierId: string) {
  const { data, error } = await (supabase.from("dispatch_jobs") as any)
    .select(`
      id,
      order_id,
      courier_id,
      status,
      created_at,
      updated_at,
      assigned_at,
      accepted_at,
      picked_up_at,
      delivered_at,
      earnings_base,
      earnings_tip,
      earnings_bonus,
      distance_meters,
      estimated_duration_minutes,
      actual_duration_minutes,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      route_geometry,
      orders!inner(
        id,
        order_number,
        delivery_address,
        status,
        total_amount,
        tip_amount,
        metadata,
        estimated_delivery_at,
        actual_delivered_at,
        created_at,
        restaurants!inner(
          id,
          name,
          address,
          city,
          latitude,
          longitude,
          image_url,
          phone
        ),
        delivery_tracking(
          status,
          driver_name,
          driver_phone,
          current_lat,
          current_lng,
          estimated_arrival,
          picked_up_at,
          delivered_at
        )
      )
    `)
    .eq("courier_id", courierId)
    .in("status", [...COURIER_ACTIVE_JOB_STATUSES])
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchCourierRecentJobs(courierId: string) {
  const { data, error } = await (supabase.from("dispatch_jobs") as any)
    .select(`
      id,
      order_id,
      status,
      created_at,
      updated_at,
      delivered_at,
      earnings_base,
      earnings_tip,
      earnings_bonus,
      actual_duration_minutes,
      orders!inner(
        id,
        order_number,
        delivery_address,
        total_amount,
        created_at,
        restaurants!inner(
          id,
          name,
          address,
          city
        )
      )
    `)
    .eq("courier_id", courierId)
    .in("status", ["delivered", "cancelled"])
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchCourierEarnings(courierId: string) {
  const { data, error } = await supabase
    .from("courier_earnings")
    .select("*")
    .eq("courier_id", courierId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data || [];
}

export async function fetchCourierShifts(courierId: string) {
  const { data, error } = await supabase
    .from("courier_shifts")
    .select("*")
    .eq("courier_id", courierId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return data || [];
}
