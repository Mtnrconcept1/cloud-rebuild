type LoggerLike = {
  warn?: (event: string, data?: Record<string, unknown>) => void;
};

function isPgUniqueViolation(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "23505";
}

export async function recordZeroAttenteChargeIfMissing(input: {
  adminClient: any;
  userId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  reservationId: string;
  metadata: Record<string, unknown>;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    userId,
    sessionId,
    paymentIntentId,
    amount,
    currency,
    reservationId,
    metadata,
    log,
  } = input;

  const { data: existingSessionTransaction, error: existingSessionError } = await adminClient
    .from("payment_transactions")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .eq("type", "charge")
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();

  if (existingSessionError) {
    throw existingSessionError;
  }

  if (existingSessionTransaction?.id) {
    return { inserted: false, reason: "session_exists" as const };
  }

  const { data: existingReservationTransaction, error: existingReservationError } = await adminClient
    .from("payment_transactions")
    .select("id, stripe_checkout_session_id")
    .eq("type", "charge")
    .eq("status", "succeeded")
    .filter("metadata->>reservation_id", "eq", reservationId)
    .limit(1)
    .maybeSingle();

  if (existingReservationError) {
    throw existingReservationError;
  }

  if (existingReservationTransaction?.id) {
    log?.warn?.("duplicate_zero_attente_reservation_charge_skipped", {
      reservation_id: reservationId,
      existing_session_id: existingReservationTransaction.stripe_checkout_session_id,
      incoming_session_id: sessionId,
    });
    return { inserted: false, reason: "reservation_exists" as const };
  }

  const { error: insertError } = await adminClient
    .from("payment_transactions")
    .insert({
      user_id: userId,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      amount,
      currency,
      type: "charge",
      status: "succeeded",
      metadata,
    });

  if (insertError) {
    if (isPgUniqueViolation(insertError)) {
      log?.warn?.("duplicate_zero_attente_session_charge_skipped", {
        reservation_id: reservationId,
        session_id: sessionId,
      });
      return { inserted: false, reason: "unique_conflict" as const };
    }

    throw insertError;
  }

  return { inserted: true, reason: null };
}
