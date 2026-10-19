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
  guaranteeAccepted?: boolean;
};

export type ReservationCreateResult =
  | { ok: true; reservationId: string; requiresCardGuarantee?: false }
  | { ok: true; requiresCardGuarantee: true; checkoutUrl: string; feeAmountCents: number }
  | { ok: false; errorCode: string; errorMessage: string };

export type ReservationGuaranteeQuote = {
  required: boolean;
  cancellationCount: number;
  reason: "large_party" | "repeated_cancellations" | "large_party_and_repeated_cancellations" | "none";
  feeAmountCents: number;
};

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
      guarantee_accepted: input.guaranteeAccepted === true,
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
    requires_card_guarantee?: boolean;
    checkout_url?: string;
    fee_amount_cents?: number;
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

  if (result.requires_card_guarantee) {
    if (!result.checkout_url || !/^https:\/\//.test(result.checkout_url)) {
      throw new Error("Adresse bancaire Stripe invalide.");
    }
    return {
      ok: true,
      requiresCardGuarantee: true,
      checkoutUrl: result.checkout_url,
      feeAmountCents: Number(result.fee_amount_cents || 0),
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

export async function getReservationGuaranteeQuote(
  partySize: number,
): Promise<ReservationGuaranteeQuote> {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    throw new Error("Nombre de convives invalide.");
  }
  const { data, error } = await getSupabase().functions.invoke("create-reservation", {
    body: { action: "quote", party_size: partySize },
  });
  if (error) throw new Error("Vérification de garantie bancaire indisponible.");
  if (!data || data.ok !== true || typeof data.required !== "boolean") {
    throw new Error("Vérification de garantie bancaire indisponible.");
  }
  return {
    required: data.required,
    cancellationCount: Number(data.cancellation_count || 0),
    reason: data.reason || "none",
    feeAmountCents: Number(data.fee_amount_cents || 0),
  };
}

export async function finalizeReservationGuaranteeSession(
  checkoutSessionId: string,
): Promise<ReservationCreateResult> {
  if (!/^cs_live_[a-zA-Z0-9_]+$/.test(checkoutSessionId)) {
    throw new Error("Session bancaire invalide.");
  }
  const { data, error } = await getSupabase().functions.invoke("create-reservation", {
    body: { action: "finalize", checkout_session_id: checkoutSessionId },
  });
  if (error) throw new Error("La confirmation de la garantie bancaire a échoué.");
  if (!data || data.ok !== true || typeof data.reservation_id !== "string") {
    return {
      ok: false,
      errorCode: data?.error_code || "reservation_not_confirmed",
      errorMessage: data?.error_message || "Le créneau n'est plus disponible. Aucun débit n'a été effectué.",
    };
  }
  return { ok: true, reservationId: data.reservation_id };
}

export async function markReservationHonored(
  reservationId: string,
  attributedTableRevenueChf: number,
): Promise<ReservationMutationResult & { feeChf?: number }> {
  const { data, error } = await (getSupabase().rpc as any)("mark_reservation_honored", {
    p_reservation_id: reservationId,
    p_attributed_table_revenue_chf: attributedTableRevenueChf,
  });

  if (error) throw error;

  const result = getFirstRow<{
    updated: boolean | null;
    error_code: string | null;
    error_message: string | null;
    fee_chf: number | null;
  }>(data);
  if (!result) throw new Error("Réponse serveur invalide.");

  if (!result.updated) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Confirmation impossible.",
    };
  }

  return { ok: true, feeChf: Number(result.fee_chf || 0) };
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

/** Seating is operational: an arrival that has already been billed must remain installable. */
export async function seatRestaurantReservation(reservationId: string): Promise<ReservationStatusResult> {
  const { data, error } = await (getSupabase().rpc as any)("restaurant_seat_floor_plan_reservation", {
    p_reservation_id: reservationId,
  });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("L’installation des clients doit être activée sur le serveur. La réservation est conservée ; contactez l’assistance TOK.");
    }
    throw error;
  }
  const result = getFirstRow<SafeReservationStatusRow>(data);
  if (!result) throw new Error("Le serveur n’a pas confirmé l’installation du client.");
  return result.updated
    ? { ok: true }
    : { ok: false, errorCode: result.error_code || "validation_error", errorMessage: result.error_message || "Installation impossible." };
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
