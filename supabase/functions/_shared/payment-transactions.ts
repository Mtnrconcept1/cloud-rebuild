type LoggerLike = {
  warn?: (event: string, data?: Record<string, unknown>) => void;
};

export function isPgUniqueViolation(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "23505";
}

export async function recordOrderChargeIfMissing(input: {
  adminClient: any;
  orderId: string;
  userId: string | null;
  sessionId: string;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
  stripeMode?: "live" | "test" | null;
  paymentAttemptId?: string | null;
  stripeEventId?: string | null;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    orderId,
    userId,
    sessionId,
    paymentIntentId,
    amount,
    currency,
    metadata,
    stripeMode = null,
    paymentAttemptId = null,
    stripeEventId = null,
    log,
  } = input;

  const { data: existingTransaction, error: existingTransactionError } = await adminClient
    .from("payment_transactions")
    .select("id")
    .eq("order_id", orderId)
    .eq("stripe_checkout_session_id", sessionId)
    .eq("stripe_mode", stripeMode || "unknown")
    .eq("type", "charge")
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();

  if (existingTransactionError) {
    throw existingTransactionError;
  }

  if (existingTransaction?.id) {
    return { inserted: false, reason: "existing_order_charge" as const };
  }

  const { error: insertError } = await adminClient
    .from("payment_transactions")
    .insert({
      order_id: orderId,
      user_id: userId,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_mode: stripeMode || "unknown",
      payment_attempt_id: paymentAttemptId,
      stripe_event_id: stripeEventId,
      amount,
      currency,
      type: "charge",
      status: "succeeded",
      metadata,
    });

  if (insertError) {
    if (isPgUniqueViolation(insertError)) {
      log?.warn?.("duplicate_order_charge_skipped", {
        order_id: orderId,
        session_id: sessionId,
      });
      return { inserted: false, reason: "unique_conflict" as const };
    }

    throw insertError;
  }

  return { inserted: true, reason: null };
}

export async function recordReservationChargeIfMissing(input: {
  adminClient: any;
  userId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  reservationId: string;
  feature: string;
  metadata: Record<string, unknown>;
  stripeMode?: "live" | "test" | null;
  paymentAttemptId?: string | null;
  stripeEventId?: string | null;
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
    feature,
    metadata,
    stripeMode = null,
    paymentAttemptId = null,
    stripeEventId = null,
    log,
  } = input;

  const { data: existingSessionTransaction, error: existingSessionError } = await adminClient
    .from("payment_transactions")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .eq("stripe_mode", stripeMode || "unknown")
    .eq("type", "charge")
    .eq("status", "succeeded")
    .filter("metadata->>reservation_id", "eq", reservationId)
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
    .eq("stripe_mode", stripeMode || "unknown")
    .eq("type", "charge")
    .eq("status", "succeeded")
    .filter("metadata->>reservation_id", "eq", reservationId)
    .limit(1)
    .maybeSingle();

  if (existingReservationError) {
    throw existingReservationError;
  }

  if (existingReservationTransaction?.id) {
    log?.warn?.("duplicate_reservation_charge_skipped", {
      feature,
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
      stripe_mode: stripeMode || "unknown",
      payment_attempt_id: paymentAttemptId,
      stripe_event_id: stripeEventId,
      amount,
      currency,
      type: "charge",
      status: "succeeded",
      metadata: {
        ...metadata,
        reservation_id: reservationId,
        feature,
      },
    });

  if (insertError) {
    if (isPgUniqueViolation(insertError)) {
      log?.warn?.("duplicate_reservation_session_charge_skipped", {
        feature,
        reservation_id: reservationId,
        session_id: sessionId,
      });
      return { inserted: false, reason: "unique_conflict" as const };
    }

    throw insertError;
  }

  return { inserted: true, reason: null };
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
  stripeMode?: "live" | "test" | null;
  paymentAttemptId?: string | null;
  stripeEventId?: string | null;
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
    stripeMode = null,
    paymentAttemptId = null,
    stripeEventId = null,
    log,
  } = input;

  return recordReservationChargeIfMissing({
    adminClient,
    userId,
    sessionId,
    paymentIntentId,
    amount,
    currency,
    reservationId,
    feature: "zero-attente",
    metadata,
    stripeMode,
    paymentAttemptId,
    stripeEventId,
    log,
  });
}
