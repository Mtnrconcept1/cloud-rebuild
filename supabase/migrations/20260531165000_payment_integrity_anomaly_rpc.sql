CREATE OR REPLACE FUNCTION public.get_payment_integrity_anomalies(p_hours integer DEFAULT 48)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer := GREATEST(1, LEAST(COALESCE(p_hours, 48), 720));
  v_since timestamptz := now() - (GREATEST(1, LEAST(COALESCE(p_hours, 48), 720)) || ' hours')::interval;
  v_result jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH stale_pending_orders AS (
    SELECT jsonb_build_object(
      'kind', 'stale_pending_order',
      'severity', 'high',
      'order_id', o.id,
      'order_number', o.order_number,
      'restaurant_id', o.restaurant_id,
      'user_id', o.user_id,
      'status', o.status,
      'payment_status', o.payment_status,
      'stripe_session_id', o.metadata->>'stripe_session_id',
      'checkout_id', o.checkout_id,
      'created_at', o.created_at
    ) AS item
    FROM public.orders o
    WHERE o.created_at < v_since
      AND (
        lower(COALESCE(o.status, '')) = 'pending_payment'
        OR lower(COALESCE(o.payment_status, '')) IN ('pending', 'pending_payment', 'requires_payment')
      )
      AND COALESCE(o.metadata->>'checkout_session_state', '') NOT IN ('completed', 'expired', 'cancelled', 'failed')
    ORDER BY o.created_at ASC
    LIMIT 100
  ),
  captured_orders_without_charge AS (
    SELECT jsonb_build_object(
      'kind', 'captured_order_without_charge',
      'severity', 'critical',
      'order_id', o.id,
      'order_number', o.order_number,
      'restaurant_id', o.restaurant_id,
      'user_id', o.user_id,
      'status', o.status,
      'payment_status', o.payment_status,
      'stripe_session_id', o.metadata->>'stripe_session_id',
      'stripe_payment_intent', o.metadata->>'stripe_payment_intent',
      'created_at', o.created_at,
      'updated_at', o.updated_at
    ) AS item
    FROM public.orders o
    WHERE lower(COALESCE(o.status, '')) = 'confirmed'
      AND lower(COALESCE(o.payment_status, '')) = 'captured'
      AND o.created_at >= now() - interval '90 days'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_transactions pt
        WHERE pt.order_id = o.id
          AND pt.type = 'charge'
          AND pt.status = 'succeeded'
      )
    ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
    LIMIT 100
  ),
  succeeded_order_charges_without_order AS (
    SELECT jsonb_build_object(
      'kind', 'succeeded_order_charge_without_order',
      'severity', 'critical',
      'payment_transaction_id', pt.id,
      'stripe_session_id', pt.stripe_checkout_session_id,
      'stripe_payment_intent_id', pt.stripe_payment_intent_id,
      'user_id', pt.user_id,
      'amount', pt.amount,
      'currency', pt.currency,
      'checkout_kind', COALESCE(pt.metadata->>'checkout_kind', 'order'),
      'metadata', pt.metadata,
      'created_at', pt.created_at
    ) AS item
    FROM public.payment_transactions pt
    WHERE pt.type = 'charge'
      AND pt.status = 'succeeded'
      AND pt.order_id IS NULL
      AND COALESCE(pt.metadata->>'checkout_kind', 'order') NOT IN ('campaign', 'tok-one', 'launch-pack')
      AND COALESCE(pt.metadata->>'feature', '') NOT IN ('zero-attente')
      AND pt.created_at >= now() - interval '90 days'
    ORDER BY pt.created_at DESC
    LIMIT 100
  ),
  paid_campaigns_not_active AS (
    SELECT jsonb_build_object(
      'kind', 'paid_campaign_not_active',
      'severity', 'high',
      'campaign_id', ac.id,
      'restaurant_id', ac.restaurant_id,
      'title', ac.title,
      'status', ac.status,
      'payment_status', ac.payment_status,
      'stripe_session_id', ac.stripe_checkout_session_id,
      'paid_amount', ac.paid_amount,
      'paid_at', ac.paid_at,
      'updated_at', ac.updated_at
    ) AS item
    FROM public.ad_campaigns ac
    WHERE ac.payment_status = 'paid'
      AND ac.status IS DISTINCT FROM 'active'
    ORDER BY ac.updated_at DESC NULLS LAST, ac.paid_at DESC NULLS LAST
    LIMIT 100
  ),
  paid_campaigns_without_transaction AS (
    SELECT jsonb_build_object(
      'kind', 'paid_campaign_without_transaction',
      'severity', 'high',
      'campaign_id', ac.id,
      'restaurant_id', ac.restaurant_id,
      'title', ac.title,
      'status', ac.status,
      'payment_status', ac.payment_status,
      'stripe_session_id', ac.stripe_checkout_session_id,
      'paid_amount', ac.paid_amount,
      'paid_at', ac.paid_at
    ) AS item
    FROM public.ad_campaigns ac
    WHERE ac.payment_status = 'paid'
      AND ac.stripe_checkout_session_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.payment_transactions pt
        WHERE pt.status = 'succeeded'
          AND pt.type = 'charge'
          AND (
            pt.stripe_checkout_session_id = ac.stripe_checkout_session_id
            OR pt.metadata->>'campaign_id' = ac.id::text
          )
      )
    ORDER BY ac.paid_at DESC NULLS LAST, ac.updated_at DESC NULLS LAST
    LIMIT 100
  ),
  zero_attente_transactions_without_reservation AS (
    SELECT jsonb_build_object(
      'kind', 'zero_attente_transaction_without_reservation',
      'severity', 'critical',
      'payment_transaction_id', pt.id,
      'reservation_id', pt.metadata->>'reservation_id',
      'stripe_session_id', pt.stripe_checkout_session_id,
      'stripe_payment_intent_id', pt.stripe_payment_intent_id,
      'user_id', pt.user_id,
      'amount', pt.amount,
      'currency', pt.currency,
      'metadata', pt.metadata,
      'created_at', pt.created_at
    ) AS item
    FROM public.payment_transactions pt
    WHERE pt.type = 'charge'
      AND pt.status = 'succeeded'
      AND COALESCE(pt.metadata->>'feature', '') = 'zero-attente'
      AND NULLIF(pt.metadata->>'reservation_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.id::text = pt.metadata->>'reservation_id'
      )
    ORDER BY pt.created_at DESC
    LIMIT 100
  ),
  all_items AS (
    SELECT item FROM stale_pending_orders
    UNION ALL SELECT item FROM captured_orders_without_charge
    UNION ALL SELECT item FROM succeeded_order_charges_without_order
    UNION ALL SELECT item FROM paid_campaigns_not_active
    UNION ALL SELECT item FROM paid_campaigns_without_transaction
    UNION ALL SELECT item FROM zero_attente_transactions_without_reservation
  )
  SELECT jsonb_build_object(
    'checkedAt', now(),
    'windowHours', v_hours,
    'total', COALESCE(count(*), 0),
    'critical', COALESCE(count(*) FILTER (WHERE item->>'severity' = 'critical'), 0),
    'high', COALESCE(count(*) FILTER (WHERE item->>'severity' = 'high'), 0),
    'items', COALESCE(jsonb_agg(item ORDER BY item->>'severity', item->>'kind'), '[]'::jsonb)
  )
  INTO v_result
  FROM all_items;

  RETURN COALESCE(v_result, jsonb_build_object(
    'checkedAt', now(),
    'windowHours', v_hours,
    'total', 0,
    'critical', 0,
    'high', 0,
    'items', '[]'::jsonb
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_payment_integrity_anomalies(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_integrity_anomalies(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
