-- Keep every client payment path closed when a restaurant is not publicly visible.
-- This migration is intentionally append-only because the onboarding migrations are
-- already deployed in Production.

CREATE OR REPLACE FUNCTION public.restaurant_subscription_genuine_client(
  p_user_id uuid,
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    p_user_id IS NOT NULL
    AND p_restaurant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.restaurants restaurant
      WHERE restaurant.id = p_restaurant_id
        AND restaurant.owner_id IS DISTINCT FROM p_user_id
        AND public.restaurant_is_publicly_visible(restaurant.id)
    )
    AND public.has_role(p_user_id, 'client'::public.app_role)
    AND NOT public.has_role(p_user_id, 'commercial'::public.app_role)
    AND NOT public.has_role(p_user_id, 'admin'::public.app_role)
    AND NOT COALESCE(public.commercial_demo_user_is_restricted(p_user_id), false);
$function$;

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
    OR p_authorized_amount <> v_order.subtotal
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
    authorization_amount = p_authorized_amount,
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
  WITH claimable AS (
    SELECT gmo.id
    FROM public.group_member_orders gmo
    JOIN public.order_groups og ON og.id = gmo.group_id
    WHERE og.status = 'payment_pending'
      AND og.is_active = false
      AND gmo.status = 'payment_pending'
      AND gmo.payment_status = 'authorized'
      AND gmo.stripe_payment_intent_id IS NOT NULL
      AND gmo.final_total > 0
      AND COALESCE(gmo.capture_attempts, 0) < 5
      AND (
        gmo.capture_attempted_at IS NULL
        OR gmo.capture_attempted_at < now() - interval '5 minutes'
      )
    ORDER BY og.closed_at ASC NULLS LAST, gmo.joined_at ASC
    FOR UPDATE OF gmo SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250)
  ), claimed AS (
    UPDATE public.group_member_orders gmo
    SET capture_attempted_at = now(),
        updated_at = now()
    FROM claimable
    WHERE gmo.id = claimable.id
    RETURNING gmo.*
  )
  SELECT
    claimed.id AS member_order_id,
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
    lower(COALESCE(claimed.metadata->>'currency', 'chf')) AS currency
  FROM claimed;
$function$;

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

  UPDATE public.group_member_orders
  SET
    capture_attempts = COALESCE(capture_attempts, 0) + 1,
    capture_attempted_at = CASE WHEN p_terminal THEN now() ELSE NULL END,
    last_payment_error = LEFT(COALESCE(p_error, 'Capture Stripe echouee'), 500),
    payment_status = CASE WHEN p_terminal THEN 'failed' ELSE payment_status END,
    status = CASE WHEN p_terminal THEN 'expired' ELSE status END,
    updated_at = now()
  WHERE id = p_member_order_id
    AND payment_status IN ('pending', 'authorized')
    AND status IN ('joined', 'payment_pending');

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_match_group_member_captured(
  p_member_order_id uuid,
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
  v_group_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.group_member_orders
    WHERE id = p_member_order_id
      AND stripe_payment_intent_id = p_payment_intent_id
      AND payment_status = 'captured'
      AND status = 'paid'
  ) THEN
    RETURN true;
  END IF;

  UPDATE public.group_member_orders
  SET
    status = 'paid',
    payment_status = 'captured',
    captured_at = COALESCE(captured_at, now()),
    paid_at = COALESCE(paid_at, now()),
    stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_payment_intent_id),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'captured_amount', p_captured_amount,
      'capture_metadata', COALESCE(p_metadata, '{}'::jsonb)
    ),
    last_payment_error = NULL,
    updated_at = now()
  WHERE id = p_member_order_id
    AND stripe_payment_intent_id = p_payment_intent_id
    AND (
      (payment_status = 'authorized' AND status = 'payment_pending')
      OR (payment_status = 'failed' AND status = 'expired')
    )
  RETURNING group_id INTO v_group_id;

  IF v_group_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.order_groups og
  SET status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.group_member_orders gmo
        WHERE gmo.group_id = v_group_id
          AND gmo.status = 'payment_pending'
          AND gmo.payment_status = 'authorized'
      ) THEN 'completed'
      ELSE og.status
    END,
    finalized_at = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.group_member_orders gmo
        WHERE gmo.group_id = v_group_id
          AND gmo.status = 'payment_pending'
          AND gmo.payment_status = 'authorized'
      ) THEN now()
      ELSE og.finalized_at
    END
  WHERE og.id = v_group_id;

  RETURN true;
END;
$function$;
