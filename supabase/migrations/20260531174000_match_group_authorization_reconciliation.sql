CREATE OR REPLACE FUNCTION public.get_match_group_pending_authorizations(p_limit integer DEFAULT 100)
RETURNS TABLE (
  member_order_id uuid,
  group_id uuid,
  user_id uuid,
  restaurant_id uuid,
  stripe_checkout_session_id text,
  subtotal numeric,
  payment_status text,
  status text
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
    gmo.stripe_checkout_session_id,
    gmo.subtotal,
    gmo.payment_status,
    gmo.status
  FROM public.group_member_orders gmo
  JOIN public.order_groups og ON og.id = gmo.group_id
  WHERE gmo.status = 'joined'
    AND gmo.payment_status = 'pending'
    AND gmo.stripe_checkout_session_id IS NOT NULL
    AND og.status IN ('open', 'payment_pending')
    AND gmo.stripe_payment_intent_id IS NULL
  ORDER BY gmo.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
$$;

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
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_member_orders
  SET
    payment_status = 'authorized',
    stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_checkout_session_id),
    stripe_payment_intent_id = p_payment_intent_id,
    authorization_amount = p_authorized_amount,
    authorized_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
    last_payment_error = NULL,
    updated_at = now()
  WHERE id = p_member_order_id
    AND stripe_checkout_session_id = p_checkout_session_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_match_group_pending_authorizations(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_group_pending_authorizations(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
