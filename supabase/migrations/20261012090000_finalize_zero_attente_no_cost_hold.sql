-- Close the free Zero Attente Checkout race: redemption and confirmation commit together.
-- Only service_role code with a verified completed Stripe Session may call this RPC.
CREATE OR REPLACE FUNCTION public.finalize_zero_attente_no_cost_hold(
  p_session_id text,
  p_user_id uuid,
  p_restaurant_id uuid,
  p_points_to_redeem integer,
  p_preorder_items jsonb,
  p_metadata jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_redemption jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_session_id IS NULL OR p_session_id !~ '^cs_(live|test)_' OR
     p_user_id IS NULL OR p_restaurant_id IS NULL OR
     p_points_to_redeem IS NULL OR p_points_to_redeem < 0 THEN
    RAISE EXCEPTION 'Invalid no-cost checkout identity';
  END IF;
  IF jsonb_typeof(p_preorder_items) IS DISTINCT FROM 'array' OR
     jsonb_array_length(p_preorder_items) = 0 THEN
    RAISE EXCEPTION 'Missing preorder items';
  END IF;
  IF jsonb_typeof(p_metadata) IS DISTINCT FROM 'object' OR
     p_metadata ->> 'checkout_session_id' IS DISTINCT FROM p_session_id OR
     p_metadata ->> 'finance_routing_mode' IS DISTINCT FROM 'no_cost' OR
     p_metadata ->> 'authoritative_total_cents' IS DISTINCT FROM '0' OR
     p_metadata ->> 'payment_attempt_version' IS DISTINCT FROM '2' OR
     p_metadata ->> 'paid' IS DISTINCT FROM 'true' OR
     COALESCE(p_metadata ->> 'points_to_redeem', '') !~ '^[0-9]{1,9}$' OR
     (p_metadata ->> 'points_to_redeem')::integer <> p_points_to_redeem OR
     p_metadata ->> 'restaurant_id' IS DISTINCT FROM p_restaurant_id::text THEN
    RAISE EXCEPTION 'Invalid verified no-cost metadata';
  END IF;

  SELECT r.* INTO v_reservation
  FROM public.reservations r
  WHERE r.user_id = p_user_id
    AND r.restaurant_id = p_restaurant_id
    AND r.feature = 'zero-attente'
    AND r.metadata ->> 'checkout_session_id' = p_session_id
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_reservation.status NOT IN ('pending', 'confirmed') OR
     COALESCE(v_reservation.total_amount, 0) <> 0 OR
     v_reservation.metadata ->> 'finance_routing_mode' IS DISTINCT FROM 'no_cost' OR
     v_reservation.metadata ->> 'authoritative_total_cents' IS DISTINCT FROM '0' OR
     COALESCE(v_reservation.metadata ->> 'points_to_redeem', '') !~ '^[0-9]{1,9}$' OR
     (v_reservation.metadata ->> 'points_to_redeem')::integer <> p_points_to_redeem THEN
    RAISE EXCEPTION 'No-cost capacity hold missing or invalid';
  END IF;

  -- An already committed booking is a no-op, including concurrent webhook retries.
  IF v_reservation.status = 'confirmed' THEN
    IF COALESCE((v_reservation.metadata ->> 'paid')::boolean, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Confirmed hold missing completion proof';
    END IF;
    IF p_points_to_redeem > 0 AND NOT EXISTS (
      SELECT 1 FROM public.loyalty_transactions t
      WHERE t.user_id = p_user_id
        AND t.reservation_id = v_reservation.id
        AND t.transaction_type = 'redeem'
        AND t.amount = -p_points_to_redeem
    ) THEN
      RAISE EXCEPTION 'Confirmed hold lacks verified MIAMZ redemption';
    END IF;
    RETURN v_reservation.id;
  END IF;

  IF p_points_to_redeem > 0 THEN
    v_redemption := public.apply_reservation_loyalty_points(
      p_user_id, v_reservation.id, p_points_to_redeem,
      'Zero Attente MIAMZ ' || p_session_id
    );
    IF COALESCE((v_redemption ->> 'points_applied')::integer, -1) <> p_points_to_redeem THEN
      RAISE EXCEPTION 'MIAMZ redemption mismatch';
    END IF;
  END IF;

  UPDATE public.reservations
  SET status = 'confirmed',
      total_amount = 0,
      payment_method = CASE WHEN p_points_to_redeem > 0 THEN 'miamz' ELSE 'avantages' END,
      preorder_items = p_preorder_items,
      notes = p_notes,
      metadata = COALESCE(metadata, '{}'::jsonb) || (p_metadata - '_internal_user_id') ||
        jsonb_build_object(
          'checkout_session_state', 'completed',
          'paid', true,
          'points_redeemed', p_points_to_redeem,
          'points_discount_amount', round(p_points_to_redeem / 100.0, 2)
        ),
      updated_at = now()
  WHERE id = v_reservation.id;

  RETURN v_reservation.id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_zero_attente_no_cost_hold(text,uuid,uuid,integer,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_zero_attente_no_cost_hold(text,uuid,uuid,integer,jsonb,jsonb,text) TO service_role;
