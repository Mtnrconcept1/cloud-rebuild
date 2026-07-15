-- Payment integrity state machine.
--
-- This migration deliberately keeps every server mutation behind service-role-only
-- SECURITY DEFINER RPCs.  It provides durable operation idempotency, recoverable
-- webhook leases, an internal finance outbox, strict Stripe test/live boundaries,
-- and append-only accounting primitives for refunds, disputes, developer share,
-- and commercial compensation.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private_finance;
REVOKE ALL ON SCHEMA private_finance FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recoverable Stripe webhook claims
-- ---------------------------------------------------------------------------

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS lock_token uuid,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN processed_at DROP NOT NULL,
  ALTER COLUMN processed_at DROP DEFAULT;

UPDATE public.stripe_webhook_events
SET processed_at = NULL
WHERE processing_status IN ('processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_reclaimable
  ON public.stripe_webhook_events (locked_until, last_attempt_at)
  WHERE processing_status = 'processing';

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_mode_status
  ON public.stripe_webhook_events (livemode, processing_status, last_attempt_at DESC);

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_claimed boolean := false;
  v_duplicate boolean := false;
  v_in_progress boolean := false;
BEGIN
  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stripe_event_id_required';
  END IF;
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stripe_event_type_required';
  END IF;
  IF p_livemode IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stripe_event_livemode_required';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_webhook_lease_seconds';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('stripe-event:' || p_event_id, 0));

  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.stripe_webhook_events (
      event_id,
      event_type,
      livemode,
      processed_at,
      processing_status,
      first_seen_at,
      processing_started_at,
      last_attempt_at,
      attempt_count,
      last_error,
      last_error_at,
      lock_token,
      locked_until,
      completed_at
    ) VALUES (
      p_event_id,
      p_event_type,
      p_livemode,
      NULL,
      'processing',
      v_now,
      v_now,
      v_now,
      1,
      NULL,
      NULL,
      v_token,
      v_now + make_interval(secs => p_lease_seconds),
      NULL
    )
    RETURNING * INTO v_event;
    v_claimed := true;
  ELSE
    IF v_event.event_type IS DISTINCT FROM p_event_type
      OR v_event.livemode IS DISTINCT FROM p_livemode
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'stripe_event_identity_mismatch';
    END IF;

    IF v_event.processing_status = 'succeeded' THEN
      v_duplicate := true;
    ELSIF v_event.processing_status = 'processing'
      AND v_event.locked_until IS NOT NULL
      AND v_event.locked_until > v_now
    THEN
      -- A healthy worker still owns this event.  This is not a completed
      -- duplicate: the HTTP handler must return non-2xx so Stripe retries if
      -- the original worker crashes before completing its lease.
      v_in_progress := true;
    ELSE
      UPDATE public.stripe_webhook_events
      SET processing_status = 'processing',
          processed_at = NULL,
          processing_started_at = v_now,
          last_attempt_at = v_now,
          attempt_count = GREATEST(COALESCE(attempt_count, 0), 0) + 1,
          last_error = NULL,
          last_error_at = NULL,
          lock_token = v_token,
          locked_until = v_now + make_interval(secs => p_lease_seconds),
          completed_at = NULL
      WHERE event_id = p_event_id
      RETURNING * INTO v_event;
      v_claimed := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'claimed', v_claimed,
    'duplicate', v_duplicate,
    'in_progress', v_in_progress,
    'event_id', v_event.event_id,
    'processing_status', v_event.processing_status,
    'lock_token', CASE WHEN v_claimed THEN v_event.lock_token ELSE NULL END,
    'locked_until', CASE WHEN v_claimed THEN v_event.locked_until ELSE NULL END,
    'attempt_count', v_event.attempt_count,
    'livemode', v_event.livemode
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_stripe_webhook_event(
  p_event_id text,
  p_lock_token uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_event_id IS NULL OR btrim(p_event_id) = '' OR p_lock_token IS NULL OR p_success IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_webhook_completion';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('stripe-event:' || p_event_id, 0));

  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'stripe_event_not_claimed';
  END IF;

  IF v_event.processing_status <> 'processing'
    OR v_event.lock_token IS DISTINCT FROM p_lock_token
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'stripe_event_lease_lost';
  END IF;

  UPDATE public.stripe_webhook_events
  SET processing_status = CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,
      processed_at = CASE WHEN p_success THEN v_now ELSE NULL END,
      completed_at = v_now,
      last_attempt_at = v_now,
      last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, 'unknown_error'), 4000) END,
      last_error_at = CASE WHEN p_success THEN NULL ELSE v_now END,
      lock_token = NULL,
      locked_until = NULL
  WHERE event_id = p_event_id
  RETURNING * INTO v_event;

  RETURN jsonb_build_object(
    'event_id', v_event.event_id,
    'processing_status', v_event.processing_status,
    'processed_at', v_event.processed_at,
    'completed_at', v_event.completed_at,
    'attempt_count', v_event.attempt_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Durable business-operation payment attempts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  mode text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  amount_cents integer,
  currency text NOT NULL DEFAULT 'CHF',
  generation integer NOT NULL DEFAULT 1,
  acquire_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  retryable boolean NOT NULL DEFAULT true,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  stripe_refund_id text,
  session_expires_at timestamptz,
  request_generation integer,
  request_fingerprint text,
  request_snapshot jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_attempts_operation_key_not_blank
    CHECK (btrim(operation_key) <> '' AND char_length(operation_key) <= 255),
  CONSTRAINT payment_attempts_kind_not_blank
    CHECK (btrim(kind) <> '' AND char_length(kind) <= 100),
  CONSTRAINT payment_attempts_mode_check CHECK (mode IN ('test', 'live')),
  CONSTRAINT payment_attempts_state_check
    CHECK (state IN ('pending', 'session_bound', 'finalized', 'cancelled', 'failed', 'expired')),
  CONSTRAINT payment_attempts_amount_check CHECK (amount_cents IS NULL OR amount_cents >= 0),
  CONSTRAINT payment_attempts_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT payment_attempts_generation_check CHECK (generation > 0),
  CONSTRAINT payment_attempts_request_seal_check CHECK (
    (request_generation IS NULL AND request_fingerprint IS NULL AND request_snapshot IS NULL)
    OR (
      request_generation IS NOT NULL
      AND request_generation > 0
      AND request_fingerprint IS NOT NULL
      AND btrim(request_fingerprint) <> ''
      AND request_snapshot IS NOT NULL
    )
  ),
  CONSTRAINT payment_attempts_counters_check CHECK (acquire_count >= 0 AND failure_count >= 0),
  CONSTRAINT payment_attempts_lease_pair_check
    CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT payment_attempts_operation_mode_unique UNIQUE (mode, operation_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_owner_created
  ON public.payment_attempts (owner_user_id, created_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_attempts_restaurant_created
  ON public.payment_attempts (restaurant_id, created_at DESC)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_attempts_state_lease
  ON public.payment_attempts (state, lease_expires_at)
  WHERE state IN ('pending', 'session_bound');

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_attempts_checkout_session_mode
  ON public.payment_attempts (mode, stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_attempts_payment_intent_mode
  ON public.payment_attempts (mode, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_attempts_subscription_mode
  ON public.payment_attempts (mode, stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_attempts_refund_mode
  ON public.payment_attempts (mode, stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

-- A different client operation UUID must not create a second concurrent
-- subscription for the same logical subscriber.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_attempts_active_tok_one_owner
  ON public.payment_attempts (mode, owner_user_id)
  WHERE kind = 'tok-one'
    AND owner_user_id IS NOT NULL
    AND state IN ('pending', 'session_bound');

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_attempts_active_restaurant_subscription
  ON public.payment_attempts (mode, restaurant_id)
  WHERE kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade')
    AND restaurant_id IS NOT NULL
    AND state IN ('pending', 'session_bound');

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_attempts TO service_role;

CREATE OR REPLACE FUNCTION private_finance.payment_attempt_json(
  p_attempt public.payment_attempts,
  p_reused boolean,
  p_lease_acquired boolean,
  p_operation_conflict boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'attempt_id', p_attempt.id,
    'operation_key', p_attempt.operation_key,
    'owner_user_id', p_attempt.owner_user_id,
    'restaurant_id', p_attempt.restaurant_id,
    'kind', p_attempt.kind,
    'mode', p_attempt.mode,
    'state', p_attempt.state,
    'amount_cents', p_attempt.amount_cents,
    'currency', p_attempt.currency,
    'generation', p_attempt.generation,
    'stripe_idempotency_key', format('checkout:%s:%s', p_attempt.id, p_attempt.generation),
    'stripe_checkout_session_id', p_attempt.stripe_checkout_session_id,
    'stripe_payment_intent_id', p_attempt.stripe_payment_intent_id,
    'stripe_subscription_id', p_attempt.stripe_subscription_id,
    'session_expires_at', p_attempt.session_expires_at,
    'request_fingerprint', CASE
      WHEN p_attempt.request_generation = p_attempt.generation THEN p_attempt.request_fingerprint
      ELSE NULL
    END,
    'request_snapshot', CASE
      WHEN p_attempt.request_generation = p_attempt.generation THEN p_attempt.request_snapshot
      ELSE NULL
    END,
    'lease_token', CASE WHEN p_lease_acquired THEN p_attempt.lease_token ELSE NULL END,
    'lease_expires_at', CASE WHEN p_lease_acquired THEN p_attempt.lease_expires_at ELSE NULL END,
    'reused', p_reused,
    'lease_acquired', p_lease_acquired,
    'operation_conflict', p_operation_conflict,
    'retryable', p_attempt.retryable,
    'last_error_code', p_attempt.last_error_code,
    'last_error_message', p_attempt.last_error_message
  );
$$;

CREATE OR REPLACE FUNCTION public.acquire_payment_attempt(
  p_operation_key text,
  p_owner_user_id uuid,
  p_restaurant_id uuid,
  p_kind text,
  p_mode text,
  p_amount_cents integer DEFAULT NULL,
  p_currency text DEFAULT 'CHF',
  p_lease_seconds integer DEFAULT 120,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation_key text := btrim(COALESCE(p_operation_key, ''));
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_mode text := lower(btrim(COALESCE(p_mode, '')));
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_attempt public.payment_attempts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_scope_key text;
  v_reused boolean := false;
  v_operation_conflict boolean := false;
BEGIN
  IF v_operation_key = '' OR char_length(v_operation_key) > 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_operation_key';
  END IF;
  IF v_kind = '' OR char_length(v_kind) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_kind';
  END IF;
  IF v_mode NOT IN ('test', 'live') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_currency';
  END IF;
  IF p_amount_cents IS NOT NULL AND p_amount_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_amount';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_lease_seconds';
  END IF;
  IF v_kind = 'tok-one' AND p_owner_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'owner_required_for_tok_one';
  END IF;
  IF v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade')
    AND p_restaurant_id IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_required_for_subscription';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payment-operation:' || v_mode || ':' || v_operation_key, 0));

  IF v_kind = 'tok-one' THEN
    v_scope_key := 'subscription:' || v_mode || ':tok-one:' || p_owner_user_id::text;
  ELSIF v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN
    v_scope_key := 'subscription:' || v_mode || ':restaurant:' || p_restaurant_id::text;
  END IF;

  IF v_scope_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_scope_key, 0));
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.payment_attempts
  WHERE mode = v_mode AND operation_key = v_operation_key
  FOR UPDATE;

  IF FOUND THEN
    v_reused := true;

    IF v_attempt.kind IS DISTINCT FROM v_kind
      OR v_attempt.owner_user_id IS DISTINCT FROM p_owner_user_id
      OR v_attempt.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR (v_attempt.amount_cents IS NOT NULL AND p_amount_cents IS NOT NULL
          AND v_attempt.request_generation IS DISTINCT FROM v_attempt.generation
          AND v_attempt.amount_cents IS DISTINCT FROM p_amount_cents)
      OR v_attempt.currency IS DISTINCT FROM v_currency
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_operation_identity_mismatch';
    END IF;
  ELSE
    IF v_kind = 'tok-one' THEN
      SELECT *
      INTO v_attempt
      FROM public.payment_attempts
      WHERE mode = v_mode
        AND kind = 'tok-one'
        AND owner_user_id = p_owner_user_id
        AND state IN ('pending', 'session_bound')
      FOR UPDATE;
    ELSIF v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN
      SELECT *
      INTO v_attempt
      FROM public.payment_attempts
      WHERE mode = v_mode
        AND kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade')
        AND restaurant_id = p_restaurant_id
        AND state IN ('pending', 'session_bound')
      FOR UPDATE;
    END IF;

    IF FOUND THEN
      v_reused := true;
      v_operation_conflict := true;
    ELSE
      INSERT INTO public.payment_attempts (
        operation_key,
        owner_user_id,
        restaurant_id,
        kind,
        mode,
        state,
        amount_cents,
        currency,
        generation,
        acquire_count,
        retryable,
        lease_token,
        lease_expires_at,
        metadata
      ) VALUES (
        v_operation_key,
        p_owner_user_id,
        p_restaurant_id,
        v_kind,
        v_mode,
        'pending',
        p_amount_cents,
        v_currency,
        1,
        1,
        true,
        v_token,
        v_now + make_interval(secs => p_lease_seconds),
        COALESCE(p_metadata, '{}'::jsonb)
      )
      RETURNING * INTO v_attempt;

      RETURN private_finance.payment_attempt_json(v_attempt, false, true, false);
    END IF;
  END IF;

  IF v_attempt.state IN ('finalized', 'cancelled', 'failed')
    OR NOT v_attempt.retryable
  THEN
    RETURN private_finance.payment_attempt_json(v_attempt, v_reused, false, v_operation_conflict);
  END IF;

  IF v_attempt.lease_token IS NOT NULL
    AND v_attempt.lease_expires_at IS NOT NULL
    AND v_attempt.lease_expires_at > v_now
  THEN
    RETURN private_finance.payment_attempt_json(v_attempt, true, false, v_operation_conflict);
  END IF;

  UPDATE public.payment_attempts
  SET lease_token = v_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      acquire_count = acquire_count + 1,
      updated_at = v_now
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN private_finance.payment_attempt_json(v_attempt, true, true, v_operation_conflict);
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_payment_attempt_stripe(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_checkout_session_id text,
  p_payment_intent_id text DEFAULT NULL,
  p_subscription_id text DEFAULT NULL,
  p_session_expires_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_session_id text := NULLIF(btrim(COALESCE(p_checkout_session_id, '')), '');
BEGIN
  IF p_attempt_id IS NULL OR p_lease_token IS NULL OR v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_attempt_binding';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payment-attempt:' || p_attempt_id::text, 0));

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_attempt_not_found';
  END IF;
  IF v_attempt.lease_token IS DISTINCT FROM p_lease_token
    OR v_attempt.lease_expires_at IS NULL
    OR v_attempt.lease_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'payment_attempt_lease_lost';
  END IF;
  IF lower(COALESCE(v_attempt.metadata ->> 'cancellation_requested', 'false')) = 'true' THEN
    RAISE EXCEPTION USING ERRCODE = '57014', MESSAGE = 'payment_attempt_cancellation_requested';
  END IF;
  IF v_attempt.state NOT IN ('pending', 'session_bound') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_not_bindable';
  END IF;
  IF v_attempt.stripe_checkout_session_id IS NOT NULL
    AND v_attempt.stripe_checkout_session_id IS DISTINCT FROM v_session_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_session_mismatch';
  END IF;
  IF v_attempt.stripe_payment_intent_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(p_payment_intent_id, '')), '') IS NOT NULL
    AND v_attempt.stripe_payment_intent_id IS DISTINCT FROM NULLIF(btrim(p_payment_intent_id), '')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_intent_mismatch';
  END IF;
  IF v_attempt.stripe_subscription_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(p_subscription_id, '')), '') IS NOT NULL
    AND v_attempt.stripe_subscription_id IS DISTINCT FROM NULLIF(btrim(p_subscription_id), '')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_subscription_mismatch';
  END IF;

  UPDATE public.payment_attempts
  SET state = 'session_bound',
      stripe_checkout_session_id = v_session_id,
      stripe_payment_intent_id = COALESCE(NULLIF(btrim(COALESCE(p_payment_intent_id, '')), ''), stripe_payment_intent_id),
      stripe_subscription_id = COALESCE(NULLIF(btrim(COALESCE(p_subscription_id, '')), ''), stripe_subscription_id),
      session_expires_at = COALESCE(p_session_expires_at, session_expires_at),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
      last_error_code = NULL,
      last_error_message = NULL,
      last_error_at = NULL,
      updated_at = v_now
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  RETURN private_finance.payment_attempt_json(v_attempt, true, true, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.seal_payment_attempt_request(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_fingerprint text,
  p_request_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_fingerprint text := NULLIF(btrim(COALESCE(p_fingerprint, '')), '');
  v_now timestamptz := clock_timestamp();
  v_history jsonb;
BEGIN
  IF p_attempt_id IS NULL OR p_lease_token IS NULL OR v_fingerprint IS NULL
    OR p_request_snapshot IS NULL OR jsonb_typeof(p_request_snapshot) <> 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_request_seal';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payment-attempt:' || p_attempt_id::text, 0));
  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_attempt_not_found';
  END IF;
  IF v_attempt.state <> 'pending'
    OR v_attempt.lease_token IS DISTINCT FROM p_lease_token
    OR v_attempt.lease_expires_at IS NULL
    OR v_attempt.lease_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'payment_attempt_lease_lost';
  END IF;

  IF v_attempt.request_generation = v_attempt.generation THEN
    IF v_attempt.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_request_fingerprint_mismatch';
    END IF;
    RETURN jsonb_build_object(
      'attempt_id', v_attempt.id,
      'generation', v_attempt.generation,
      'request_fingerprint', v_attempt.request_fingerprint,
      'request_snapshot', v_attempt.request_snapshot,
      'sealed', true,
      'reused', true
    );
  END IF;

  IF v_attempt.request_generation IS NOT NULL THEN
    v_history := COALESCE(v_attempt.metadata -> 'request_snapshot_history', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'generation', v_attempt.request_generation,
        'fingerprint', v_attempt.request_fingerprint,
        'snapshot', v_attempt.request_snapshot,
        'archived_at', v_now
      ));
  ELSE
    v_history := COALESCE(v_attempt.metadata -> 'request_snapshot_history', '[]'::jsonb);
  END IF;

  UPDATE public.payment_attempts
  SET request_generation = generation,
      request_fingerprint = v_fingerprint,
      request_snapshot = p_request_snapshot,
      metadata = jsonb_set(metadata, '{request_snapshot_history}', v_history, true),
      updated_at = v_now
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'generation', v_attempt.generation,
    'request_fingerprint', v_attempt.request_fingerprint,
    'request_snapshot', v_attempt.request_snapshot,
    'sealed', true,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_payment_attempt(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_retryable boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_attempt_id IS NULL OR p_lease_token IS NULL OR p_retryable IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_attempt_failure';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payment-attempt:' || p_attempt_id::text, 0));
  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_attempt_not_found';
  END IF;
  IF v_attempt.lease_token IS DISTINCT FROM p_lease_token
    OR v_attempt.lease_expires_at IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'payment_attempt_lease_lost';
  END IF;
  IF v_attempt.state <> 'pending' OR v_attempt.stripe_checkout_session_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'bound_session_requires_explicit_abandon';
  END IF;

  UPDATE public.payment_attempts
  SET state = CASE
        WHEN lower(COALESCE(metadata ->> 'cancellation_requested', 'false')) = 'true' THEN 'cancelled'
        WHEN p_retryable THEN 'pending'
        ELSE 'failed'
      END,
      retryable = CASE
        WHEN lower(COALESCE(metadata ->> 'cancellation_requested', 'false')) = 'true' THEN false
        ELSE p_retryable
      END,
      failure_count = failure_count + 1,
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error_code = NULLIF(btrim(COALESCE(p_error_code, '')), ''),
      last_error_message = left(NULLIF(btrim(COALESCE(p_error_message, '')), ''), 4000),
      last_error_at = v_now,
      failed_at = CASE WHEN p_retryable THEN failed_at ELSE v_now END,
      cancelled_at = CASE
        WHEN lower(COALESCE(metadata ->> 'cancellation_requested', 'false')) = 'true'
          THEN COALESCE(cancelled_at, v_now)
        ELSE cancelled_at
      END,
      updated_at = v_now
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  -- Generation intentionally does not change: a timeout or 5xx is ambiguous,
  -- so retrying must reuse the exact same Stripe idempotency key.
  RETURN private_finance.payment_attempt_json(v_attempt, true, false, false);
