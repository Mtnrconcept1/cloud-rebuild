-- Reservation card guarantees. Money is never held for an indefinite period:
-- Checkout setup mode saves a consented card; any future charge is a separate
-- off-session Stripe PaymentIntent with its own immutable audit record.
BEGIN;

CREATE TABLE IF NOT EXISTS public.reservation_card_guarantee_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  date date NOT NULL,
  time time without time zone NOT NULL,
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 50),
  feature text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  progressive_offer_id uuid,
  acquisition_source text,
  acquisition_channel_token text,
  fee_amount_cents integer NOT NULL CHECK (fee_amount_cents = party_size * 1000),
  policy_version text NOT NULL DEFAULT 'reservation-cancellation-v1',
  consented_at timestamptz NOT NULL DEFAULT now(),
  stripe_customer_id text,
  stripe_checkout_session_id text UNIQUE,
  stripe_setup_intent_id text UNIQUE,
  stripe_payment_method_id text,
  reservation_id uuid UNIQUE REFERENCES public.reservations(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checkout_ready', 'confirmed', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.reservation_cancellation_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.reservations(id),
  setup_id uuid NOT NULL REFERENCES public.reservation_card_guarantee_setups(id),
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'chf' CHECK (currency = 'chf'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'requires_action', 'failed')),
  stripe_payment_intent_id text UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_until timestamptz,
  last_error_code text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reservation_card_guarantee_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_cancellation_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reservation_card_guarantee_setups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reservation_cancellation_fees FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.reservation_card_guarantee_setups TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.reservation_cancellation_fees TO service_role;

