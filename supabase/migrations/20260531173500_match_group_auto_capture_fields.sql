ALTER TABLE public.group_member_orders
  ADD COLUMN IF NOT EXISTS authorization_amount numeric,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_error text;

CREATE INDEX IF NOT EXISTS group_member_orders_capture_candidates_idx
  ON public.group_member_orders(status, payment_status, payment_due_at, stripe_payment_intent_id)
  WHERE status = 'payment_pending' AND payment_status = 'authorized';

CREATE OR REPLACE FUNCTION public.get_match_group_capture_candidates(p_limit integer DEFAULT 100)
RETURNS TABLE (
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
SET search_path = public
AS $$
  SELECT
    gmo.id AS member_order_id,
    gmo.group_id,
    gmo.user_id,
    gmo.restaurant_id,
    gmo.stripe_payment_intent_id,
    gmo.stripe_checkout_session_id,
    gmo.subtotal,
    gmo.final_discount_percentage,
    gmo.final_discount_amount,
    gmo.final_total,
    gmo.capture_attempts,
    lower(COALESCE(gmo.metadata->>'currency', 'chf')) AS currency
  FROM public.group_member_orders gmo
  JOIN public.order_groups og ON og.id = gmo.group_id
  WHERE og.status = 'payment_pending'
    AND og.is_active = false
    AND gmo.status = 'payment_pending'
    AND gmo.payment_status = 'authorized'
    AND gmo.stripe_payment_intent_id IS NOT NULL
    AND gmo.final_total > 0
    AND gmo.capture_attempts < 5
  ORDER BY og.closed_at ASC NULLS LAST, gmo.joined_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
$$;

CREATE OR REPLACE FUNCTION public.mark_match_group_member_captured(
  p_member_order_id uuid,
  p_payment_intent_id text,
  p_captured_amount numeric,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  UPDATE public.group_member_orders
  SET
    status = 'paid',
    payment_status = 'captured',
    captured_at = now(),
    paid_at = now(),
    stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_payment_intent_id),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'captured_amount', p_captured_amount,
      'capture_metadata', COALESCE(p_metadata, '{}'::jsonb)
    ),
    last_payment_error = NULL,
    updated_at = now()
  WHERE id = p_member_order_id
    AND stripe_payment_intent_id = p_payment_intent_id
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
$$;

CREATE OR REPLACE FUNCTION public.mark_match_group_member_capture_failed(
  p_member_order_id uuid,
  p_error text,
  p_terminal boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_member_orders
  SET
    capture_attempts = COALESCE(capture_attempts, 0) + 1,
    capture_attempted_at = now(),
    last_payment_error = LEFT(COALESCE(p_error, 'Capture Stripe echouee'), 500),
    payment_status = CASE WHEN p_terminal THEN 'failed' ELSE payment_status END,
    status = CASE WHEN p_terminal THEN 'expired' ELSE status END,
    updated_at = now()
  WHERE id = p_member_order_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_match_group_authorization_failed(
  p_member_order_id uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_member_orders
  SET
    payment_status = 'failed',
    last_payment_error = LEFT(COALESCE(p_error, 'Autorisation Stripe echouee'), 500),
    updated_at = now()
  WHERE id = p_member_order_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_match_group_capture_candidates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_group_capture_candidates(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_match_group_member_captured(uuid, text, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_captured(uuid, text, numeric, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_match_group_member_capture_failed(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_capture_failed(uuid, text, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_match_group_authorization_failed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_match_group_authorization_failed(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