END;
$$;

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
  IF v_attempt.state = 'finalized' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'finalized_attempt_cannot_be_abandoned';
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

CREATE OR REPLACE FUNCTION public.cancel_payment_attempt(
  p_attempt_id uuid,
  p_reason text DEFAULT NULL,
  p_expected_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_expected text := NULLIF(btrim(COALESCE(p_expected_session_id, '')), '');
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_attempt_id_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payment-attempt:' || p_attempt_id::text, 0));
  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_attempt_not_found';
  END IF;
  IF v_attempt.state = 'finalized' THEN
    RETURN private_finance.payment_attempt_json(v_attempt, true, false, false)
      || jsonb_build_object('cancelled', false, 'reason', 'already_finalized');
  END IF;
  IF v_expected IS NULL AND v_attempt.stripe_checkout_session_id IS NOT NULL THEN
    RETURN private_finance.payment_attempt_json(v_attempt, true, false, false)
      || jsonb_build_object(
        'cancelled', false,
        'refresh_required', true,
        'reason', 'payment_attempt_session_became_bound'
      );
  END IF;
  IF v_expected IS NOT NULL
    AND v_attempt.stripe_checkout_session_id IS DISTINCT FROM v_expected
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_session_mismatch';
  END IF;

  IF v_attempt.state = 'pending'
    AND v_attempt.stripe_checkout_session_id IS NULL
    AND v_attempt.lease_token IS NOT NULL
    AND v_attempt.lease_expires_at IS NOT NULL
    AND v_attempt.lease_expires_at > v_now
  THEN
    UPDATE public.payment_attempts
    SET metadata = metadata || jsonb_build_object(
          'cancellation_requested', true,
          'cancellation_requested_at', v_now,
          'cancellation_reason', NULLIF(btrim(COALESCE(p_reason, '')), '')
        ),
        last_error_code = 'cancellation_requested',
        last_error_message = left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 4000),
        last_error_at = v_now,
        updated_at = v_now
    WHERE id = p_attempt_id
    RETURNING * INTO v_attempt;

    RETURN private_finance.payment_attempt_json(v_attempt, true, false, false)
      || jsonb_build_object('cancelled', false, 'cancellation_requested', true);
  END IF;

  UPDATE public.payment_attempts
  SET state = 'cancelled',
      retryable = false,
      lease_token = NULL,
      lease_expires_at = NULL,
      cancelled_at = COALESCE(cancelled_at, v_now),
      last_error_code = 'cancelled',
      last_error_message = left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 4000),
      last_error_at = v_now,
      updated_at = v_now
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  RETURN private_finance.payment_attempt_json(v_attempt, true, false, false)
    || jsonb_build_object('cancelled', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_payment_attempt(
  p_livemode boolean,
  p_attempt_id uuid DEFAULT NULL,
  p_operation_key text DEFAULT NULL,
  p_stripe_event_id text DEFAULT NULL,
  p_checkout_session_id text DEFAULT NULL,
  p_payment_intent_id text DEFAULT NULL,
  p_subscription_id text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_mode text := CASE WHEN p_livemode THEN 'live' ELSE 'test' END;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_now timestamptz := clock_timestamp();
  v_lookup text;
  v_previous_state text;
BEGIN
  IF p_livemode IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'livemode_required';
  END IF;
  IF p_attempt_id IS NULL
    AND NULLIF(btrim(COALESCE(p_operation_key, '')), '') IS NULL
    AND NULLIF(btrim(COALESCE(p_checkout_session_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_attempt_lookup_required';
  END IF;
  IF p_amount_cents IS NOT NULL AND p_amount_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_amount';
  END IF;

  v_lookup := COALESCE(
    p_attempt_id::text,
    NULLIF(btrim(COALESCE(p_operation_key, '')), ''),
    NULLIF(btrim(COALESCE(p_checkout_session_id, '')), '')
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('payment-finalize:' || v_mode || ':' || v_lookup, 0));

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE mode = v_mode
    AND (
      (p_attempt_id IS NOT NULL AND id = p_attempt_id)
      OR (p_attempt_id IS NULL
          AND NULLIF(btrim(COALESCE(p_operation_key, '')), '') IS NOT NULL
          AND operation_key = btrim(p_operation_key))
      OR (p_attempt_id IS NULL
          AND NULLIF(btrim(COALESCE(p_operation_key, '')), '') IS NULL
          AND stripe_checkout_session_id = NULLIF(btrim(COALESCE(p_checkout_session_id, '')), ''))
    )
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_attempt_not_found';
  END IF;

  IF p_stripe_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.stripe_webhook_events e
    WHERE e.event_id = p_stripe_event_id
      AND e.livemode = p_livemode
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_event_mode_mismatch';
  END IF;
  IF v_attempt.amount_cents IS NOT NULL
    AND p_amount_cents IS NOT NULL
    AND v_attempt.amount_cents IS DISTINCT FROM p_amount_cents
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_amount_mismatch';
  END IF;
  IF v_attempt.currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_currency_mismatch';
  END IF;
  IF v_attempt.stripe_checkout_session_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(p_checkout_session_id, '')), '') IS NOT NULL
    AND v_attempt.stripe_checkout_session_id IS DISTINCT FROM NULLIF(btrim(p_checkout_session_id), '')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_session_mismatch';
  END IF;
  IF v_attempt.stripe_payment_intent_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(p_payment_intent_id, '')), '') IS NOT NULL
    AND v_attempt.stripe_payment_intent_id IS DISTINCT FROM NULLIF(btrim(p_payment_intent_id), '')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_intent_mismatch';
  END IF;
  IF v_attempt.stripe_subscription_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(p_subscription_id, '')), '') IS NOT NULL
    AND v_attempt.stripe_subscription_id IS DISTINCT FROM NULLIF(btrim(p_subscription_id), '')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_attempt_subscription_mismatch';
  END IF;

  IF v_attempt.state = 'finalized' THEN
    RETURN private_finance.payment_attempt_json(v_attempt, true, false, false)
      || jsonb_build_object('newly_finalized', false);
  END IF;

  v_previous_state := v_attempt.state;
  UPDATE public.payment_attempts
  SET state = 'finalized',
      retryable = false,
      amount_cents = COALESCE(amount_cents, p_amount_cents),
      stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, NULLIF(btrim(COALESCE(p_checkout_session_id, '')), '')),
      stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, NULLIF(btrim(COALESCE(p_payment_intent_id, '')), '')),
      stripe_subscription_id = COALESCE(stripe_subscription_id, NULLIF(btrim(COALESCE(p_subscription_id, '')), '')),
      lease_token = NULL,
      lease_expires_at = NULL,
      finalized_at = COALESCE(finalized_at, v_now),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'finalized_by_stripe_event_id', p_stripe_event_id,
        'state_before_finalization', v_previous_state,
        'late_terminal_finalization', v_previous_state IN ('cancelled', 'failed', 'expired')
      ),
      updated_at = v_now
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN private_finance.payment_attempt_json(v_attempt, true, false, false)
    || jsonb_build_object('newly_finalized', true);