CREATE INDEX IF NOT EXISTS idx_reservation_card_setups_user_created
  ON public.reservation_card_guarantee_setups (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_cancel_fees_claim
  ON public.reservation_cancellation_fees (status, lease_until, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_reservation_customer_cancellations_year
  ON public.reservations (user_id, cancelled_at)
  WHERE cancelled_by = 'customer' AND status = 'cancelled';

-- Count cancellations by cancellation date, not the date of the booked meal.
-- Use the Europe/Zurich civil year, including its DST boundaries.
CREATE OR REPLACE FUNCTION public.reservation_card_guarantee_quote(
  p_user_id uuid, p_party_size integer
)
RETURNS TABLE(
  is_required boolean,
  cancellation_count bigint,
  reason text,
  fee_amount_cents integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_count bigint;
BEGIN
  IF p_user_id IS NULL OR p_party_size IS NULL OR p_party_size < 1 OR p_party_size > 50 THEN
    RAISE EXCEPTION 'Invalid reservation guarantee quote' USING ERRCODE = '22023';
  END IF;
  v_start := date_trunc('year', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich';
  v_end := (date_trunc('year', now() AT TIME ZONE 'Europe/Zurich') + interval '1 year') AT TIME ZONE 'Europe/Zurich';
  SELECT count(*) INTO v_count
    FROM public.reservations r
    WHERE r.user_id = p_user_id
      AND r.cancelled_by = 'customer'
      AND r.status = 'cancelled'
      -- Google Actions Center currently uses one shared service identity for
      -- multiple guests. Its cancellations must not count against each other.
      AND coalesce(r.metadata ->> 'google_actions_center', 'false') <> 'true'
      AND r.cancelled_at >= v_start
      AND r.cancelled_at < v_end;
  is_required := p_party_size > 6 OR v_count >= 3;
  cancellation_count := v_count;
  reason := CASE
    WHEN p_party_size > 6 AND v_count >= 3 THEN 'large_party_and_repeated_cancellations'
    WHEN p_party_size > 6 THEN 'large_party'
    WHEN v_count >= 3 THEN 'repeated_cancellations'
    ELSE 'none'
  END;
  fee_amount_cents := CASE WHEN is_required THEN p_party_size * 1000 ELSE 0 END;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.reservation_card_guarantee_quote(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservation_card_guarantee_quote(uuid, integer) TO service_role;

-- A service-role call alone is not evidence of an accepted card. Only the
-- finalizer can set the transaction-local setup context after Stripe verifies
-- Checkout + SetupIntent, and the trigger cross-checks the verified row.
CREATE OR REPLACE FUNCTION public.guard_reservation_card_guarantee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_required boolean;
  v_setup_id text := current_setting('tok.reservation_card_setup_id', true);
  v_verified boolean;
BEGIN
  IF NEW.user_id IS NULL
    OR lower(coalesce(NEW.feature, '')) IN ('zero-attente', 'chefs_table')
    THEN RETURN NEW;
  END IF;

  SELECT q.is_required INTO v_required
  FROM public.reservation_card_guarantee_quote(NEW.user_id, NEW.party_size) q;

  IF NOT coalesce(v_required, false) THEN RETURN NEW; END IF;
  IF v_setup_id IS NULL OR v_setup_id = ''
     OR v_setup_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'card_guarantee_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT true INTO v_verified
  FROM public.reservation_card_guarantee_setups s
  WHERE s.id = v_setup_id::uuid
    AND s.user_id = NEW.user_id
    AND s.restaurant_id = NEW.restaurant_id
    AND s.date = NEW.date
    AND s.time = NEW.time
    AND s.party_size = NEW.party_size
    AND lower(s.feature) = lower(NEW.feature)
    AND s.status = 'checkout_ready'
    AND s.stripe_customer_id IS NOT NULL
    AND s.stripe_checkout_session_id IS NOT NULL
    AND s.stripe_setup_intent_id IS NOT NULL
    AND s.stripe_payment_method_id IS NOT NULL
    AND s.consented_at IS NOT NULL
    AND NEW.metadata ->> 'card_guarantee_setup_id' = s.id::text
  LIMIT 1;

  IF NOT coalesce(v_verified, false) THEN
    RAISE EXCEPTION 'card_guarantee_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reservation_card_guarantee_insert ON public.reservations;
CREATE TRIGGER guard_reservation_card_guarantee_insert
BEFORE INSERT ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_card_guarantee();

-- Finalization is one DB transaction: two parallel webhook/return handlers
-- cannot create two bookings for one SetupIntent.
CREATE OR REPLACE FUNCTION public.finalize_reservation_card_guarantee(
  p_setup_id uuid,
  p_checkout_session_id text,
  p_customer_id text,
  p_setup_intent_id text,
  p_payment_method_id text
)
RETURNS TABLE(reservation_id uuid, error_code text, error_message text, newly_confirmed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_setup public.reservation_card_guarantee_setups%ROWTYPE;
  v_reservation_id uuid;
  v_error_code text;
  v_error_message text;
  v_meta jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_setup FROM public.reservation_card_guarantee_setups
  WHERE id = p_setup_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card guarantee setup missing' USING ERRCODE = '22023';
  END IF;

  IF v_setup.status = 'confirmed' AND v_setup.reservation_id IS NOT NULL THEN
    reservation_id := v_setup.reservation_id;
    error_code := NULL;
    error_message := NULL;
    newly_confirmed := false;
    RETURN NEXT; RETURN;
  END IF;

  IF v_setup.status <> 'checkout_ready'
     OR NULLIF(v_setup.stripe_checkout_session_id, '') IS DISTINCT FROM p_checkout_session_id
     OR NULLIF(v_setup.stripe_customer_id, '') IS DISTINCT FROM p_customer_id
     OR NULLIF(p_setup_intent_id, '') IS NULL
     OR NULLIF(p_payment_method_id, '') IS NULL
  THEN
    RAISE EXCEPTION 'Card guarantee setup state mismatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.reservation_card_guarantee_setups s
  SET stripe_setup_intent_id = p_setup_intent_id,
      stripe_payment_method_id = p_payment_method_id,
      updated_at = now()
  WHERE s.id = p_setup_id;

  v_meta := coalesce(v_setup.metadata, '{}'::jsonb)
    || jsonb_build_object(
      '_internal_user_id', v_setup.user_id,
      'card_guarantee_setup_id', v_setup.id,
      'card_guarantee_fee_chf', v_setup.fee_amount_cents / 100.0,
      'card_guarantee_policy_version', v_setup.policy_version,
      'acquisition_source', coalesce(v_setup.acquisition_source, 'tok_marketplace')
    );

  PERFORM set_config('tok.reservation_card_setup_id', v_setup.id::text, true);
  SELECT r.reservation_id, r.error_code, r.error_message
    INTO v_reservation_id, v_error_code, v_error_message
  FROM public.validate_and_create_reservation_safe(
    v_setup.restaurant_id,
    v_setup.date,
    v_setup.time,
    v_setup.party_size,
    v_setup.feature,
    v_meta,
    v_setup.notes,
    v_setup.progressive_offer_id
  ) r;
  PERFORM set_config('tok.reservation_card_setup_id', '', true);

  IF v_reservation_id IS NULL THEN
    UPDATE public.reservation_card_guarantee_setups s
    SET status = 'failed',
        error_code = coalesce(v_error_code, 'reservation_unavailable'),
        updated_at = now()
    WHERE s.id = p_setup_id;
    reservation_id := NULL;
    error_code := coalesce(v_error_code, 'reservation_unavailable');
    error_message := coalesce(v_error_message, 'Le creneau n''est plus disponible.');
    newly_confirmed := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.reservation_card_guarantee_setups s
  SET status = 'confirmed',
      reservation_id = v_reservation_id,
      confirmed_at = now(),
      error_code = NULL,
      updated_at = now()
  WHERE s.id = p_setup_id;

  reservation_id := v_reservation_id;
  error_code := NULL;
  error_message := NULL;
  newly_confirmed := true;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_reservation_card_guarantee(uuid, text, text, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_card_guarantee(uuid, text, text, text, text)
TO service_role;

-- All cancellation channels (app, Google, partner) converge here. A client
-- cancellation can enqueue at most one fee, and historical bookings have no
-- setup row so can never be charged retroactively.
CREATE OR REPLACE FUNCTION public.queue_reservation_card_cancellation_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_setup public.reservation_card_guarantee_setups%ROWTYPE;
BEGIN
  IF lower(coalesce(NEW.status, '')) <> 'cancelled'
     OR lower(coalesce(OLD.status, '')) = 'cancelled'
     OR NEW.cancelled_by IS DISTINCT FROM 'customer'
  THEN RETURN NEW; END IF;

  SELECT * INTO v_setup FROM public.reservation_card_guarantee_setups s
  WHERE s.reservation_id = NEW.id AND s.status = 'confirmed'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.reservation_cancellation_fees (
    reservation_id, setup_id, user_id, restaurant_id, amount_cents
  )
  VALUES (NEW.id, v_setup.id, NEW.user_id, NEW.restaurant_id, v_setup.fee_amount_cents)
  ON CONFLICT (reservation_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS queue_reservation_card_cancellation_fee ON public.reservations;
CREATE TRIGGER queue_reservation_card_cancellation_fee
AFTER UPDATE OF status ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.queue_reservation_card_cancellation_fee();

-- Claim batches safely under overlapping hourly workers. Failed card
-- authentication is never retried silently as a new charge.
CREATE OR REPLACE FUNCTION public.claim_reservation_cancellation_fees(p_limit integer DEFAULT 50)
RETURNS TABLE(
  fee_id uuid, reservation_id uuid, user_id uuid, amount_cents integer,
  stripe_customer_id text, stripe_payment_method_id text,
  stripe_payment_intent_id text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT f.id
    FROM public.reservation_cancellation_fees f
    INNER JOIN public.reservations r ON r.id = f.reservation_id
    WHERE (f.status = 'pending'
      OR (f.status = 'processing' AND f.lease_until < now()))
      AND f.attempt_count < 10
      AND r.status = 'cancelled'
      AND r.cancelled_by = 'customer'
    ORDER BY f.created_at
    LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 100)
    FOR UPDATE OF f SKIP LOCKED
  ), marked AS (
    UPDATE public.reservation_cancellation_fees f
    SET status = 'processing',
        attempt_count = f.attempt_count + 1,
        lease_until = now() + interval '5 minutes',
        updated_at = now()
    WHERE f.id IN (SELECT id FROM claimed)
    RETURNING f.*
  )
  SELECT m.id, m.reservation_id, m.user_id, m.amount_cents,
         s.stripe_customer_id, s.stripe_payment_method_id,
         m.stripe_payment_intent_id
  FROM marked m
  JOIN public.reservation_card_guarantee_setups s ON s.id = m.setup_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_reservation_cancellation_fees(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reservation_cancellation_fees(integer) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
