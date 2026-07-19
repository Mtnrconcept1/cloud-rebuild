-- Dedicated commercial demo only: accept a payment simulation without any
-- Stripe secret, API call, webhook or financial-ledger side effect.
CREATE OR REPLACE FUNCTION public.commercial_demo_confirm_simulated_payment(
  p_order_id uuid,
  p_simulation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.commercial_demo_orders%ROWTYPE;
  v_session public.commercial_demo_order_sessions%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required to confirm simulated demo payment'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_simulation_id, '') !~ '^demo_sim_[0-9a-f]{48}$' THEN
    RAISE EXCEPTION 'Invalid commercial demo simulation reference'
      USING ERRCODE = '22023';
  END IF;

  SELECT demo_order.*
  INTO v_order
  FROM public.commercial_demo_orders demo_order
  WHERE demo_order.id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Commercial demo order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = v_order.session_id;

  IF v_session.status <> 'active'
     OR v_session.commercial_user_id <> v_order.commercial_user_id
     OR v_session.demo_restaurant_id <> v_order.demo_restaurant_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.commercial_demo_accounts account
       WHERE account.user_id = v_order.commercial_user_id
         AND account.demo_restaurant_id = v_order.demo_restaurant_id
         AND account.is_active
     ) THEN
    RAISE EXCEPTION 'Commercial demo isolation check failed' USING ERRCODE = '42501';
  END IF;

  IF v_order.payment_status = 'test_paid' THEN
    IF v_order.stripe_checkout_session_id IS DISTINCT FROM p_simulation_id THEN
      RAISE EXCEPTION 'Commercial demo payment already confirmed with another reference'
        USING ERRCODE = '23505';
    END IF;
    RETURN public._commercial_demo_build_snapshot(v_order.session_id);
  END IF;

  IF v_order.status <> 'awaiting_payment'
     OR v_order.payment_status <> 'requires_payment'
     OR v_order.stripe_mode <> 'test' THEN
    RAISE EXCEPTION 'Commercial demo order is not awaiting payment simulation'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.commercial_demo_orders
  SET payment_status = 'test_paid',
      status = 'restaurant_received',
      stripe_checkout_session_id = p_simulation_id,
      stripe_payment_intent_id = NULL,
      paid_at = now(),
      version = version + 1,
      updated_at = now()
  WHERE id = v_order.id;

  INSERT INTO public.commercial_demo_order_events (
    session_id,
    order_id,
    commercial_user_id,
    actor_surface,
    event_type,
    label,
    from_status,
    to_status,
    metadata
  ) VALUES (
    v_order.session_id,
    v_order.id,
    v_order.commercial_user_id,
    'system',
    'simulated_payment_confirmed',
    'Paiement simulé accepté — commande transmise au restaurant',
    'awaiting_payment',
    'restaurant_received',
    jsonb_build_object(
      'payment_mode', 'simulated',
      'payment_provider_called', false,
      'simulation_id', p_simulation_id,
      'total_amount_cents', v_order.total_amount_cents,
      'no_financial_ledger', true
    )
  );

  RETURN public._commercial_demo_build_snapshot(v_order.session_id);
END
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_confirm_simulated_payment(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_confirm_simulated_payment(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.commercial_demo_confirm_simulated_payment(uuid, text)
  IS 'Dedicated demo-only idempotent payment acceptance simulator; never calls Stripe or writes financial ledgers.';