END;
$$;

-- A credit-pack business row is now one-to-one with its durable payment
-- attempt.  This closes the check-then-insert race in create-checkout.
ALTER TABLE public.restaurant_credit_purchases
  ADD COLUMN IF NOT EXISTS payment_attempt_id uuid
    REFERENCES public.payment_attempts(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_credit_purchases_payment_attempt
  ON public.restaurant_credit_purchases (payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_credit_purchases_payment_attempt_fk
  ON public.restaurant_credit_purchases (payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pending_payment_attempt_metadata
  ON public.orders ((metadata ->> 'payment_attempt_id'))
  WHERE lower(COALESCE(status, '')) = 'pending_payment'
    AND NULLIF(metadata ->> 'payment_attempt_id', '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pending_checkout_group_metadata
  ON public.orders ((metadata ->> 'checkout_group_id'))
  WHERE lower(COALESCE(status, '')) = 'pending_payment'
    AND NULLIF(metadata ->> 'checkout_group_id', '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_pending_payment_attempt_metadata
  ON public.reservations ((metadata ->> 'payment_attempt_id'))
  WHERE lower(COALESCE(status, '')) = 'pending'
    AND NULLIF(metadata ->> 'payment_attempt_id', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.release_zero_attente_checkout_hold(
  p_session_id text,
  p_expected_attempt_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'expired'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_id text := NULLIF(btrim(COALESCE(p_session_id, '')), '');
  v_reason text := COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'expired');
  v_now timestamptz := clock_timestamp();
  v_released_ids jsonb := '[]'::jsonb;
  v_released_count integer := 0;
  v_already_released boolean := false;
BEGIN
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'checkout_session_id_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('zero-attente-session:' || v_session_id, 0));

  WITH candidates AS (
    SELECT r.id
    FROM public.reservations r
    WHERE r.feature = 'zero-attente'
      AND lower(COALESCE(r.status, '')) = 'pending'
      AND r.metadata ->> 'checkout_session_id' = v_session_id
      AND (
        p_expected_attempt_id IS NULL
        OR r.metadata ->> 'payment_attempt_id' = p_expected_attempt_id::text
        OR r.metadata ->> 'server_payment_attempt_id' = p_expected_attempt_id::text
        OR EXISTS (
          SELECT 1
          FROM public.payment_attempts pa
          WHERE (
              pa.id = p_expected_attempt_id
              OR pa.operation_key = p_expected_attempt_id::text
            )
            AND (
              r.metadata ->> 'payment_attempt_id' IN (pa.id::text, pa.operation_key)
              OR r.metadata ->> 'server_payment_attempt_id' IN (pa.id::text, pa.operation_key)
              OR r.metadata ->> 'operation_key' = pa.operation_key
            )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_transactions pt
        WHERE pt.status = 'succeeded'
          AND pt.type IN ('charge', 'subscription')
          AND (
            pt.stripe_checkout_session_id = v_session_id
            OR pt.metadata ->> 'reservation_id' = r.id::text
          )
      )
    FOR UPDATE
  ), released AS (
    UPDATE public.reservations r
    SET status = 'cancelled',
        cancelled_at = COALESCE(r.cancelled_at, v_now),
        cancelled_by = COALESCE(r.cancelled_by, 'system'),
        cancellation_reason_code = COALESCE(r.cancellation_reason_code, 'checkout_hold_released'),
        cancellation_reason_details = COALESCE(r.cancellation_reason_details, v_reason),
        metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object(
          'checkout_session_state', 'released',
          'hold_released_at', v_now,
          'hold_release_reason', v_reason,
          'released_by_payment_attempt_id', p_expected_attempt_id
        ),
        updated_at = v_now
    FROM candidates c
    WHERE r.id = c.id
    RETURNING r.id
  )
  SELECT COUNT(*)::integer,
         COALESCE(jsonb_agg(id ORDER BY id), '[]'::jsonb)
  INTO v_released_count, v_released_ids
  FROM released;

  IF v_released_count = 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.reservations r
      WHERE r.feature = 'zero-attente'
        AND r.metadata ->> 'checkout_session_id' = v_session_id
        AND r.metadata ->> 'checkout_session_state' = 'released'
        AND (
          p_expected_attempt_id IS NULL
          OR r.metadata ->> 'payment_attempt_id' = p_expected_attempt_id::text
          OR r.metadata ->> 'server_payment_attempt_id' = p_expected_attempt_id::text
          OR EXISTS (
            SELECT 1
            FROM public.payment_attempts pa
            WHERE (
                pa.id = p_expected_attempt_id
                OR pa.operation_key = p_expected_attempt_id::text
              )
              AND (
                r.metadata ->> 'payment_attempt_id' IN (pa.id::text, pa.operation_key)
                OR r.metadata ->> 'server_payment_attempt_id' IN (pa.id::text, pa.operation_key)
                OR r.metadata ->> 'operation_key' = pa.operation_key
              )
          )
        )
    ) INTO v_already_released;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'released_count', v_released_count,
    'reservation_ids', v_released_ids,
    'already_released', v_already_released
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Transactional finance outbox
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  mode text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lock_token uuid,
  locked_until timestamptz,
  processed_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_outbox_identity_not_blank CHECK (
    btrim(event_type) <> '' AND btrim(aggregate_type) <> '' AND btrim(aggregate_id) <> ''
  ),
  CONSTRAINT finance_outbox_mode_check CHECK (mode IN ('test', 'live')),
  CONSTRAINT finance_outbox_state_check
    CHECK (state IN ('pending', 'processing', 'succeeded', 'failed')),
  CONSTRAINT finance_outbox_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT finance_outbox_lock_pair_check CHECK ((lock_token IS NULL) = (locked_until IS NULL)),
  CONSTRAINT finance_outbox_event_unique
    UNIQUE (mode, event_type, aggregate_type, aggregate_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_outbox_dispatch
  ON public.finance_outbox (available_at, created_at)
  WHERE state IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_finance_outbox_reclaim
  ON public.finance_outbox (locked_until)
  WHERE state = 'processing';

ALTER TABLE public.finance_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.finance_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.claim_finance_outbox(
  p_limit integer DEFAULT 50,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_outbox_claim_limit';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_outbox_lease_seconds';
  END IF;

  WITH candidates AS (
    SELECT o.id
    FROM public.finance_outbox o
    WHERE (
        o.state IN ('pending', 'failed')
        AND o.available_at <= v_now
      ) OR (
        o.state = 'processing'
        AND (o.locked_until IS NULL OR o.locked_until <= v_now)
      )
    ORDER BY o.available_at, o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.finance_outbox o
    SET state = 'processing',
        attempt_count = o.attempt_count + 1,
        lock_token = v_token,
        locked_until = v_now + make_interval(secs => p_lease_seconds),
        last_error = NULL,
        last_error_at = NULL,
        updated_at = v_now
    FROM candidates c
    WHERE o.id = c.id
    RETURNING o.*
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(claimed) ORDER BY claimed.created_at), '[]'::jsonb)
  INTO v_items
  FROM claimed;

  RETURN jsonb_build_object(
    'lock_token', v_token,
    'locked_until', v_now + make_interval(secs => p_lease_seconds),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_finance_outbox(
  p_outbox_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_error text DEFAULT NULL,
  p_retry_delay_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.finance_outbox%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_outbox_id IS NULL OR p_lock_token IS NULL OR p_success IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_outbox_completion';
  END IF;
  IF p_retry_delay_seconds IS NULL OR p_retry_delay_seconds < 0 OR p_retry_delay_seconds > 86400 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_outbox_retry_delay';
  END IF;

  SELECT * INTO v_row
  FROM public.finance_outbox
  WHERE id = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'finance_outbox_item_not_found';
  END IF;
  IF v_row.state <> 'processing' OR v_row.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'finance_outbox_lease_lost';
  END IF;

  UPDATE public.finance_outbox
  SET state = CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,
      processed_at = CASE WHEN p_success THEN v_now ELSE NULL END,
      available_at = CASE
        WHEN p_success THEN available_at
        ELSE v_now + make_interval(secs => p_retry_delay_seconds)
      END,
      lock_token = NULL,
      locked_until = NULL,
      last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, 'unknown_error'), 4000) END,
      last_error_at = CASE WHEN p_success THEN NULL ELSE v_now END,
      updated_at = v_now
  WHERE id = p_outbox_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'state', v_row.state,
    'attempt_count', v_row.attempt_count,
    'processed_at', v_row.processed_at,
    'available_at', v_row.available_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Explicit Stripe mode on accounting and payment transaction rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_ledger
  ADD COLUMN IF NOT EXISTS livemode boolean,
  ADD COLUMN IF NOT EXISTS stripe_mode text GENERATED ALWAYS AS (
    CASE
      WHEN livemode IS true THEN 'live'
      WHEN livemode IS false THEN 'test'
      WHEN lower(COALESCE(metadata ->> 'livemode', '')) = 'true' THEN 'live'
      WHEN lower(COALESCE(metadata ->> 'livemode', '')) = 'false' THEN 'test'
      ELSE 'unknown'
    END
  ) STORED;

CREATE OR REPLACE FUNCTION private_finance.set_financial_ledger_livemode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_metadata_mode text;
BEGIN
  IF NEW.source_type LIKE 'stripe\_%' ESCAPE '\' THEN
    v_metadata_mode := lower(COALESCE(NEW.metadata ->> 'livemode', ''));
    IF NEW.livemode IS NULL AND v_metadata_mode IN ('true', 'false') THEN
      NEW.livemode := v_metadata_mode::boolean;
    END IF;

    IF NEW.livemode IS NULL AND NEW.stripe_event_id IS NOT NULL THEN
      SELECT e.livemode INTO NEW.livemode
      FROM public.stripe_webhook_events e
      WHERE e.event_id = NEW.stripe_event_id;
    END IF;

    IF NEW.livemode IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_ledger_livemode_required';
    END IF;

    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('livemode', NEW.livemode);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_financial_ledger_livemode ON public.financial_ledger;
CREATE TRIGGER set_financial_ledger_livemode
BEFORE INSERT ON public.financial_ledger
FOR EACH ROW EXECUTE FUNCTION private_finance.set_financial_ledger_livemode();

-- The former index had no mode dimension, so a test object could suppress a
-- live entry with the same provider id.  NULL is reserved for non-Stripe legacy
-- sources and is deterministically grouped as false.
DROP INDEX IF EXISTS public.ux_financial_ledger_source_account_direction;
CREATE UNIQUE INDEX ux_financial_ledger_source_account_direction
  ON public.financial_ledger (
    source_type,
    source_id,
    account_code,
    direction,
    stripe_mode
  )
  WHERE reversal_of IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_ledger_mode_payment_intent
  ON public.financial_ledger (livemode, ((metadata ->> 'payment_intent_id')))
  WHERE source_type LIKE 'stripe\_%' ESCAPE '\';

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS stripe_mode text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS payment_attempt_id uuid
    REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS stripe_event_id text
    REFERENCES public.stripe_webhook_events(event_id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_transactions_stripe_mode_check'
      AND conrelid = 'public.payment_transactions'::regclass
  ) THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_stripe_mode_check
      CHECK (stripe_mode IN ('live', 'test', 'unknown'));
  END IF;
END $$;

UPDATE public.payment_transactions
SET stripe_mode = CASE
  WHEN stripe_checkout_session_id LIKE 'cs_live\_%' ESCAPE '\' THEN 'live'
  WHEN stripe_checkout_session_id LIKE 'cs_test\_%' ESCAPE '\' THEN 'test'
  WHEN lower(COALESCE(metadata ->> 'stripe_mode', '')) IN ('live', 'test')
    THEN lower(metadata ->> 'stripe_mode')
  WHEN lower(COALESCE(metadata ->> 'livemode', '')) = 'true' THEN 'live'
  WHEN lower(COALESCE(metadata ->> 'livemode', '')) = 'false' THEN 'test'
  ELSE 'unknown'
END
WHERE stripe_mode = 'unknown';

CREATE OR REPLACE FUNCTION private_finance.set_payment_transaction_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_metadata_attempt text := NULLIF(btrim(COALESCE(NEW.metadata ->> 'payment_attempt_id', '')), '');
BEGIN
  IF NEW.stripe_mode IS NULL OR NEW.stripe_mode = 'unknown' THEN
    NEW.stripe_mode := CASE
      WHEN NEW.stripe_checkout_session_id LIKE 'cs_live\_%' ESCAPE '\' THEN 'live'
      WHEN NEW.stripe_checkout_session_id LIKE 'cs_test\_%' ESCAPE '\' THEN 'test'
      WHEN lower(COALESCE(NEW.metadata ->> 'stripe_mode', '')) IN ('live', 'test')
        THEN lower(NEW.metadata ->> 'stripe_mode')
      WHEN lower(COALESCE(NEW.metadata ->> 'livemode', '')) = 'true' THEN 'live'
      WHEN lower(COALESCE(NEW.metadata ->> 'livemode', '')) = 'false' THEN 'test'
      ELSE 'unknown'
    END;
  END IF;

  IF NEW.payment_attempt_id IS NULL AND v_metadata_attempt IS NOT NULL
    AND v_metadata_attempt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    NEW.payment_attempt_id := v_metadata_attempt::uuid;
  END IF;
  IF NEW.payment_attempt_id IS NULL AND NEW.stripe_checkout_session_id IS NOT NULL THEN
    SELECT pa.id INTO NEW.payment_attempt_id
    FROM public.payment_attempts pa
    WHERE pa.stripe_checkout_session_id = NEW.stripe_checkout_session_id
      AND (NEW.stripe_mode = 'unknown' OR pa.mode = NEW.stripe_mode)
    LIMIT 1;
  END IF;

  IF NEW.stripe_event_id IS NULL
    AND NULLIF(btrim(COALESCE(NEW.metadata ->> 'stripe_event_id', '')), '') IS NOT NULL
  THEN
    NEW.stripe_event_id := NULLIF(btrim(NEW.metadata ->> 'stripe_event_id'), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payment_transaction_integrity ON public.payment_transactions;
CREATE TRIGGER set_payment_transaction_integrity
BEFORE INSERT ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION private_finance.set_payment_transaction_integrity();

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id_fk
  ON public.payment_transactions (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_attempt_fk
  ON public.payment_transactions (payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_event_fk
  ON public.payment_transactions (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_attempt_order_success
  ON public.payment_transactions (stripe_mode, payment_attempt_id, order_id, type)
  WHERE payment_attempt_id IS NOT NULL AND status = 'succeeded';

-- One Checkout session may allocate to several orders, hence the semantic
-- allocation target is part of the key.  For non-order products the fallback
-- target keeps one successful charge per session/user/source.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_checkout_semantic_charge
  ON public.payment_transactions (
    stripe_mode,
    stripe_checkout_session_id,
    type,
    COALESCE(
      order_id::text,
      metadata ->> 'reservation_id',
      metadata ->> 'campaign_id',
      metadata ->> 'purchase_id',
      metadata ->> 'subscription_id',
      user_id::text,
      'singleton'
    )
  )
  WHERE stripe_checkout_session_id IS NOT NULL
    AND type IN ('charge', 'subscription')
    AND status = 'succeeded';

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_refund_allocation
  ON public.payment_transactions (
    stripe_mode,
    stripe_refund_id,
    COALESCE(
      order_id::text,
      metadata ->> 'reservation_id',
      user_id::text,
      'singleton'
    )
  )
  WHERE stripe_refund_id IS NOT NULL
    AND type = 'refund'
    AND status = 'succeeded';

-- Missing FK indexes reported by the production advisor.  Partial indexes do
-- not cover FK checks, hence the full leading-column payment transaction index.
CREATE INDEX IF NOT EXISTS idx_payment_intents_order_id_fk
  ON public.payment_intents (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_user_id_fk
  ON public.payment_intents (user_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id_fk
  ON public.order_refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_issue_id_fk
  ON public.order_refunds (issue_id);

-- ---------------------------------------------------------------------------
-- Idempotent refund lifecycle.  Only succeeded Stripe refunds affect business
-- totals; pending and failed records remain observable without changing money.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.refund_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  stripe_refund_id text NOT NULL,
  stripe_payment_intent_id text,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  amount_cents integer,
  currency text NOT NULL DEFAULT 'CHF',
  status text NOT NULL DEFAULT 'pending',
  actor text,
  reason text,
  stripe_event_id text REFERENCES public.stripe_webhook_events(event_id) ON DELETE RESTRICT,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  succeeded_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_operations_mode_check CHECK (mode IN ('test', 'live', 'legacy')),
  CONSTRAINT refund_operations_target_type_check CHECK (target_type IN ('order', 'reservation')),
  CONSTRAINT refund_operations_amount_check CHECK (amount_cents IS NULL OR amount_cents > 0),
  CONSTRAINT refund_operations_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT refund_operations_status_check
    CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT refund_operations_stripe_id_not_blank CHECK (btrim(stripe_refund_id) <> ''),
  CONSTRAINT refund_operations_mode_refund_target_unique
    UNIQUE (mode, stripe_refund_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_refund_operations_target
  ON public.refund_operations (target_type, target_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_refund_operations_payment_intent
  ON public.refund_operations (mode, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refund_operations_stripe_event_fk
  ON public.refund_operations (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

ALTER TABLE public.refund_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refund_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.refund_operations TO service_role;

-- Preserve the already-applied amount as an immutable baseline before the new
-- operation ledger becomes authoritative.  Synthetic ids avoid conflating one
-- historic aggregate field with an unknown number of Stripe refunds.
INSERT INTO public.refund_operations (
  mode, stripe_refund_id, target_type, target_id, amount_cents, currency,
  status, actor, reason, succeeded_at, metadata
)
SELECT
  'legacy',
  'legacy-order-' || o.id::text,
  'order',
  o.id,
  round(o.refunded_amount_chf * 100)::integer,
  'CHF',
  'succeeded',
  COALESCE(o.refund_initiated_by, 'legacy'),
  o.refund_reason,
  COALESCE(o.refunded_at, o.updated_at, now()),
  jsonb_build_object('original_stripe_refund_id', o.stripe_refund_id)
FROM public.orders o
WHERE COALESCE(o.refunded_amount_chf, 0) > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.refund_operations (
  mode, stripe_refund_id, target_type, target_id, amount_cents, currency,
  status, actor, reason, succeeded_at, metadata
)
SELECT
  'legacy',
  'legacy-reservation-' || r.id::text,
  'reservation',
  r.id,
  round(r.refunded_amount_chf * 100)::integer,
  'CHF',
  'succeeded',
  COALESCE(r.refund_initiated_by, 'legacy'),
  r.refund_reason,
  COALESCE(r.refunded_at, r.updated_at, now()),
  jsonb_build_object('original_stripe_refund_id', r.stripe_refund_id)
FROM public.reservations r
WHERE COALESCE(r.refunded_amount_chf, 0) > 0
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private_finance.record_refund_status(
  p_target_type text,
  p_target_id uuid,
  p_mode text,
  p_stripe_refund_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_status text,
  p_actor text,
  p_reason text,
  p_stripe_event_id text,
  p_error text,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_type text := lower(btrim(COALESCE(p_target_type, '')));
  v_mode text := lower(btrim(COALESCE(p_mode, '')));
  v_status text := lower(btrim(COALESCE(p_status, 'pending')));
  v_refund_id text := NULLIF(btrim(COALESCE(p_stripe_refund_id, '')), '');
  v_operation public.refund_operations%ROWTYPE;
  v_total_amount numeric;
  v_total_succeeded_cents bigint;
  v_total_reserved_cents bigint;
  v_next_status text;
  v_target_refund_status text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_target_type NOT IN ('order', 'reservation') OR p_target_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_refund_target';
  END IF;
  IF v_mode NOT IN ('test', 'live', 'legacy') OR v_refund_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_refund_identity';
  END IF;
  IF v_status NOT IN ('pending', 'succeeded', 'failed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_refund_status';
  END IF;
  IF v_status = 'succeeded' AND (p_amount_cents IS NULL OR p_amount_cents <= 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'succeeded_refund_amount_required';
  END IF;
  IF p_amount_cents IS NOT NULL AND p_amount_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_refund_amount';
  END IF;
  IF p_stripe_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.stripe_webhook_events e
    WHERE e.event_id = p_stripe_event_id
      AND (v_mode = 'legacy' OR e.livemode = (v_mode = 'live'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'refund_event_mode_mismatch';
  END IF;

  IF NULLIF(btrim(COALESCE(p_payment_intent_id, '')), '') IS NOT NULL THEN
    -- Serialize allocation reservations for every refund sharing the same
    -- Stripe payment. App-side planning can then safely retry a partially
    -- persisted multi-target allocation after a concurrent reservation wins.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'refund-payment-intent:' || v_mode || ':' || btrim(p_payment_intent_id),
      0
    ));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('refund:' || v_mode || ':' || v_refund_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('refund-target:' || v_target_type || ':' || p_target_id::text, 0));

  IF v_target_type = 'order' THEN
    SELECT o.total_amount INTO v_total_amount
    FROM public.orders o
    WHERE o.id = p_target_id
    FOR UPDATE;
  ELSE
    SELECT r.total_amount INTO v_total_amount
    FROM public.reservations r
    WHERE r.id = p_target_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'refund_target_not_found';
  END IF;

  INSERT INTO public.refund_operations (
    mode, stripe_refund_id, stripe_payment_intent_id, target_type, target_id,
    amount_cents, currency, status, actor, reason, stripe_event_id, last_error,
    metadata, succeeded_at, failed_at, updated_at
  ) VALUES (
    v_mode, v_refund_id, NULLIF(btrim(COALESCE(p_payment_intent_id, '')), ''),
    v_target_type, p_target_id, p_amount_cents, 'CHF', v_status,
    NULLIF(btrim(COALESCE(p_actor, '')), ''), NULLIF(btrim(COALESCE(p_reason, '')), ''),
    p_stripe_event_id, CASE WHEN v_status = 'failed' THEN left(COALESCE(p_error, 'unknown_error'), 4000) END,
    COALESCE(p_metadata, '{}'::jsonb),
    CASE WHEN v_status = 'succeeded' THEN v_now END,
    CASE WHEN v_status = 'failed' THEN v_now END,
    v_now
  )
  ON CONFLICT (mode, stripe_refund_id, target_type, target_id) DO UPDATE
  SET stripe_payment_intent_id = COALESCE(public.refund_operations.stripe_payment_intent_id, EXCLUDED.stripe_payment_intent_id),
      amount_cents = COALESCE(public.refund_operations.amount_cents, EXCLUDED.amount_cents),
      status = CASE
        WHEN public.refund_operations.status = 'succeeded' THEN 'succeeded'
        WHEN public.refund_operations.status IN ('failed', 'cancelled')
          AND EXCLUDED.status = 'pending' THEN public.refund_operations.status
        ELSE EXCLUDED.status
      END,
      actor = COALESCE(EXCLUDED.actor, public.refund_operations.actor),
      reason = COALESCE(EXCLUDED.reason, public.refund_operations.reason),
      stripe_event_id = COALESCE(EXCLUDED.stripe_event_id, public.refund_operations.stripe_event_id),
      last_error = CASE WHEN EXCLUDED.status = 'failed' THEN EXCLUDED.last_error ELSE NULL END,
      metadata = public.refund_operations.metadata || EXCLUDED.metadata,
      succeeded_at = CASE
        WHEN public.refund_operations.status = 'succeeded' THEN public.refund_operations.succeeded_at
        WHEN EXCLUDED.status = 'succeeded' THEN v_now
        ELSE public.refund_operations.succeeded_at
      END,
      failed_at = CASE WHEN EXCLUDED.status = 'failed' THEN v_now ELSE public.refund_operations.failed_at END,
      updated_at = v_now
  RETURNING * INTO v_operation;

  IF v_operation.target_type IS DISTINCT FROM v_target_type
    OR v_operation.target_id IS DISTINCT FROM p_target_id
    OR (v_operation.amount_cents IS NOT NULL AND p_amount_cents IS NOT NULL
        AND v_operation.amount_cents IS DISTINCT FROM p_amount_cents)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'refund_operation_identity_mismatch';
  END IF;

  SELECT COALESCE(sum(ro.amount_cents), 0)
  INTO v_total_reserved_cents
  FROM public.refund_operations ro
  WHERE ro.target_type = v_target_type
    AND ro.target_id = p_target_id
    AND ro.status IN ('pending', 'succeeded')
    AND (
      (v_mode = 'live' AND ro.mode IN ('live', 'legacy'))
      OR (v_mode = 'test' AND ro.mode = 'test')
      OR (v_mode = 'legacy' AND ro.mode = 'legacy')
    );

  IF v_total_reserved_cents > round(COALESCE(v_total_amount, 0) * 100)::bigint THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'refund_reservations_exceed_target_total';
  END IF;

  IF v_operation.status = 'succeeded' THEN
    SELECT COALESCE(sum(ro.amount_cents), 0)
    INTO v_total_succeeded_cents
    FROM public.refund_operations ro
    WHERE ro.target_type = v_target_type
      AND ro.target_id = p_target_id
      AND ro.status = 'succeeded'
      AND (
        (v_mode = 'live' AND ro.mode IN ('live', 'legacy'))
        OR (v_mode = 'test' AND ro.mode = 'test')
        OR (v_mode = 'legacy' AND ro.mode = 'legacy')
      );

    IF v_total_succeeded_cents > round(COALESCE(v_total_amount, 0) * 100)::bigint THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'refund_exceeds_target_total';
    END IF;

    v_next_status := CASE
      WHEN v_total_succeeded_cents >= round(COALESCE(v_total_amount, 0) * 100)::bigint THEN 'refunded'
      ELSE 'partial'
    END;

    -- Test-mode Stripe objects are fully auditable in refund_operations but
    -- must never mutate the mode-agnostic production business aggregate.
    IF v_mode <> 'test' AND v_target_type = 'order' THEN
      UPDATE public.orders
      SET refund_status = v_next_status,
          refunded_amount_chf = v_total_succeeded_cents::numeric / 100,
          refunded_at = v_now,
          refund_reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), refund_reason),
          refund_initiated_by = COALESCE(NULLIF(btrim(COALESCE(p_actor, '')), ''), refund_initiated_by, 'system'),
          stripe_refund_id = v_refund_id,
          updated_at = v_now
      WHERE id = p_target_id;
    ELSIF v_mode <> 'test' THEN
      UPDATE public.reservations
      SET refund_status = v_next_status,
          refunded_amount_chf = v_total_succeeded_cents::numeric / 100,
          refunded_at = v_now,
          refund_reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), refund_reason),
          refund_initiated_by = COALESCE(NULLIF(btrim(COALESCE(p_actor, '')), ''), refund_initiated_by, 'system'),
          stripe_refund_id = v_refund_id,
          updated_at = v_now
      WHERE id = p_target_id;
    END IF;
  ELSIF v_operation.status = 'pending' AND v_mode <> 'test' THEN
    IF v_target_type = 'order' THEN
      UPDATE public.orders SET refund_status = 'pending', updated_at = v_now WHERE id = p_target_id;
    ELSE
      UPDATE public.reservations SET refund_status = 'pending', updated_at = v_now WHERE id = p_target_id;
    END IF;
  ELSIF v_operation.status IN ('failed', 'cancelled') THEN
    SELECT COALESCE(sum(ro.amount_cents), 0)
    INTO v_total_succeeded_cents
    FROM public.refund_operations ro
    WHERE ro.target_type = v_target_type
      AND ro.target_id = p_target_id
      AND ro.status = 'succeeded'
      AND (
        (v_mode = 'live' AND ro.mode IN ('live', 'legacy'))
        OR (v_mode = 'test' AND ro.mode = 'test')
        OR (v_mode = 'legacy' AND ro.mode = 'legacy')
      );
    v_next_status := CASE
      WHEN v_total_succeeded_cents >= round(COALESCE(v_total_amount, 0) * 100)::bigint THEN 'refunded'
      WHEN v_total_succeeded_cents > 0 THEN 'partial'
      ELSE 'failed'
    END;
    IF v_mode <> 'test' AND v_target_type = 'order' THEN
      UPDATE public.orders SET refund_status = v_next_status, updated_at = v_now WHERE id = p_target_id;
    ELSIF v_mode <> 'test' THEN
      UPDATE public.reservations SET refund_status = v_next_status, updated_at = v_now WHERE id = p_target_id;
    END IF;
  END IF;

  SELECT COALESCE(sum(ro.amount_cents), 0)
  INTO v_total_succeeded_cents
  FROM public.refund_operations ro
  WHERE ro.target_type = v_target_type
    AND ro.target_id = p_target_id
    AND ro.status = 'succeeded'
    AND (
      (v_mode = 'live' AND ro.mode IN ('live', 'legacy'))
      OR (v_mode = 'test' AND ro.mode = 'test')
      OR (v_mode = 'legacy' AND ro.mode = 'legacy')
    );

  IF v_mode = 'test' THEN
    v_target_refund_status := CASE
      WHEN v_operation.status = 'pending' THEN 'pending'
      WHEN v_operation.status IN ('failed', 'cancelled') AND v_total_succeeded_cents = 0 THEN 'failed'
      WHEN v_total_succeeded_cents >= round(COALESCE(v_total_amount, 0) * 100)::bigint THEN 'refunded'
      WHEN v_total_succeeded_cents > 0 THEN 'partial'
      ELSE v_operation.status
    END;
  ELSIF v_target_type = 'order' THEN
    SELECT o.refund_status INTO v_target_refund_status
    FROM public.orders o WHERE o.id = p_target_id;
  ELSE
    SELECT r.refund_status INTO v_target_refund_status
    FROM public.reservations r WHERE r.id = p_target_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'refund_operation_id', v_operation.id,
    'stripe_refund_id', v_operation.stripe_refund_id,
    'status', v_operation.status,
    'target_type', v_operation.target_type,
    'target_id', v_operation.target_id,
    'amount_cents', v_operation.amount_cents,
    'refunded_amount_cents', COALESCE(v_total_succeeded_cents, 0),
    'target_refund_status', v_target_refund_status,
    'idempotent', v_operation.created_at < v_operation.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_refund_status(
  p_target_type text,
  p_target_id uuid,
  p_livemode boolean,
  p_stripe_refund_id text,
  p_payment_intent_id text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_status text DEFAULT 'pending',
  p_actor text DEFAULT 'system',
  p_reason text DEFAULT NULL,
  p_stripe_event_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_livemode IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'livemode_required';
  END IF;
  RETURN private_finance.record_refund_status(
    p_target_type,
    p_target_id,
    CASE WHEN p_livemode THEN 'live' ELSE 'test' END,
    p_stripe_refund_id,
    p_payment_intent_id,
    p_amount_cents,
    p_status,
    p_actor,
    p_reason,
    p_stripe_event_id,
    p_error,
    p_metadata
  );
END;
$$;

-- Backward-compatible, now concurrency-safe and idempotent.  New Stripe code
-- should call record_refund_status and pass the real livemode/status instead.
CREATE OR REPLACE FUNCTION public.mark_refund_applied(
  p_target_type text,
  p_target_id uuid,
  p_actor text DEFAULT 'admin',
  p_reason text DEFAULT NULL,
  p_amount_chf numeric DEFAULT NULL,
  p_stripe_refund_id text DEFAULT NULL
)
RETURNS TABLE(ok boolean, error_code text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_stripe_refund_id, '')), '') IS NULL THEN
    ok := false;
    error_code := 'stripe_refund_id_required';
    error_message := 'Identifiant Stripe du remboursement requis.';
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    v_result := private_finance.record_refund_status(
      p_target_type,
      p_target_id,
      'legacy',
      p_stripe_refund_id,
      NULL,
      CASE WHEN p_amount_chf IS NULL THEN NULL ELSE round(p_amount_chf * 100)::integer END,
      'succeeded',
      p_actor,
      p_reason,
      NULL,
      NULL,
      jsonb_build_object('compatibility_rpc', 'mark_refund_applied')
    );
    ok := COALESCE((v_result ->> 'ok')::boolean, false);
    error_code := NULL;
    error_message := NULL;
  EXCEPTION WHEN OTHERS THEN
    ok := false;
    error_code := SQLSTATE;
    error_message := SQLERRM;
  END;
  RETURN NEXT;
  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- Refund and dispute accounting.  The advisory lock makes cumulative partial
-- reversals serializable.  Original payments may be Checkout sessions or
-- recurring invoices, and developer clawback uses the exact original payable
-- instead of recomputing and rounding it again.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_finance.record_marketplace_reversal(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_reversal_source_type text,
  p_reversal_source_id text,
  p_amount_cents integer,
  p_action text,
  p_currency text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_livemode boolean;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_action text := lower(btrim(COALESCE(p_action, '')));
  v_source_type text := lower(btrim(COALESCE(p_reversal_source_type, '')));
  v_original_source_type text;
  v_original_source_id text;
  v_restaurant_id uuid;
  v_gross_cents integer;
  v_revenue_account text;
  v_platform_revenue_cents integer := 0;
  v_restaurant_share_cents integer := 0;
  v_developer_share_cents integer := 0;
  v_tax_cents integer := 0;
  v_prior_gross_reversed integer := 0;
  v_target_gross_reversed integer := 0;
  v_prior_platform_reversed integer := 0;
  v_prior_restaurant_reversed integer := 0;
  v_prior_developer_reversed integer := 0;
  v_prior_tax_reversed integer := 0;
  v_target_platform_reversed integer := 0;
  v_target_restaurant_reversed integer := 0;
  v_target_developer_reversed integer := 0;
  v_target_tax_reversed integer := 0;
  v_platform_delta integer := 0;
  v_restaurant_delta integer := 0;
  v_developer_delta integer := 0;
  v_tax_delta integer := 0;
  v_asset_direction text;
  v_component_direction text;
  v_metadata jsonb;
BEGIN
  IF p_stripe_event_id IS NULL OR btrim(p_stripe_event_id) = ''
    OR p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = ''
    OR p_reversal_source_id IS NULL OR btrim(p_reversal_source_id) = ''
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_marketplace_reversal_identity';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reversal_amount_must_be_positive';
  END IF;
  IF v_action NOT IN ('decrease', 'restore') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_marketplace_reversal_action';
  END IF;
  IF (v_action = 'decrease' AND v_source_type NOT IN ('stripe_refund', 'stripe_dispute'))
    OR (v_action = 'restore' AND v_source_type <> 'stripe_dispute_reversal')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_marketplace_reversal_source';
  END IF;

  SELECT * INTO v_event
  FROM public.stripe_webhook_events e
  WHERE e.event_id = p_stripe_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_event_not_claimed';
  END IF;
  v_livemode := v_event.livemode;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'marketplace-reversal:' || CASE WHEN v_livemode THEN 'live' ELSE 'test' END || ':' || p_payment_intent_id,
    0
  ));

  v_asset_direction := CASE WHEN v_action = 'decrease' THEN 'credit' ELSE 'debit' END;
  v_component_direction := CASE WHEN v_action = 'decrease' THEN 'debit' ELSE 'credit' END;

  IF EXISTS (
    SELECT 1 FROM public.financial_ledger l
    WHERE l.source_type = v_source_type
      AND l.source_id = p_reversal_source_id
      AND l.account_code = 'payment_asset'
      AND l.direction = v_asset_direction
      AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END
  ) THEN
    RETURN;
  END IF;

  SELECT l.source_type, l.source_id, l.restaurant_id, l.amount_cents, l.currency
  INTO v_original_source_type, v_original_source_id, v_restaurant_id, v_gross_cents, v_currency
  FROM public.financial_ledger l
  WHERE l.source_type IN ('stripe_checkout', 'stripe_invoice')
    AND l.account_code = 'payment_asset'
    AND l.direction = 'debit'
    AND l.metadata ->> 'payment_intent_id' = p_payment_intent_id
    AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END
  ORDER BY l.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_original_source_id IS NULL THEN
    IF v_action = 'restore' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'original_payment_ledger_missing';
    END IF;
    v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'payment_intent_id', p_payment_intent_id,
      'reversal_amount_cents', p_amount_cents,
      'reversal_action', v_action,
      'livemode', v_livemode,
      'reconciliation_status', 'original_payment_ledger_missing'
    );
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, account_code, direction,
      amount_cents, currency, livemode, metadata
    ) VALUES
      (v_source_type, p_reversal_source_id, p_stripe_event_id, 'payment_asset',
       'credit', p_amount_cents, v_currency, v_livemode, v_metadata),
      (v_source_type, p_reversal_source_id, p_stripe_event_id, 'finance_reconciliation_suspense',
       'debit', p_amount_cents, v_currency, v_livemode, v_metadata)
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  IF upper(v_currency) IS DISTINCT FROM upper(btrim(COALESCE(p_currency, 'CHF'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reversal_currency_mismatch';
  END IF;

  SELECT l.account_code,
         sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END)::integer
  INTO v_revenue_account, v_platform_revenue_cents
  FROM public.financial_ledger l
  WHERE l.source_type = v_original_source_type
    AND l.source_id = v_original_source_id
    AND l.account_code LIKE 'tok\_%\_revenue' ESCAPE '\'
    AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END
  GROUP BY l.account_code
  ORDER BY abs(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END)) DESC
  LIMIT 1;

  SELECT COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END), 0)::integer
  INTO v_restaurant_share_cents
  FROM public.financial_ledger l
  WHERE l.source_type = v_original_source_type
    AND l.source_id = v_original_source_id
    AND l.account_code = 'restaurant_payable'
    AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END;

  SELECT COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END), 0)::integer
  INTO v_developer_share_cents
  FROM public.financial_ledger l
  WHERE l.source_type = v_original_source_type
    AND l.source_id = v_original_source_id
    AND l.account_code = 'developer_payable'
    AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END;

  SELECT COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END), 0)::integer
  INTO v_tax_cents
  FROM public.financial_ledger l
  WHERE l.source_type = v_original_source_type
    AND l.source_id = v_original_source_id
    AND l.account_code = 'tax_payable'
    AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END;

  v_platform_revenue_cents := GREATEST(COALESCE(v_platform_revenue_cents, 0), 0);
  v_restaurant_share_cents := GREATEST(COALESCE(v_restaurant_share_cents, 0), 0);
  v_developer_share_cents := GREATEST(COALESCE(v_developer_share_cents, 0), 0);
  v_tax_cents := GREATEST(COALESCE(v_tax_cents, 0), 0);

  SELECT COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END), 0)::integer
  INTO v_prior_gross_reversed
  FROM public.financial_ledger l
  WHERE l.source_type IN ('stripe_refund', 'stripe_dispute', 'stripe_dispute_reversal')
    AND l.account_code = 'payment_asset'
    AND l.metadata ->> 'payment_intent_id' = p_payment_intent_id
    AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END;

  v_target_gross_reversed := CASE
    WHEN v_action = 'decrease' THEN v_prior_gross_reversed + p_amount_cents
    ELSE v_prior_gross_reversed - p_amount_cents
  END;
  IF v_target_gross_reversed < 0 OR v_target_gross_reversed > v_gross_cents THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reversal_exceeds_original_payment';
  END IF;

  SELECT
    COALESCE(sum(CASE WHEN l.direction = 'debit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code = v_revenue_account), 0)::integer,
    COALESCE(sum(CASE WHEN l.direction = 'debit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code = 'restaurant_payable'), 0)::integer,
    COALESCE(sum(CASE WHEN l.direction = 'debit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code = 'developer_payable'), 0)::integer,
    COALESCE(sum(CASE WHEN l.direction = 'debit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code = 'tax_payable'), 0)::integer
  INTO v_prior_platform_reversed, v_prior_restaurant_reversed,
       v_prior_developer_reversed, v_prior_tax_reversed
  FROM public.financial_ledger l
  WHERE l.source_type IN ('stripe_refund', 'stripe_dispute', 'stripe_dispute_reversal')
    AND l.metadata ->> 'payment_intent_id' = p_payment_intent_id
    AND l.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END;

  v_target_platform_reversed := CASE
    WHEN v_target_gross_reversed = v_gross_cents THEN v_platform_revenue_cents
    ELSE round(v_target_gross_reversed::numeric * v_platform_revenue_cents / v_gross_cents)::integer
  END;
  v_target_tax_reversed := CASE
    WHEN v_target_gross_reversed = v_gross_cents THEN v_tax_cents
    ELSE round(v_target_gross_reversed::numeric * v_tax_cents / v_gross_cents)::integer
  END;
  v_target_restaurant_reversed := v_target_gross_reversed
    - v_target_platform_reversed - v_target_tax_reversed;
  v_target_developer_reversed := CASE
    WHEN v_target_gross_reversed = v_gross_cents THEN v_developer_share_cents
    ELSE round(v_target_gross_reversed::numeric * v_developer_share_cents / v_gross_cents)::integer
  END;

  v_platform_delta := abs(v_target_platform_reversed - v_prior_platform_reversed);
  v_restaurant_delta := abs(v_target_restaurant_reversed - v_prior_restaurant_reversed);
  v_developer_delta := abs(v_target_developer_reversed - v_prior_developer_reversed);
  v_tax_delta := abs(v_target_tax_reversed - v_prior_tax_reversed);

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'original_source_type', v_original_source_type,
    'original_source_id', v_original_source_id,
    'reversal_action', v_action,
    'reversal_amount_cents', p_amount_cents,
    'net_reversed_cents', v_target_gross_reversed,
    'livemode', v_livemode
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id, account_code,
    direction, amount_cents, currency, livemode, metadata
  ) VALUES (
    v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
    'payment_asset', v_asset_direction, p_amount_cents, v_currency, v_livemode, v_metadata
  ) ON CONFLICT DO NOTHING;

  IF v_platform_delta > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, livemode, metadata
    ) VALUES (
      v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
      v_revenue_account, v_component_direction, v_platform_delta, v_currency, v_livemode, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;
  IF v_restaurant_delta > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, livemode, metadata
    ) VALUES (
      v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
      'restaurant_payable', v_component_direction, v_restaurant_delta, v_currency, v_livemode, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;
  IF v_tax_delta > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, livemode, metadata
    ) VALUES (
      v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
      'tax_payable', v_component_direction, v_tax_delta, v_currency, v_livemode, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;
  IF v_developer_delta > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, livemode, metadata
    ) VALUES
      (v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
       'developer_revenue_share_expense',
       CASE WHEN v_action = 'decrease' THEN 'credit' ELSE 'debit' END,
       v_developer_delta, v_currency, v_livemode, v_metadata),
      (v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
       'developer_payable', v_component_direction,
       v_developer_delta, v_currency, v_livemode, v_metadata)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.finance_outbox (
    event_type, aggregate_type, aggregate_id, mode, payload
  ) VALUES (
    CASE
      WHEN v_source_type = 'stripe_refund' THEN 'finance.refund_recorded'
      WHEN v_source_type = 'stripe_dispute' THEN 'finance.dispute_opened'
      ELSE 'finance.dispute_won'
    END,
    CASE
      WHEN v_source_type = 'stripe_refund' THEN 'stripe_refund'
      ELSE 'stripe_dispute'
    END,
    p_reversal_source_id,
    CASE WHEN v_livemode THEN 'live' ELSE 'test' END,
    v_metadata || jsonb_build_object('reversal_source_id', p_reversal_source_id)
  ) ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_marketplace_refund_ledger(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_refund_source_id text,
  p_refund_amount_cents integer,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private_finance.record_marketplace_reversal(
    p_stripe_event_id,
    p_payment_intent_id,
    'stripe_refund',
    p_refund_source_id,
    p_refund_amount_cents,
    'decrease',
    p_currency,
    p_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_marketplace_dispute_ledger(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_dispute_id text,
  p_dispute_amount_cents integer,
  p_action text,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text := lower(btrim(COALESCE(p_action, '')));
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event
  FROM public.stripe_webhook_events e
  WHERE e.event_id = p_stripe_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_event_not_claimed';
  END IF;

  IF v_action = 'opened' THEN
    PERFORM private_finance.record_marketplace_reversal(
      p_stripe_event_id, p_payment_intent_id, 'stripe_dispute', p_dispute_id,
      p_dispute_amount_cents, 'decrease', p_currency, p_metadata
    );
  ELSIF v_action = 'won' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.financial_ledger l
      WHERE l.source_type = 'stripe_dispute'
        AND l.source_id = p_dispute_id
        AND l.account_code = 'payment_asset'
        AND l.direction = 'credit'
        AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dispute_opening_ledger_missing';
    END IF;
    PERFORM private_finance.record_marketplace_reversal(
      p_stripe_event_id, p_payment_intent_id, 'stripe_dispute_reversal', p_dispute_id,
      p_dispute_amount_cents, 'restore', p_currency, p_metadata
    );
  ELSIF v_action = 'lost' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.financial_ledger l
      WHERE l.source_type = 'stripe_dispute'
        AND l.source_id = p_dispute_id
        AND l.account_code = 'payment_asset'
        AND l.direction = 'credit'
        AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dispute_opening_ledger_missing';
    END IF;
    INSERT INTO public.finance_outbox (event_type, aggregate_type, aggregate_id, mode, payload)
    VALUES (
      'finance.dispute_lost', 'stripe_dispute', p_dispute_id,
      CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END,
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'stripe_event_id', p_stripe_event_id,
        'payment_intent_id', p_payment_intent_id,
        'amount_cents', p_dispute_amount_cents
      )
    ) ON CONFLICT DO NOTHING;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_dispute_action';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Developer statements are now sourced from exact developer_payable entries.
-- This removes per-period re-rounding drift and allows a later refund/dispute
-- period to carry a negative clawback instead of clamping it to zero.
-- ---------------------------------------------------------------------------

ALTER TABLE public.developer_statements
  DROP CONSTRAINT IF EXISTS developer_statements_reservation_revenue_cents_check,
  DROP CONSTRAINT IF EXISTS developer_statements_paid_services_revenue_cents_check,
  DROP CONSTRAINT IF EXISTS developer_statements_subscription_revenue_cents_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'developer_statements'
      AND column_name = 'developer_amount_cents'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.developer_statements
      ALTER COLUMN developer_amount_cents DROP EXPRESSION;
  END IF;
END $$;

ALTER TABLE public.developer_statements
  ALTER COLUMN developer_amount_cents SET DEFAULT 0,
  ALTER COLUMN developer_amount_cents SET NOT NULL;

CREATE OR REPLACE FUNCTION public.refresh_developer_statement(
  p_period_start date,
  p_period_end date,
  p_currency text DEFAULT 'CHF'
)
RETURNS public.developer_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_reservation integer := 0;
  v_paid_services integer := 0;
  v_subscription integer := 0;
  v_developer_payable integer := 0;
  v_share_bps integer := 1000;
  v_statement public.developer_statements%ROWTYPE;
BEGIN
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_statement_period';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_currency';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'developer-statement:' || p_period_start::text || ':' || p_period_end::text || ':' || v_currency,
    0
  ));

  IF EXISTS (
    SELECT 1 FROM public.developer_statements d
    WHERE d.period_start = p_period_start
      AND d.period_end = p_period_end
      AND d.currency = v_currency
      AND d.status IN ('validated', 'paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_locked';
  END IF;

  SELECT
    COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code = 'tok_reservation_revenue'), 0)::integer,
    COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code IN (
        'tok_platform_commission_revenue', 'tok_campaign_revenue',
        'tok_credit_pack_revenue', 'tok_other_revenue'
      )), 0)::integer,
    COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code IN ('tok_subscription_revenue', 'tok_one_revenue')), 0)::integer,
    COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END)
      FILTER (WHERE l.account_code = 'developer_payable'), 0)::integer
  INTO v_reservation, v_paid_services, v_subscription, v_developer_payable
  FROM public.financial_ledger l
  WHERE l.currency = v_currency
    AND l.effective_at >= p_period_start::timestamptz
    AND l.effective_at < (p_period_end + 1)::timestamptz
    AND (
      l.source_type NOT LIKE 'stripe\_%' ESCAPE '\'
      OR l.stripe_mode = 'live'
    );

  SELECT frc.developer_share_bps INTO v_share_bps
  FROM public.finance_runtime_config frc
  WHERE frc.config_key = 'default';

  INSERT INTO public.developer_statements (
    period_start, period_end, currency, reservation_revenue_cents,
    paid_services_revenue_cents, subscription_revenue_cents,
    developer_share_bps, developer_amount_cents, status, metadata
  ) VALUES (
    p_period_start, p_period_end, v_currency,
    v_reservation, v_paid_services, v_subscription,
    COALESCE(v_share_bps, 1000), v_developer_payable, 'draft',
    jsonb_build_object(
      'source', 'financial_ledger.developer_payable',
      'calculation', 'exact_net_payable_entries',
      'test_mode_excluded', true,
      'refreshed_at', clock_timestamp()
    )
  )
  ON CONFLICT (period_start, period_end, currency) WHERE status <> 'voided'
  DO UPDATE SET
    reservation_revenue_cents = EXCLUDED.reservation_revenue_cents,
    paid_services_revenue_cents = EXCLUDED.paid_services_revenue_cents,
    subscription_revenue_cents = EXCLUDED.subscription_revenue_cents,
    developer_share_bps = EXCLUDED.developer_share_bps,
    developer_amount_cents = EXCLUDED.developer_amount_cents,
    metadata = EXCLUDED.metadata
  RETURNING * INTO v_statement;

  RETURN v_statement;
END;
$$;

-- ---------------------------------------------------------------------------
-- Commercial compensation source of truth.  Earnings cannot be created from a
-- reservation merely being confirmed: every accrual/reversal must reference a
-- concrete collected/reversed TOK revenue ledger entry.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.commercial_earning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  source_ledger_entry_id uuid NOT NULL REFERENCES public.financial_ledger(entry_id) ON DELETE RESTRICT,
  stripe_event_id text REFERENCES public.stripe_webhook_events(event_id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_id text NOT NULL,
  earning_type text NOT NULL,
  direction text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'CHF',
  mode text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  reversal_of uuid REFERENCES public.commercial_earning_events(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_earning_identity_not_blank CHECK (
    btrim(source_type) <> '' AND btrim(source_id) <> '' AND btrim(earning_type) <> ''
  ),
  CONSTRAINT commercial_earning_direction_check CHECK (direction IN ('accrual', 'reversal')),
  CONSTRAINT commercial_earning_amount_check CHECK (amount_cents > 0),
  CONSTRAINT commercial_earning_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT commercial_earning_mode_check CHECK (mode IN ('test', 'live')),
  CONSTRAINT commercial_earning_reversal_check CHECK (
    (direction = 'accrual' AND reversal_of IS NULL)
    OR (direction = 'reversal' AND reversal_of IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commercial_earning_source
  ON public.commercial_earning_events (
    mode, source_type, source_id, commercial_user_id, earning_type, direction
  );
CREATE INDEX IF NOT EXISTS idx_commercial_earning_user_period
  ON public.commercial_earning_events (commercial_user_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_earning_restaurant_fk
  ON public.commercial_earning_events (restaurant_id)
  WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commercial_earning_ledger_fk
  ON public.commercial_earning_events (source_ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_commercial_earning_event_fk
  ON public.commercial_earning_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commercial_earning_reversal_fk
  ON public.commercial_earning_events (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commercial_statements (
  statement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'CHF',
  mode text NOT NULL DEFAULT 'live',
  accrued_cents integer NOT NULL DEFAULT 0 CHECK (accrued_cents >= 0),
  reversed_cents integer NOT NULL DEFAULT 0 CHECK (reversed_cents >= 0),
  adjustments_cents integer NOT NULL DEFAULT 0,
  net_payable_cents integer GENERATED ALWAYS AS (
    accrued_cents - reversed_cents + adjustments_cents
  ) STORED,
  status text NOT NULL DEFAULT 'draft',
  validated_at timestamptz,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT commercial_statements_period_check CHECK (period_start <= period_end),
  CONSTRAINT commercial_statements_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT commercial_statements_mode_check CHECK (mode IN ('test', 'live')),
  CONSTRAINT commercial_statements_status_check
    CHECK (status IN ('draft', 'validated', 'paid', 'voided')),
  CONSTRAINT commercial_statements_validated_check
    CHECK (status NOT IN ('validated', 'paid') OR validated_at IS NOT NULL),
  CONSTRAINT commercial_statements_paid_check CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commercial_statements_active_period
  ON public.commercial_statements (commercial_user_id, period_start, period_end, currency, mode)
  WHERE status <> 'voided';
CREATE INDEX IF NOT EXISTS idx_commercial_statements_user_status
  ON public.commercial_statements (commercial_user_id, status, period_start DESC);

CREATE OR REPLACE FUNCTION private_finance.prevent_append_only_finance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'append_only_finance_record';
END;
$$;

DROP TRIGGER IF EXISTS prevent_commercial_earning_mutation ON public.commercial_earning_events;
CREATE TRIGGER prevent_commercial_earning_mutation
BEFORE UPDATE OR DELETE ON public.commercial_earning_events
FOR EACH ROW EXECUTE FUNCTION private_finance.prevent_append_only_finance_mutation();

CREATE OR REPLACE FUNCTION private_finance.prevent_locked_commercial_statement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('validated', 'paid') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'commercial_statement_locked';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_commercial_statement_mutation ON public.commercial_statements;
CREATE TRIGGER prevent_locked_commercial_statement_mutation
BEFORE UPDATE OR DELETE ON public.commercial_statements
FOR EACH ROW EXECUTE FUNCTION private_finance.prevent_locked_commercial_statement_mutation();

ALTER TABLE public.commercial_earning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_statements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_earning_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.commercial_statements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_statements TO authenticated;
GRANT SELECT, INSERT ON public.commercial_earning_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.commercial_statements TO service_role;

DROP POLICY IF EXISTS commercial_statements_owner_admin_select ON public.commercial_statements;
CREATE POLICY commercial_statements_owner_admin_select
  ON public.commercial_statements
  FOR SELECT TO authenticated
  USING (
    commercial_user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.record_commercial_earning(
  p_livemode boolean,
  p_commercial_user_id uuid,
  p_source_ledger_entry_id uuid,
  p_source_type text,
  p_source_id text,
  p_earning_type text,
  p_direction text,
  p_amount_cents integer,
  p_currency text DEFAULT 'CHF',
  p_restaurant_id uuid DEFAULT NULL,
  p_stripe_event_id text DEFAULT NULL,
  p_reversal_of uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text := CASE WHEN p_livemode THEN 'live' ELSE 'test' END;
  v_direction text := lower(btrim(COALESCE(p_direction, '')));
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_ledger public.financial_ledger%ROWTYPE;
  v_original public.commercial_earning_events%ROWTYPE;
  v_existing_reversals integer := 0;
  v_row public.commercial_earning_events%ROWTYPE;
BEGIN
  IF p_livemode IS NULL OR p_commercial_user_id IS NULL OR p_source_ledger_entry_id IS NULL
    OR p_amount_cents IS NULL OR p_amount_cents <= 0
    OR v_direction NOT IN ('accrual', 'reversal')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_commercial_earning';
  END IF;

  SELECT * INTO v_ledger
  FROM public.financial_ledger l
  WHERE l.entry_id = p_source_ledger_entry_id
  FOR UPDATE;
  IF NOT FOUND
    OR (
      v_ledger.source_type LIKE 'stripe\_%' ESCAPE '\'
      AND v_ledger.stripe_mode IS DISTINCT FROM v_mode
    )
    OR (
      v_ledger.source_type NOT LIKE 'stripe\_%' ESCAPE '\'
      AND p_livemode = false
    )
    OR v_ledger.currency IS DISTINCT FROM v_currency
    OR p_amount_cents > v_ledger.amount_cents
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_earning_ledger_mismatch';
  END IF;

  IF v_direction = 'accrual' THEN
    IF v_ledger.direction <> 'credit'
      OR v_ledger.account_code NOT LIKE 'tok\_%\_revenue' ESCAPE '\'
      OR p_reversal_of IS NOT NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_accrual_requires_collected_tok_revenue';
    END IF;
  ELSE
    SELECT * INTO v_original
    FROM public.commercial_earning_events ce
    WHERE ce.id = p_reversal_of
      AND ce.direction = 'accrual'
      AND ce.commercial_user_id = p_commercial_user_id
    FOR UPDATE;
    IF NOT FOUND OR v_ledger.direction <> 'debit'
      OR v_ledger.account_code NOT LIKE 'tok\_%\_revenue' ESCAPE '\'
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_reversal_requires_reversed_tok_revenue';
    END IF;
    SELECT COALESCE(sum(ce.amount_cents), 0)::integer INTO v_existing_reversals
    FROM public.commercial_earning_events ce
    WHERE ce.reversal_of = v_original.id AND ce.direction = 'reversal';
    IF v_existing_reversals + p_amount_cents > v_original.amount_cents THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_reversal_exceeds_accrual';
    END IF;
  END IF;

  INSERT INTO public.commercial_earning_events (
    commercial_user_id, restaurant_id, source_ledger_entry_id, stripe_event_id,
    source_type, source_id, earning_type, direction, amount_cents, currency,
    mode, effective_at, reversal_of, metadata
  ) VALUES (
    p_commercial_user_id, p_restaurant_id, p_source_ledger_entry_id, p_stripe_event_id,
    btrim(p_source_type), btrim(p_source_id), btrim(p_earning_type), v_direction,
    p_amount_cents, v_currency, v_mode, v_ledger.effective_at, p_reversal_of,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (mode, source_type, source_id, commercial_user_id, earning_type, direction)
  DO NOTHING
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.commercial_earning_events ce
    WHERE ce.mode = v_mode
      AND ce.source_type = btrim(p_source_type)
      AND ce.source_id = btrim(p_source_id)
      AND ce.commercial_user_id = p_commercial_user_id
      AND ce.earning_type = btrim(p_earning_type)
      AND ce.direction = v_direction;
    IF v_row.amount_cents IS DISTINCT FROM p_amount_cents
      OR v_row.source_ledger_entry_id IS DISTINCT FROM p_source_ledger_entry_id
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_earning_identity_mismatch';
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'direction', v_row.direction, 'amount_cents', v_row.amount_cents);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_commercial_statement(
  p_commercial_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_currency text DEFAULT 'CHF',
  p_livemode boolean DEFAULT true
)
RETURNS public.commercial_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_mode text := CASE WHEN p_livemode THEN 'live' ELSE 'test' END;
  v_accrued integer := 0;
  v_reversed integer := 0;
  v_row public.commercial_statements%ROWTYPE;
BEGIN
  IF p_commercial_user_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_start > p_period_end OR p_livemode IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_commercial_statement_period';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'commercial-statement:' || p_commercial_user_id::text || ':' || p_period_start::text
      || ':' || p_period_end::text || ':' || v_currency || ':' || v_mode,
    0
  ));
  IF EXISTS (
    SELECT 1 FROM public.commercial_statements cs
    WHERE cs.commercial_user_id = p_commercial_user_id
      AND cs.period_start = p_period_start AND cs.period_end = p_period_end
      AND cs.currency = v_currency AND cs.mode = v_mode
      AND cs.status IN ('validated', 'paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_statement_locked';
  END IF;

  SELECT
    COALESCE(sum(ce.amount_cents) FILTER (WHERE ce.direction = 'accrual'), 0)::integer,
    COALESCE(sum(ce.amount_cents) FILTER (WHERE ce.direction = 'reversal'), 0)::integer
  INTO v_accrued, v_reversed
  FROM public.commercial_earning_events ce
  WHERE ce.commercial_user_id = p_commercial_user_id
    AND ce.currency = v_currency AND ce.mode = v_mode
    AND ce.effective_at >= p_period_start::timestamptz
    AND ce.effective_at < (p_period_end + 1)::timestamptz;

  INSERT INTO public.commercial_statements (
    commercial_user_id, period_start, period_end, currency, mode,
    accrued_cents, reversed_cents, status, metadata
  ) VALUES (
    p_commercial_user_id, p_period_start, p_period_end, v_currency, v_mode,
    v_accrued, v_reversed, 'draft',
    jsonb_build_object('source', 'commercial_earning_events', 'cash_basis', true, 'refreshed_at', clock_timestamp())
  )
  ON CONFLICT (commercial_user_id, period_start, period_end, currency, mode) WHERE status <> 'voided'
  DO UPDATE SET accrued_cents = EXCLUDED.accrued_cents,
                reversed_cents = EXCLUDED.reversed_cents,
                metadata = EXCLUDED.metadata
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic webhook finance primitives
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_finance.assert_webhook_lease(
  p_event_id text,
  p_lock_token uuid,
  p_livemode boolean
)
RETURNS public.stripe_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event
  FROM public.stripe_webhook_events e
  WHERE e.event_id = p_event_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_event.processing_status <> 'processing'
    OR v_event.lock_token IS DISTINCT FROM p_lock_token
    OR v_event.locked_until IS NULL
    OR v_event.locked_until <= clock_timestamp()
    OR v_event.livemode IS DISTINCT FROM p_livemode
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'stripe_event_lease_lost';
  END IF;
  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_stripe_tax_fee_ledger(
  p_stripe_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_tax_cents integer DEFAULT NULL,
  p_stripe_fee_cents integer DEFAULT NULL,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_original_source_type text;
  v_restaurant_id uuid;
  v_revenue_account text;
  v_platform_revenue_cents integer := 0;
  v_restaurant_payable_cents integer := 0;
  v_original_developer_cents integer := 0;
  v_target_developer_cents integer := 0;
  v_developer_tax_delta integer := 0;
  v_existing integer;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_metadata jsonb;
  v_missing jsonb := '[]'::jsonb;
BEGIN
  IF p_checkout_session_id IS NULL OR btrim(p_checkout_session_id) = ''
    OR p_stripe_event_id IS NULL OR btrim(p_stripe_event_id) = ''
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_tax_fee_source';
  END IF;
  IF (p_tax_cents IS NOT NULL AND p_tax_cents < 0)
    OR (p_stripe_fee_cents IS NOT NULL AND p_stripe_fee_cents < 0)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_tax_or_fee_amount';
  END IF;

  SELECT * INTO v_event FROM public.stripe_webhook_events e
  WHERE e.event_id = p_stripe_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_event_not_claimed';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'stripe-tax-fee:' || CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END || ':' || p_checkout_session_id,
    0
  ));

  SELECT l.source_type, l.restaurant_id
  INTO v_original_source_type, v_restaurant_id
  FROM public.financial_ledger l
  WHERE l.source_type IN ('stripe_checkout', 'stripe_invoice')
    AND l.source_id = p_checkout_session_id
    AND l.account_code = 'payment_asset'
    AND l.direction = 'debit'
    AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END
  LIMIT 1 FOR UPDATE;
  IF v_original_source_type IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'original_payment_ledger_missing';
  END IF;

  SELECT l.account_code, l.amount_cents
  INTO v_revenue_account, v_platform_revenue_cents
  FROM public.financial_ledger l
  WHERE l.source_type = v_original_source_type
    AND l.source_id = p_checkout_session_id
    AND l.account_code LIKE 'tok\_%\_revenue' ESCAPE '\'
    AND l.direction = 'credit'
    AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END
  ORDER BY l.created_at LIMIT 1;

  SELECT COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END), 0)::integer
  INTO v_original_developer_cents
  FROM public.financial_ledger l
  WHERE l.source_type = v_original_source_type
    AND l.source_id = p_checkout_session_id
    AND l.account_code = 'developer_payable'
    AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END;

  SELECT COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END), 0)::integer
  INTO v_restaurant_payable_cents
  FROM public.financial_ledger l
  WHERE l.source_type = v_original_source_type
    AND l.source_id = p_checkout_session_id
    AND l.account_code = 'restaurant_payable'
    AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'checkout_session_id', p_checkout_session_id,
    'livemode', v_event.livemode
  );

  IF p_tax_cents IS NULL THEN
    v_missing := v_missing || '"tax_cents"'::jsonb;
  ELSIF p_tax_cents > 0 AND v_restaurant_payable_cents > 0 THEN
    -- A marketplace payment can contain supplies made by both TOK and the
    -- restaurant. Stripe's session-level tax total does not identify the
    -- contractual tax debtor, so assigning all VAT to TOK would silently
    -- corrupt both TOK and developer revenue. Keep the amount unreclassified
    -- and require an explicit liability allocation during reconciliation.
    v_missing := v_missing || '"marketplace_tax_liability_scope"'::jsonb;
  ELSIF p_tax_cents > 0 THEN
    IF p_tax_cents > COALESCE(v_platform_revenue_cents, 0) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'tax_exceeds_tok_revenue';
    END IF;
    SELECT l.amount_cents INTO v_existing
    FROM public.financial_ledger l
    WHERE l.source_type = v_original_source_type
      AND l.source_id = p_checkout_session_id
      AND l.account_code = 'tax_payable'
      AND l.direction = 'credit'
      AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END;
    IF FOUND AND v_existing IS DISTINCT FROM p_tax_cents THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'tax_amount_mismatch';
    END IF;

    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, livemode, metadata
    ) VALUES
      (v_original_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
       v_revenue_account, 'debit', p_tax_cents, v_currency, v_event.livemode,
       v_metadata || jsonb_build_object('tax_cents', p_tax_cents)),
      (v_original_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
       'tax_payable', 'credit', p_tax_cents, v_currency, v_event.livemode,
       v_metadata || jsonb_build_object('tax_cents', p_tax_cents))
    ON CONFLICT DO NOTHING;

    IF v_platform_revenue_cents > 0 AND v_original_developer_cents > 0 THEN
      v_target_developer_cents := round(
        (v_platform_revenue_cents - p_tax_cents)::numeric
          * v_original_developer_cents / v_platform_revenue_cents
      )::integer;
      v_developer_tax_delta := GREATEST(0, v_original_developer_cents - v_target_developer_cents);
      IF v_developer_tax_delta > 0 THEN
        INSERT INTO public.financial_ledger (
          source_type, source_id, stripe_event_id, restaurant_id, account_code,
          direction, amount_cents, currency, livemode, metadata
        ) VALUES
          (v_original_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
           'developer_revenue_share_expense', 'credit', v_developer_tax_delta,
           v_currency, v_event.livemode, v_metadata || jsonb_build_object('vat_share_reversal', true)),
          (v_original_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
           'developer_payable', 'debit', v_developer_tax_delta,
           v_currency, v_event.livemode, v_metadata || jsonb_build_object('vat_share_reversal', true))
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  IF p_stripe_fee_cents IS NULL THEN
    v_missing := v_missing || '"stripe_fee_cents"'::jsonb;
  ELSIF p_stripe_fee_cents > 0 THEN
    SELECT l.amount_cents INTO v_existing
    FROM public.financial_ledger l
    WHERE l.source_type = v_original_source_type
      AND l.source_id = p_checkout_session_id
      AND l.account_code = 'stripe_processing_fee_expense'
      AND l.direction = 'debit'
      AND l.stripe_mode = CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END;
    IF FOUND AND v_existing IS DISTINCT FROM p_stripe_fee_cents THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_fee_amount_mismatch';
    END IF;
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, livemode, metadata
    ) VALUES
      (v_original_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
       'stripe_processing_fee_expense', 'debit', p_stripe_fee_cents,
       v_currency, v_event.livemode, v_metadata || jsonb_build_object('stripe_fee_cents', p_stripe_fee_cents)),
      (v_original_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
       'payment_asset', 'credit', p_stripe_fee_cents,
       v_currency, v_event.livemode, v_metadata || jsonb_build_object('stripe_fee_cents', p_stripe_fee_cents))
    ON CONFLICT DO NOTHING;
  END IF;

  IF jsonb_array_length(v_missing) > 0 THEN
    INSERT INTO public.finance_outbox (event_type, aggregate_type, aggregate_id, mode, payload)
    VALUES (
      'finance.reconciliation_required', 'stripe_checkout', p_checkout_session_id,
      CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END,
      v_metadata || jsonb_build_object('missing_fields', v_missing)
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('tax_cents', p_tax_cents, 'stripe_fee_cents', p_stripe_fee_cents, 'missing_fields', v_missing);
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_record_checkout_finance(
  p_stripe_event_id text,
  p_lock_token uuid,
  p_attempt_id uuid,
  p_checkout_session_id text,
  p_checkout_kind text,
  p_gross_cents integer,
  p_livemode boolean,
  p_payment_intent_id text DEFAULT NULL,
  p_subscription_id text DEFAULT NULL,
  p_restaurant_id uuid DEFAULT NULL,
  p_currency text DEFAULT 'CHF',
  p_source_type text DEFAULT 'stripe_checkout',
  p_payment_allocations jsonb DEFAULT '[]'::jsonb,
  p_tax_cents integer DEFAULT NULL,
  p_stripe_fee_cents integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_allocation jsonb;
  v_order public.orders%ROWTYPE;
  v_sum integer := 0;
  v_count integer := 0;
  v_amount integer;
  v_order_id uuid;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_mode text := CASE WHEN p_livemode THEN 'live' ELSE 'test' END;
  v_tx_type text;
BEGIN
  PERFORM private_finance.assert_webhook_lease(p_stripe_event_id, p_lock_token, p_livemode);
  IF p_attempt_id IS NULL OR p_gross_cents IS NULL OR p_gross_cents <= 0
    OR jsonb_typeof(COALESCE(p_payment_allocations, '[]'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_atomic_checkout_finance';
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts pa
  WHERE pa.id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.mode <> v_mode
    OR v_attempt.kind IS DISTINCT FROM lower(btrim(p_checkout_kind))
    OR (v_attempt.amount_cents IS NOT NULL AND v_attempt.amount_cents <> p_gross_cents)
    OR v_attempt.currency <> v_currency
    OR (v_attempt.stripe_checkout_session_id IS NOT NULL
        AND v_attempt.stripe_checkout_session_id <> p_checkout_session_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'atomic_checkout_attempt_mismatch';
  END IF;

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(COALESCE(p_payment_allocations, '[]'::jsonb)) LOOP
    v_order_id := NULLIF(v_allocation ->> 'order_id', '')::uuid;
    v_amount := NULLIF(v_allocation ->> 'amount_cents', '')::integer;
    IF v_order_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_checkout_allocation';
    END IF;
    SELECT * INTO v_order FROM public.orders o WHERE o.id = v_order_id FOR UPDATE;
    IF NOT FOUND OR round(v_order.total_amount * 100)::integer <> v_amount
      OR (p_restaurant_id IS NOT NULL AND v_order.restaurant_id <> p_restaurant_id)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'checkout_allocation_amount_mismatch';
    END IF;
    v_sum := v_sum + v_amount;
    v_count := v_count + 1;
    INSERT INTO public.payment_transactions (
      order_id, user_id, stripe_payment_intent_id, stripe_checkout_session_id,
      amount, currency, type, status, metadata, stripe_mode,
      payment_attempt_id, stripe_event_id
    ) VALUES (
      v_order.id, v_order.user_id, p_payment_intent_id, p_checkout_session_id,
      v_amount::numeric / 100, lower(v_currency), 'charge', 'succeeded',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('amount_cents', v_amount),
      v_mode, p_attempt_id, p_stripe_event_id
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  IF v_count > 0 AND v_sum <> p_gross_cents THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'checkout_allocations_do_not_equal_stripe_total';
  END IF;
  IF v_count = 0 THEN
    v_tx_type := CASE WHEN lower(p_checkout_kind) IN (
      'tok-one', 'restaurant-onboarding', 'restaurant-subscription-upgrade'
    ) THEN 'subscription' ELSE 'charge' END;
    INSERT INTO public.payment_transactions (
      order_id, user_id, stripe_payment_intent_id, stripe_checkout_session_id,
      amount, currency, type, status, metadata, stripe_mode,
      payment_attempt_id, stripe_event_id
    ) VALUES (
      NULL, v_attempt.owner_user_id, p_payment_intent_id, p_checkout_session_id,
      p_gross_cents::numeric / 100, lower(v_currency), v_tx_type, 'succeeded',
      COALESCE(p_metadata, '{}'::jsonb), v_mode, p_attempt_id, p_stripe_event_id
    ) ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.record_marketplace_checkout_ledger(
    p_stripe_event_id, p_checkout_session_id, p_payment_intent_id,
    p_checkout_kind, p_restaurant_id, p_gross_cents, v_currency,
    p_livemode, COALESCE(p_metadata, '{}'::jsonb), p_source_type
  );
  PERFORM public.record_stripe_tax_fee_ledger(
    p_stripe_event_id, p_checkout_session_id, p_payment_intent_id,
    p_tax_cents, p_stripe_fee_cents, v_currency, p_metadata
  );
  PERFORM public.finalize_payment_attempt(
    p_livemode, p_attempt_id, NULL, p_stripe_event_id, p_checkout_session_id,
    p_payment_intent_id, p_subscription_id, p_gross_cents, v_currency, p_metadata
  );

  INSERT INTO public.finance_outbox (event_type, aggregate_type, aggregate_id, mode, payload)
  VALUES (
    'finance.checkout_recorded', 'payment_attempt', p_attempt_id::text, v_mode,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'stripe_event_id', p_stripe_event_id,
      'checkout_session_id', p_checkout_session_id,
      'payment_intent_id', p_payment_intent_id,
      'gross_cents', p_gross_cents,
      'allocation_count', v_count
    )
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'payment_attempt_id', p_attempt_id, 'allocation_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_record_refund_finance(
  p_stripe_event_id text,
  p_lock_token uuid,
  p_livemode boolean,
  p_payment_intent_id text,
  p_stripe_refund_id text,
  p_amount_cents integer,
  p_currency text DEFAULT 'CHF',
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_actor text DEFAULT 'system',
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status jsonb := NULL;
BEGIN
  PERFORM private_finance.assert_webhook_lease(p_stripe_event_id, p_lock_token, p_livemode);
  PERFORM public.record_marketplace_refund_ledger(
    p_stripe_event_id, p_payment_intent_id, p_stripe_refund_id,
    p_amount_cents, p_currency, p_metadata
  );
  IF p_target_type IS NOT NULL AND p_target_id IS NOT NULL THEN
    v_status := public.record_refund_status(
      p_target_type, p_target_id, p_livemode, p_stripe_refund_id,
      p_payment_intent_id, p_amount_cents, 'succeeded', p_actor, p_reason,
      p_stripe_event_id, NULL, p_metadata
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'refund_status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_record_dispute_finance(
  p_stripe_event_id text,
  p_lock_token uuid,
  p_livemode boolean,
  p_payment_intent_id text,
  p_dispute_id text,
  p_amount_cents integer,
  p_action text,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private_finance.assert_webhook_lease(p_stripe_event_id, p_lock_token, p_livemode);
  PERFORM public.record_marketplace_dispute_ledger(
    p_stripe_event_id, p_payment_intent_id, p_dispute_id,
    p_amount_cents, p_action, p_currency, p_metadata
  );
  RETURN jsonb_build_object('ok', true, 'stripe_dispute_id', p_dispute_id, 'action', lower(p_action));
END;
$$;

-- The legacy order RPC performs an idempotency lookup before inserting. Its
-- unique key protects storage, but two simultaneous requests can otherwise
-- both pass the lookup and one can fail after starting stock work. Serialize
-- one deterministic checkout id, then let the existing RPC return the order
-- created by the first request.
CREATE OR REPLACE FUNCTION public.create_order_with_items_idempotent(
  restaurant_id_param uuid,
  delivery_address_param text,
  total_amount_param numeric,
  delivery_fee_param numeric DEFAULT 0,
  notes_param text DEFAULT NULL,
  items_param json DEFAULT NULL,
  metadata_param json DEFAULT NULL,
  checkout_id_param uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_fingerprint text;
  v_existing_order record;
BEGIN
  IF checkout_id_param IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'checkout_id_required';
  END IF;
  IF COALESCE(metadata_param::jsonb ->> '_internal_user_id', '')
    !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'internal_user_id_required';
  END IF;
  v_user_id := (metadata_param::jsonb ->> '_internal_user_id')::uuid;
  v_fingerprint := NULLIF(metadata_param::jsonb ->> 'checkout_request_fingerprint', '');
  IF v_fingerprint IS NULL OR v_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'checkout_request_fingerprint_required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('order-checkout:' || checkout_id_param::text, 0)
  );

  SELECT o.id, o.user_id, o.restaurant_id, o.metadata
  INTO v_existing_order
  FROM public.orders o
  WHERE o.idempotency_key = checkout_id_param::text;

  IF FOUND THEN
    IF v_existing_order.user_id IS DISTINCT FROM v_user_id
      OR v_existing_order.restaurant_id IS DISTINCT FROM restaurant_id_param
      OR (v_existing_order.metadata ->> 'checkout_request_fingerprint') IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'checkout_identity_mismatch';
    END IF;
    RETURN v_existing_order.id;
  END IF;

  RETURN public.create_order_with_items(
    restaurant_id_param,
    delivery_address_param,
    total_amount_param,
    delivery_fee_param,
    notes_param,
    items_param,
    metadata_param,
    checkout_id_param
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege execution grants.  SECURITY DEFINER functions are executable
-- by PUBLIC by default, so every internal finance RPC is explicitly closed and
-- re-opened only to the server-side service role.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, boolean, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_stripe_webhook_event(text, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acquire_payment_attempt(text, uuid, uuid, text, text, integer, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_payment_attempt_stripe(uuid, uuid, text, text, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seal_payment_attempt_request(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_payment_attempt(uuid, uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_payment_attempt_session(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_payment_attempt(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_payment_attempt(boolean, uuid, text, text, text, text, text, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_zero_attente_checkout_hold(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_finance_outbox(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_finance_outbox(uuid, uuid, boolean, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_refund_status(text, uuid, boolean, text, text, integer, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_refund_applied(text, uuid, text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_marketplace_refund_ledger(text, text, text, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_marketplace_dispute_ledger(text, text, text, integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_developer_statement(date, date, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_commercial_earning(boolean, uuid, uuid, text, text, text, text, integer, text, uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_commercial_statement(uuid, date, date, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_stripe_tax_fee_ledger(text, text, text, integer, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_record_checkout_finance(text, uuid, uuid, text, text, integer, boolean, text, text, uuid, text, text, jsonb, integer, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_record_refund_finance(text, uuid, boolean, text, text, integer, text, text, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_record_dispute_finance(text, uuid, boolean, text, text, integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order_with_items_idempotent(uuid, text, numeric, numeric, text, json, json, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_stripe_webhook_event(text, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_payment_attempt(text, uuid, uuid, text, text, integer, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_payment_attempt_stripe(uuid, uuid, text, text, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.seal_payment_attempt_request(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment_attempt(uuid, uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_payment_attempt_session(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_payment_attempt(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_payment_attempt(boolean, uuid, text, text, text, text, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_zero_attente_checkout_hold(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_finance_outbox(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_finance_outbox(uuid, uuid, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund_status(text, uuid, boolean, text, text, integer, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_marketplace_refund_ledger(text, text, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_marketplace_dispute_ledger(text, text, text, integer, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_developer_statement(date, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_commercial_earning(boolean, uuid, uuid, text, text, text, text, integer, text, uuid, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_commercial_statement(uuid, date, date, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_stripe_tax_fee_ledger(text, text, text, integer, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_record_checkout_finance(text, uuid, uuid, text, text, integer, boolean, text, text, uuid, text, text, jsonb, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_record_refund_finance(text, uuid, boolean, text, text, integer, text, text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_record_dispute_finance(text, uuid, boolean, text, text, integer, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order_with_items_idempotent(uuid, text, numeric, numeric, text, json, json, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) TO service_role;

REVOKE ALL ON FUNCTION private_finance.payment_attempt_json(public.payment_attempts, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_finance.set_financial_ledger_livemode()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_finance.record_refund_status(text, uuid, text, text, text, integer, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_finance.record_marketplace_reversal(text, text, text, text, integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_finance.prevent_append_only_finance_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_finance.prevent_locked_commercial_statement_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_finance.assert_webhook_lease(text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.payment_attempts IS
  'Durable idempotency state machine: one row per Stripe mode and stable business operation key.';
COMMENT ON COLUMN public.payment_attempts.generation IS
  'Advances only after a known Stripe session is explicitly abandoned; ambiguous retries keep the same idempotency key.';
COMMENT ON COLUMN public.payment_attempts.request_snapshot IS
  'Server-only immutable Stripe request snapshot for the current generation; never exposed to client roles.';
COMMENT ON TABLE public.finance_outbox IS
  'Transactional outbox for finance side effects. Recoverable leases prevent a process crash from losing work.';
COMMENT ON TABLE public.refund_operations IS
  'Idempotent Stripe refund lifecycle. Only succeeded operations affect refunded business totals.';
COMMENT ON TABLE public.commercial_earning_events IS
  'Append-only commercial accruals and reversals, each proven by a collected or reversed TOK revenue ledger entry.';
COMMENT ON TABLE public.commercial_statements IS
  'Immutable-on-validation cash-basis commercial statements built only from commercial_earning_events.';

COMMIT;

NOTIFY pgrst, 'reload schema';
