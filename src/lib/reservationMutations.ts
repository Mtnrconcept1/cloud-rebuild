import { supabase } from "@/integrations/supabase/client";

type SafeReservationCreateRow = {
  reservation_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

type SafeReservationStatusRow = {
  updated: boolean | null;
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
  notes?: string | null;
};

type ReservationCreateResult =
  | { ok: true; reservationId: string }
  | { ok: false; errorCode: string; errorMessage: string };

type ReservationStatusResult =
  | { ok: true }
  | { ok: false; errorCode: string; errorMessage: string };

const getFirstRow = <T>(data: T[] | T | null | undefined): T | null => {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
};

export async function createReservationWithValidation(
  input: CreateReservationInput,
): Promise<ReservationCreateResult> {
  // Call supabase.rpc as a method (not detached) to preserve `this` context.
  // Supabase internally accesses `this.rest` which breaks if `this` is lost.
  const { data, error } = await (supabase.rpc as any)("validate_and_create_reservation_safe", {
    p_restaurant_id: input.restaurantId,
    p_date: input.date,
    p_time: input.time,
    p_party_size: input.partySize,
    p_feature: input.feature,
    p_metadata: input.metadata,
    p_notes: input.notes ?? null,
  });

  if (error) throw error;

  const result = getFirstRow<SafeReservationCreateRow>(data);
  if (!result) {
    throw new Error("Reponse serveur invalide.");
  }

  if (result.error_message) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message,
    };
  }

  if (!result.reservation_id) {
    throw new Error("Reservation non creee.");
  }

  return {
    ok: true,
    reservationId: result.reservation_id,
  };
}

export async function updateRestaurantReservationStatus(
  reservationId: string,
  status: string,
): Promise<ReservationStatusResult> {
  const { data, error } = await (supabase.rpc as any)("update_restaurant_reservation_status_safe", {
    p_reservation_id: reservationId,
    p_status: status,
  });

  if (error) throw error;

  const result = getFirstRow<SafeReservationStatusRow>(data);
  if (!result) {
    throw new Error("Reponse serveur invalide.");
  }

  if (!result.updated) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Mise a jour impossible.",
    };
  }

  return { ok: true };
}
