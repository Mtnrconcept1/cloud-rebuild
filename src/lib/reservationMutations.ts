import { getSupabase } from "@/integrations/supabase/client";

type SafeReservationStatusRow = {
  updated: boolean | null;
  error_code: string | null;
  error_message: string | null;
};

type SafeReservationMutationRow = {
  ok: boolean | null;
  error_code: string | null;
  error_message: string | null;
};

type CreateReservationInput = {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
  feature: string;
  metadata: Record<string, unknown>;
  acquisitionSource?: "google" | "restaurant_website" | "qr_code" | "instagram" | null;
  acquisitionChannelToken?: string | null;
  notes?: string | null;
  progressiveOfferId?: string | null;
};

type ReservationCreateResult =
  | { ok: true; reservationId: string }
  | { ok: false; errorCode: string; errorMessage: string };

export type ReservationStatusResult = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type ReservationMutationResult = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type CancellationReasonCode =
  | "closure"
  | "overbooking"
  | "kitchen_issue"
  | "customer_unreachable"
  | "private_event"
  | "duplicate_error"
  | "other";

export const CANCELLATION_REASONS: Array<{ code: CancellationReasonCode; label: string }> = [
  { code: "closure", label: "Fermeture exceptionnelle" },
  { code: "overbooking", label: "Surbooking / table indisponible" },
  { code: "kitchen_issue", label: "Probleme de cuisine" },
  { code: "customer_unreachable", label: "Client injoignable" },
  { code: "private_event", label: "Evenement prive prioritaire" },
  { code: "duplicate_error", label: "Doublon ou erreur de saisie" },
  { code: "other", label: "Autre" },
];

const getFirstRow = <T>(data: T[] | T | null | undefined): T | null => {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
};

export const PROGRESSIVE_OFFER_REENTRY_MESSAGE =
  "Vous vous etes deja desinscrit de cette offre progressive pour ce jour. Vous ne pouvez pas vous reinscrire.";

const getReservationErrorMessage = (
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
  fallback: string,
) => {
  const normalized = `${errorCode ?? ""} ${errorMessage ?? ""}`;
  if (normalized.includes("progressive_offer_reentry_blocked")) {
    return PROGRESSIVE_OFFER_REENTRY_MESSAGE;
  }

  return errorMessage || fallback;
};

export async function createReservationWithValidation(
  input: CreateReservationInput,
): Promise<ReservationCreateResult> {
  const { data, error } = await getSupabase().functions.invoke("create-reservation", {
    body: {
      restaurant_id: input.restaurantId,
      date: input.date,
      time: input.time,
      party_size: input.partySize,
      feature: input.feature,
      metadata: input.metadata,
      acquisition_source: input.acquisitionSource ?? null,
      acquisition_channel_token: input.acquisitionChannelToken ?? null,
      notes: input.notes ?? null,
      progressive_offer_id: input.progressiveOfferId ?? null,
    },
  });

  if (error) throw error;

  if (!data || typeof data !== "object") {
    throw new Error("Réponse serveur invalide.");
  }

  const result = data as {
    ok?: boolean;
    reservationId?: string;
    reservation_id?: string;
    error_code?: string;
    error_message?: string;
  };

  if (result.ok === false || result.error_message) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: getReservationErrorMessage(
        result.error_code,
        result.error_message,
        "Reservation impossible.",
      ),
    };
  }

  const reservationId = result.reservationId || result.reservation_id;
  if (!reservationId) {
    throw new Error("Réservation non créée.");
  }

  return {
    ok: true,
    reservationId,
  };
}

export async function updateRestaurantReservationStatus(
  reservationId: string,
  status: string,
): Promise<ReservationStatusResult> {
  const { data, error } = await (getSupabase().rpc as any)("update_restaurant_reservation_status_safe", {
    p_reservation_id: reservationId,
    p_status: status,
  });

  if (error) throw error;

  const result = getFirstRow<SafeReservationStatusRow>(data);
  if (!result) {
    throw new Error("Réponse serveur invalide.");
  }

  if (!result.updated) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Mise à jour impossible.",
    };
  }

  return { ok: true };
}

export async function cancelReservationByCustomer(
  reservationId: string,
): Promise<ReservationMutationResult> {
  const { data, error } = await (getSupabase().rpc as any)("cancel_reservation_by_customer", {
    p_reservation_id: reservationId,
  });

  if (error) throw error;

  const result = getFirstRow<SafeReservationMutationRow>(data);
  if (!result) {
    throw new Error("Réponse serveur invalide.");
  }

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Annulation impossible.",
    };
  }

  return { ok: true };
}

export async function cancelReservationByRestaurant(
  reservationId: string,
  reasonCode: CancellationReasonCode,
  reasonDetails: string | null,
): Promise<ReservationMutationResult> {
  const { data, error } = await (getSupabase().rpc as any)("cancel_reservation_by_restaurant", {
    p_reservation_id: reservationId,
    p_reason_code: reasonCode,
    p_reason_details: reasonDetails,
  });

  if (error) throw error;

  const result = getFirstRow<SafeReservationMutationRow>(data);
  if (!result) {
    throw new Error("Réponse serveur invalide.");
  }

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Annulation impossible.",
    };
  }

  return { ok: true };
}
