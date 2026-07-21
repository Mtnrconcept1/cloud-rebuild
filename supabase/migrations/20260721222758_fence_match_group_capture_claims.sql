-- Fence Stripe captures with an opaque, renewable database claim.
--
-- Deployment compatibility:
--   * the legacy bulk candidate RPC is paused by this migration;
--   * every previously authorized candidate is fenced for fifteen minutes,
--     longer than the maximum hosted Edge invocation, so even the oldest
--     production worker (which did not persist a claim timestamp) drains;
--   * the new worker claims one row at a time and must renew its token while
--     holding the restaurant row lock immediately before calling Stripe.

ALTER TABLE public.group_member_orders
  ADD COLUMN IF NOT EXISTS capture_claim_token uuid,
  ADD COLUMN IF NOT EXISTS capture_claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_retry_after timestamptz;

CREATE INDEX IF NOT EXISTS idx_group_member_orders_capture_claim_queue
  ON public.group_member_orders (
    capture_retry_after,
    capture_claim_expires_at,
    joined_at
  )
  WHERE status = 'payment_pending'
    AND payment_status = 'authorized';

CREATE INDEX IF NOT EXISTS idx_group_member_orders_live_capture_by_restaurant
  ON public.group_member_orders (
    restaurant_id,
    capture_claim_expires_at
  )
  WHERE status = 'payment_pending'
    AND payment_status = 'authorized'
    AND capture_claim_token IS NOT NULL;

-- The table is writable by authenticated admins through PostgREST. Claims are
-- an internal concurrency primitive: no API JWT, including an admin JWT, may
-- forge/clear them or mutate/delete the business row while a live claim fences
-- an external Stripe write. Service-role RPCs remain the only write path.
CREATE OR REPLACE FUNCTION public.protect_match_group_capture_claim_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_api_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_api_role NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.capture_claim_token IS NOT NULL
      OR NEW.capture_claim_expires_at IS NOT NULL
      OR NEW.capture_retry_after IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'MATCH_GROUP_CAPTURE_CLAIM_SERVER_MANAGED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.capture_claim_token IS NOT NULL
    AND OLD.capture_claim_expires_at > clock_timestamp()
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MATCH_GROUP_CAPTURE_IN_PROGRESS';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.capture_claim_token IS DISTINCT FROM OLD.capture_claim_token
      OR NEW.capture_claim_expires_at IS DISTINCT FROM OLD.capture_claim_expires_at
      OR NEW.capture_retry_after IS DISTINCT FROM OLD.capture_retry_after
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'MATCH_GROUP_CAPTURE_CLAIM_SERVER_MANAGED';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_match_group_capture_claim_insert
  ON public.group_member_orders;
CREATE TRIGGER protect_match_group_capture_claim_insert
BEFORE INSERT
ON public.group_member_orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_match_group_capture_claim_fields();

DROP TRIGGER IF EXISTS protect_match_group_capture_claim_mutation
  ON public.group_member_orders;
CREATE TRIGGER protect_match_group_capture_claim_mutation
BEFORE UPDATE OR DELETE
ON public.group_member_orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_match_group_capture_claim_fields();

-- Production's pre-PR worker could read a bulk lot without writing
-- capture_attempted_at. Fence every currently payable authorization, not only
-- recent timestamps, while that legacy invocation drains. The new worker will
-- reclaim these rows after fifteen minutes and reconcile Stripe truth.
UPDATE public.group_member_orders gmo
SET capture_claim_token = gen_random_uuid(),
    capture_claim_expires_at = clock_timestamp() + interval '15 minutes',
    capture_attempted_at = COALESCE(gmo.capture_attempted_at, clock_timestamp()),
    updated_at = now()
FROM public.order_groups og
WHERE og.id = gmo.group_id
  AND og.status = 'payment_pending'
  AND og.is_active = false
  AND gmo.status = 'payment_pending'
  AND gmo.payment_status = 'authorized'
  AND gmo.stripe_payment_intent_id IS NOT NULL
  AND gmo.final_total > 0
  AND gmo.capture_claim_token IS NULL;

