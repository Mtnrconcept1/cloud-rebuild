-- Make abandon_payment_attempt_session idempotent for replayed terminal events.
--
-- checkout.session.expired is terminal and replayable: Stripe redelivers it for
-- up to ~3 days until the endpoint answers 2xx. stripe-webhook turns any RPC
-- error into a 500, so every state in which the abandonment was already done —
-- or is simply moot — produced an endless redelivery loop:
--
--   evt_1U0tRIGTQigE34suPFB7vkdX -> attempt 3e316759 (state=cancelled, still
--     holding cs_live_c1Cx4U...) -> 23514 payment_attempt_session_mismatch
--   evt_1U0WHrGTQigE34suQCdBF2d4 -> attempt 30c6482c (state=cancelled, session
--     already abandoned at generation 1) -> 40001 payment_attempt_lease_lost
--   evt_1TxHYsGTQigE34suXB3u6qJM -> retried 2026-07-26 .. 2026-07-28, same shape
--
-- 40001 (serialization_failure) made it worse: that class means "transient,
-- retry me", so every retry layer above treated a permanent state as retryable.
--
-- The fix is to answer "already done" instead of raising, in the two cases where
-- nothing can be paid and nothing is left to do:
--
--   1. The session being abandoned is already recorded in stripe_session_history
--      -> this exact abandonment already happened. Checked before the finalized
--      guard, so a late expired event for generation N cannot loop forever after
--      generation N+1 was paid.
--   2. The attempt is cancelled -> terminal and unpayable, so abandoning it is
--      moot whatever the bound session says.
--
-- Every guard that protects a payable session is kept: finalized still raises
-- (a paid attempt must never be silently abandoned), a session_bound attempt
-- pointing at a different live session still raises the mismatch, and a pending
-- attempt with a lost lease still raises 40001 for an unknown session.
--
-- Two details carried over from the live definition on purpose:
--   * SET lock_timeout = '5s' from 20260804204953. CREATE OR REPLACE FUNCTION
--     rewrites the SET clauses, so omitting it here would silently revert that
--     migration and restore the unbounded lock wait.
--   * The live body also INSERTed into public.payment_attempt_runtime_events
--     right before the 40001 RAISE. That insert can never persist — the RAISE
--     aborts the transaction and rolls it back — and the table has 0 rows. It is
--     dropped here rather than carried over as dead code. Neither the table nor
--     that instrumentation exists in this repository; the table itself is left
--     in place and untouched.

CREATE OR REPLACE FUNCTION public.abandon_payment_attempt_session(
  p_attempt_id uuid,
  p_session_id text,
  p_reason text,
  p_lease_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_session_id text := NULLIF(btrim(COALESCE(p_session_id, '')), '');
  v_history jsonb;
BEGIN
  IF p_attempt_id IS NULL OR v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_session_abandonment';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payment-attempt:' || p_attempt_id::text, 0));
  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_attempt_not_found';
  END IF;

  -- Already abandoned for this exact session: replay, not an error. Deliberately
  -- ahead of the finalized guard so a late expired event for an older generation
  -- cannot keep looping once a later generation has been paid.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(v_attempt.metadata -> 'stripe_session_history', '[]'::jsonb)
    ) AS entry
    WHERE entry ->> 'checkout_session_id' = v_session_id
  ) THEN
    RETURN private_finance.payment_attempt_json(v_attempt, true, false, false);
  END IF;

  IF v_attempt.state = 'finalized' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'finalized_attempt_cannot_be_abandoned';
  END IF;

  -- Terminal and unpayable: nothing to abandon, so report success rather than
  -- feeding another Stripe redelivery.
  IF v_attempt.state = 'cancelled' THEN
    RETURN private_finance.payment_attempt_json(v_attempt, true, false, false);
  END IF;

  IF v_attempt.stripe_checkout_session_id IS NOT NULL THEN
    IF v_attempt.state <> 'session_bound'
      OR v_attempt.stripe_checkout_session_id IS DISTINCT FROM v_session_id
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_session_mismatch';
    END IF;
  ELSE
    -- Covers the narrow failure window where Stripe created the session but the
    -- bind RPC failed.  Only the still-active creator lease may abandon it.
    IF v_attempt.state <> 'pending'
      OR p_lease_token IS NULL
      OR v_attempt.lease_token IS DISTINCT FROM p_lease_token
      OR v_attempt.lease_expires_at IS NULL
      OR v_attempt.lease_expires_at <= v_now
    THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'payment_attempt_lease_lost';
    END IF;
  END IF;

  v_history := COALESCE(v_attempt.metadata -> 'stripe_session_history', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'generation', v_attempt.generation,
      'checkout_session_id', v_session_id,
      'payment_intent_id', v_attempt.stripe_payment_intent_id,
      'subscription_id', v_attempt.stripe_subscription_id,
      'session_expires_at', v_attempt.session_expires_at,
      'abandoned_at', v_now,
      'reason', NULLIF(btrim(COALESCE(p_reason, '')), '')
    ));

  UPDATE public.payment_attempts
  SET state = CASE
        WHEN kind = 'order'
          OR lower(COALESCE(metadata ->> 'cancellation_requested', 'false')) = 'true' THEN 'cancelled'
        ELSE 'pending'
      END,
      generation = generation + 1,
      retryable = kind <> 'order'
        AND lower(COALESCE(metadata ->> 'cancellation_requested', 'false')) <> 'true',
      stripe_checkout_session_id = NULL,
      stripe_payment_intent_id = NULL,
      stripe_subscription_id = NULL,
      session_expires_at = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error_code = 'stripe_session_abandoned',
      last_error_message = left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 4000),
      last_error_at = v_now,
      cancelled_at = CASE
        WHEN kind = 'order'
          OR lower(COALESCE(metadata ->> 'cancellation_requested', 'false')) = 'true'
          THEN COALESCE(cancelled_at, v_now)
        ELSE cancelled_at
      END,
      metadata = jsonb_set(metadata, '{stripe_session_history}', v_history, true),
      updated_at = v_now
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  RETURN private_finance.payment_attempt_json(v_attempt, true, false, false);
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_payment_attempt_session(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