-- Pause the legacy bulk worker between the database migration and the Edge
-- Function deployment. The replacement worker exclusively uses the tokenized
-- single-row claim below.
CREATE OR REPLACE FUNCTION public.get_match_group_capture_candidates(
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  member_order_id uuid,
  group_id uuid,
  user_id uuid,
  restaurant_id uuid,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  subtotal numeric,
  final_discount_percentage numeric,
  final_discount_amount numeric,
  final_total numeric,
  capture_attempts integer,
  currency text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    NULL::text,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::integer,
    NULL::text
  WHERE false;
$function$;

-- Stripe line items are integer cents. Compare the value written by the Edge
-- Function at the same precision instead of relying on exact decimal/float
-- equality after JavaScript serialization.
CREATE OR REPLACE FUNCTION public.mark_match_group_member_authorized(
  p_member_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_authorized_amount numeric,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.group_member_orders%ROWTYPE;
  v_group public.order_groups%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM public.group_member_orders
  WHERE id = p_member_order_id
    AND stripe_checkout_session_id = p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND
    OR NULLIF(btrim(COALESCE(p_payment_intent_id, '')), '') IS NULL
    OR p_authorized_amount IS NULL
    OR p_authorized_amount <= 0
    OR round(p_authorized_amount * 100) <> round(v_order.subtotal * 100)
  THEN
    RETURN false;
  END IF;

  IF v_order.payment_status = 'captured' OR v_order.status = 'paid' THEN
    RETURN false;
  END IF;

  IF v_order.payment_status = 'authorized' THEN
    RETURN v_order.stripe_payment_intent_id = p_payment_intent_id
      AND public.restaurant_is_publicly_visible(v_order.restaurant_id);
  END IF;

  IF v_order.payment_status <> 'pending'
    OR v_order.status <> 'joined'
    OR v_order.stripe_payment_intent_id IS NOT NULL
  THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_group
  FROM public.order_groups
  WHERE id = v_order.group_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_group.status <> 'open'
    OR v_group.is_active IS NOT TRUE
    OR COALESCE(v_group.lock_at, v_group.expires_at) IS NULL
    OR COALESCE(v_group.lock_at, v_group.expires_at) <= now()
  THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_order.restaurant_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_restaurant.is_active IS NOT TRUE
    OR v_restaurant.is_demo IS NOT FALSE
    OR lower(COALESCE(v_restaurant.status, '')) <> 'active'
  THEN
    RETURN false;
  END IF;

  UPDATE public.group_member_orders
  SET
    payment_status = 'authorized',
    stripe_payment_intent_id = p_payment_intent_id,
    authorization_amount = round(p_authorized_amount * 100) / 100,
    authorized_at = COALESCE(authorized_at, now()),
    metadata = COALESCE(metadata, '{}'::jsonb)
      || COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'sent_to_restaurant_at', now(),
        'restaurant_preorder_status', 'received_after_prepayment'
      ),
    last_payment_error = NULL,
    updated_at = now()
  WHERE id = p_member_order_id;

  PERFORM public.refresh_match_group_discount(v_order.group_id);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_next_match_group_capture_candidate()
RETURNS TABLE(
  member_order_id uuid,
  group_id uuid,
  user_id uuid,
  restaurant_id uuid,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  subtotal numeric,
  final_discount_percentage numeric,
  final_discount_amount numeric,
  final_total numeric,
  capture_attempts integer,
  currency text,
  capture_claim_token uuid,
  restaurant_eligible boolean
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH claimable AS (
    SELECT
      gmo.id,
      (
        restaurant.is_active IS TRUE
        AND restaurant.is_demo IS FALSE
        AND lower(COALESCE(restaurant.status, '')) = 'active'
      ) AS restaurant_eligible
    FROM public.group_member_orders gmo
    JOIN public.order_groups og ON og.id = gmo.group_id
    JOIN public.restaurants restaurant ON restaurant.id = gmo.restaurant_id
    WHERE og.status = 'payment_pending'
      AND og.is_active = false
      AND gmo.status = 'payment_pending'
      AND gmo.payment_status = 'authorized'
      AND gmo.stripe_payment_intent_id IS NOT NULL
      AND gmo.final_total > 0
      AND (
        gmo.capture_retry_after IS NULL
        OR gmo.capture_retry_after <= clock_timestamp()
      )
      AND (
        gmo.capture_claim_token IS NULL
        OR gmo.capture_claim_expires_at IS NULL
        OR gmo.capture_claim_expires_at <= clock_timestamp()
      )
    ORDER BY og.closed_at ASC NULLS LAST, gmo.joined_at ASC
    FOR UPDATE OF gmo, restaurant SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.group_member_orders gmo
    SET capture_claim_token = gen_random_uuid(),
        capture_claim_expires_at = clock_timestamp() + interval '15 minutes',
        capture_attempted_at = clock_timestamp(),
        updated_at = now()
    FROM claimable
    WHERE gmo.id = claimable.id
    RETURNING gmo.*, claimable.restaurant_eligible
  )
  SELECT
    claimed.id,
    claimed.group_id,
    claimed.user_id,
    claimed.restaurant_id,
    claimed.stripe_payment_intent_id,
    claimed.stripe_checkout_session_id,
    claimed.subtotal,
    claimed.final_discount_percentage,
    claimed.final_discount_amount,
    claimed.final_total,
    claimed.capture_attempts,
    lower(COALESCE(claimed.metadata->>'currency', 'chf')),
    claimed.capture_claim_token,
    claimed.restaurant_eligible
  FROM claimed;
$function$;

CREATE OR REPLACE FUNCTION public.renew_match_group_capture_claim(
  p_member_order_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_restaurant_id uuid;
BEGIN
  SELECT gmo.restaurant_id
  INTO v_restaurant_id
  FROM public.group_member_orders gmo
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token
    AND gmo.capture_claim_expires_at > clock_timestamp()
    AND gmo.status = 'payment_pending'
    AND gmo.payment_status = 'authorized'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.restaurants restaurant
  WHERE restaurant.id = v_restaurant_id
    AND restaurant.is_active IS TRUE
    AND restaurant.is_demo IS FALSE
    AND lower(COALESCE(restaurant.status, '')) = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.group_member_orders gmo
  SET capture_claim_expires_at = clock_timestamp() + interval '15 minutes',
      updated_at = now()
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token
    AND gmo.status = 'payment_pending'
    AND gmo.payment_status = 'authorized';

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.renew_match_group_capture_cancellation_claim(
  p_member_order_id uuid,
  p_claim_token uuid,
  p_require_restaurant_ineligible boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_restaurant_eligible boolean;
BEGIN
  SELECT gmo.restaurant_id
  INTO v_restaurant_id
  FROM public.group_member_orders gmo
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token
    AND gmo.capture_claim_expires_at > clock_timestamp()
    AND gmo.status = 'payment_pending'
    AND gmo.payment_status = 'authorized'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT (
    restaurant.is_active IS TRUE
    AND restaurant.is_demo IS FALSE
    AND lower(COALESCE(restaurant.status, '')) = 'active'
  )
  INTO v_restaurant_eligible
  FROM public.restaurants restaurant
  WHERE restaurant.id = v_restaurant_id
  FOR UPDATE;

  IF NOT FOUND
    OR (p_require_restaurant_ineligible AND v_restaurant_eligible)
  THEN
    RETURN false;
  END IF;

  UPDATE public.group_member_orders gmo
  SET capture_claim_expires_at = clock_timestamp() + interval '15 minutes',
      updated_at = now()
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token
    AND gmo.status = 'payment_pending'
    AND gmo.payment_status = 'authorized';

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_match_group_capture_claim(
  p_member_order_id uuid,
  p_claim_token uuid,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.group_member_orders gmo
  SET capture_claim_token = NULL,
      capture_claim_expires_at = NULL,
      capture_retry_after = clock_timestamp() + interval '1 minute',
      last_payment_error = CASE
        WHEN p_error IS NULL THEN gmo.last_payment_error
        ELSE LEFT(p_error, 500)
      END,
      updated_at = now()
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token
    AND gmo.status = 'payment_pending'
    AND gmo.payment_status = 'authorized';

  RETURN FOUND;
END;
$function$;

-- Confirmation/reconciliation endpoints still use this non-claim RPC to
-- reject an authorization before the capture worker owns it. Once a token is
-- present, only the fenced RPC below may mutate the payment state.
CREATE OR REPLACE FUNCTION public.mark_match_group_member_capture_failed(
  p_member_order_id uuid,
  p_error text,
  p_terminal boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.group_member_orders
    WHERE id = p_member_order_id
      AND payment_status = 'failed'
      AND status = 'expired'
  ) THEN
    RETURN true;
  END IF;

  UPDATE public.group_member_orders gmo
  SET capture_attempts = COALESCE(gmo.capture_attempts, 0) + 1,
      capture_attempted_at = CASE WHEN p_terminal THEN clock_timestamp() ELSE NULL END,
      last_payment_error = LEFT(COALESCE(p_error, 'Capture Stripe echouee'), 500),
      payment_status = CASE WHEN p_terminal THEN 'failed' ELSE gmo.payment_status END,
      status = CASE WHEN p_terminal THEN 'expired' ELSE gmo.status END,
      updated_at = now()
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token IS NULL
    AND gmo.payment_status IN ('pending', 'authorized')
    AND gmo.status IN ('joined', 'payment_pending');

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_match_group_member_capture_failed_claimed(
  p_member_order_id uuid,
  p_claim_token uuid,
  p_error text,
  p_terminal boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.group_member_orders gmo
  SET capture_attempts = COALESCE(gmo.capture_attempts, 0) + 1,
      capture_attempted_at = clock_timestamp(),
      capture_claim_token = NULL,
      capture_claim_expires_at = NULL,
      capture_retry_after = CASE
        WHEN p_terminal THEN NULL
        ELSE clock_timestamp() + interval '1 minute'
      END,
      last_payment_error = LEFT(COALESCE(p_error, 'Capture Stripe echouee'), 500),
      payment_status = CASE WHEN p_terminal THEN 'failed' ELSE gmo.payment_status END,
      status = CASE WHEN p_terminal THEN 'expired' ELSE gmo.status END,
      updated_at = now()
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token
    AND gmo.status = 'payment_pending'
    AND gmo.payment_status = 'authorized';

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_match_group_member_captured_claimed(
  p_member_order_id uuid,
  p_claim_token uuid,
  p_payment_intent_id text,
  p_captured_amount numeric,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marked boolean;
BEGIN
  PERFORM 1
  FROM public.group_member_orders gmo
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_marked := public.mark_match_group_member_captured(
    p_member_order_id,
    p_payment_intent_id,
    p_captured_amount,
    p_metadata
  );

  IF v_marked IS NOT TRUE THEN
    RETURN false;
  END IF;

  UPDATE public.group_member_orders gmo
  SET capture_claim_token = NULL,
      capture_claim_expires_at = NULL,
      capture_retry_after = NULL,
      updated_at = now()
  WHERE gmo.id = p_member_order_id
    AND gmo.capture_claim_token = p_claim_token;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fence_restaurant_payment_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_public boolean;
  v_new_public boolean;
  v_has_live_claim boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.group_member_orders gmo
    WHERE gmo.restaurant_id = OLD.id
      AND gmo.status = 'payment_pending'
      AND gmo.payment_status = 'authorized'
      AND gmo.capture_claim_token IS NOT NULL
      AND gmo.capture_claim_expires_at > clock_timestamp()
  )
  INTO v_has_live_claim;

  IF TG_OP = 'DELETE' THEN
    IF v_has_live_claim THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'RESTAURANT_PAYMENT_CAPTURE_IN_PROGRESS';
    END IF;
    RETURN OLD;
  END IF;

  v_old_public := OLD.is_active IS TRUE
    AND OLD.is_demo IS FALSE
    AND lower(COALESCE(OLD.status, '')) = 'active';
  v_new_public := NEW.is_active IS TRUE
    AND NEW.is_demo IS FALSE
    AND lower(COALESCE(NEW.status, '')) = 'active';

  IF v_old_public IS DISTINCT FROM v_new_public AND v_has_live_claim THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'RESTAURANT_PAYMENT_CAPTURE_IN_PROGRESS';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_fence_restaurant_payment_capture_update
  ON public.restaurants;
CREATE TRIGGER zz_fence_restaurant_payment_capture_update
BEFORE UPDATE OF status, is_active, is_demo
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.fence_restaurant_payment_capture();

DROP TRIGGER IF EXISTS zz_fence_restaurant_payment_capture_delete
  ON public.restaurants;
CREATE TRIGGER zz_fence_restaurant_payment_capture_delete
BEFORE DELETE
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.fence_restaurant_payment_capture();

REVOKE ALL ON FUNCTION public.get_match_group_capture_candidates(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_match_group_member_capture_failed(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_match_group_member_captured(uuid, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_next_match_group_capture_candidate()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_match_group_capture_claim(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_match_group_capture_cancellation_claim(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_match_group_capture_claim(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_match_group_member_capture_failed_claimed(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_match_group_member_captured_claimed(uuid, uuid, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fence_restaurant_payment_capture()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_match_group_capture_claim_fields()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_match_group_capture_candidates(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_capture_failed(uuid, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_match_group_capture_candidate()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_match_group_capture_claim(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_match_group_capture_cancellation_claim(uuid, uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_match_group_capture_claim(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_capture_failed_claimed(uuid, uuid, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_captured_claimed(uuid, uuid, text, numeric, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
