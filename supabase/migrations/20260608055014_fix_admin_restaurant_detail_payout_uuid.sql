-- Fix admin restaurant detail payout lookup.
-- payouts.recipient_id is a uuid, so comparing it to p_restaurant_id::text breaks the RPC with uuid = text.

CREATE OR REPLACE FUNCTION public.admin_get_restaurant_admin_detail(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_restaurant public.restaurants%ROWTYPE;
  v_menu_count integer := 0;
  v_missing_fields text[] := ARRAY[]::text[];
  v_missing_count integer := 0;
  v_quality_score integer := 0;
  v_publishable boolean := false;
  v_orders_summary jsonb := '{}'::jsonb;
  v_reservations_summary jsonb := '{}'::jsonb;
  v_reviews_summary jsonb := '{}'::jsonb;
  v_campaigns_summary jsonb := '{}'::jsonb;
  v_invoices_summary jsonb := '{}'::jsonb;
  v_incidents_summary jsonb := '{}'::jsonb;
  v_payment_health jsonb := '{}'::jsonb;
  v_recent_history jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found.' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_menu_count
  FROM public.menu_items mi
  WHERE mi.restaurant_id = p_restaurant_id
    AND COALESCE(mi.is_available, true);

  IF NULLIF(trim(COALESCE(v_restaurant.image_url, '')), '') IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'image');
  END IF;

  IF NULLIF(trim(COALESCE(v_restaurant.address, '')), '') IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'address');
  END IF;

  IF v_restaurant.latitude IS NULL OR v_restaurant.longitude IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'coordinates');
  END IF;

  IF v_restaurant.opening_hours IS NULL
    OR jsonb_typeof(v_restaurant.opening_hours) <> 'object'
    OR v_restaurant.opening_hours = '{}'::jsonb THEN
    v_missing_fields := array_append(v_missing_fields, 'opening_hours');
  END IF;

  IF v_menu_count <= 0 THEN
    v_missing_fields := array_append(v_missing_fields, 'menu');
  END IF;

  IF cardinality(COALESCE(v_restaurant.disabled_payment_methods, ARRAY[]::text[])) >= 3 THEN
    v_missing_fields := array_append(v_missing_fields, 'payment_methods');
  END IF;

  IF NULLIF(trim(COALESCE(v_restaurant.cuisine_type, '')), '') IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'cuisine');
  END IF;

  v_missing_count := COALESCE(array_length(v_missing_fields, 1), 0);
  v_quality_score := ROUND(((7 - v_missing_count)::numeric / 7::numeric) * 100)::integer;
  v_publishable := v_missing_count = 0;

  SELECT jsonb_build_object(
    'total', COUNT(*)::integer,
    'last_30_days', COUNT(*) FILTER (WHERE o.created_at >= now() - interval '30 days')::integer,
    'active', COUNT(*) FILTER (
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'delivered', 'completed', 'refunded')
    )::integer,
    'paid', COUNT(*) FILTER (WHERE lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured'))::integer,
    'revenue_chf', COALESCE(SUM(o.total_amount) FILTER (WHERE lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured')), 0)
  )
  INTO v_orders_summary
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id;

  SELECT jsonb_build_object(
    'total', COUNT(*)::integer,
    'last_30_days', COUNT(*) FILTER (WHERE r.created_at >= now() - interval '30 days')::integer,
    'pending', COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) IN ('pending', 'requested'))::integer,
    'confirmed', COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) IN ('confirmed', 'accepted'))::integer,
    'cancelled', COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) IN ('cancelled', 'canceled'))::integer
  )
  INTO v_reservations_summary
  FROM public.reservations r
  WHERE r.restaurant_id = p_restaurant_id;

  SELECT jsonb_build_object(
    'total', COUNT(*)::integer,
    'pending', COUNT(*) FILTER (WHERE lower(COALESCE(rv.status, 'published')) IN ('pending', 'reported'))::integer,
    'average_rating', COALESCE(ROUND(AVG(rv.rating)::numeric, 2), 0)
  )
  INTO v_reviews_summary
  FROM public.reviews rv
  WHERE rv.restaurant_id = p_restaurant_id;

  SELECT jsonb_build_object(
    'total', COUNT(*)::integer,
    'active', COUNT(*) FILTER (WHERE lower(COALESCE(ac.status, '')) = 'active')::integer,
    'paid', COUNT(*) FILTER (WHERE lower(COALESCE(ac.payment_status, '')) = 'paid')::integer,
    'spent_chf', COALESCE(SUM(COALESCE(ac.spent, 0)), 0)
  )
  INTO v_campaigns_summary
  FROM public.ad_campaigns ac
  WHERE ac.restaurant_id = p_restaurant_id;

  SELECT jsonb_build_object(
    'total', COUNT(*)::integer,
    'open', COUNT(*) FILTER (WHERE lower(COALESCE(ri.status, '')) NOT IN ('paid', 'void', 'cancelled', 'canceled'))::integer,
    'overdue', COUNT(*) FILTER (WHERE ri.due_at < now() AND lower(COALESCE(ri.status, '')) NOT IN ('paid', 'void', 'cancelled', 'canceled'))::integer,
    'unpaid_chf', COALESCE(SUM(ri.amount_ttc) FILTER (WHERE lower(COALESCE(ri.status, '')) NOT IN ('paid', 'void', 'cancelled', 'canceled')), 0)
  )
  INTO v_invoices_summary
  FROM public.restaurant_invoices ri
  WHERE ri.restaurant_id = p_restaurant_id;

  SELECT jsonb_build_object(
    'total', COUNT(*)::integer,
    'open', COUNT(*) FILTER (WHERE lower(COALESCE(st.status, '')) NOT IN ('resolved', 'closed'))::integer,
    'critical', COUNT(*) FILTER (WHERE lower(COALESCE(st.priority, '')) IN ('critical', 'urgent', 'high'))::integer
  )
  INTO v_incidents_summary
  FROM public.support_tickets st
  LEFT JOIN public.orders o ON o.id = st.order_id
  WHERE o.restaurant_id = p_restaurant_id;

  SELECT jsonb_build_object(
    'stripe_account_id', COALESCE(rps.stripe_account_id, v_restaurant.stripe_account_id),
    'stripe_connect_configured', COALESCE(rps.stripe_account_id, v_restaurant.stripe_account_id) IS NOT NULL,
    'payout_schedule', rps.payout_schedule,
    'commission_rate', COALESCE(rps.commission_rate, v_restaurant.commission_rate),
    'invoice_settings_configured', ris.id IS NOT NULL,
    'iban_configured', NULLIF(trim(COALESCE(ris.iban, '')), '') IS NOT NULL,
    'last_failed_payment_at', (
      SELECT MAX(pt.created_at)
      FROM public.payment_transactions pt
      JOIN public.orders po ON po.id = pt.order_id
      WHERE po.restaurant_id = p_restaurant_id
        AND lower(COALESCE(pt.status, '')) IN ('failed', 'requires_action', 'requires_payment')
    ),
    'payouts_pending', (
      SELECT COUNT(*)::integer
      FROM public.payouts p
      WHERE p.recipient_type = 'restaurant'
        AND p.recipient_id = p_restaurant_id
        AND lower(COALESCE(p.status, 'pending')) IN ('pending', 'processing')
    )
  )
  INTO v_payment_health
  FROM public.restaurants r
  LEFT JOIN public.restaurant_payout_settings rps ON rps.restaurant_id = r.id
  LEFT JOIN public.restaurant_invoice_settings ris ON ris.restaurant_id = r.id
  WHERE r.id = p_restaurant_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'action', h.action,
      'created_at', h.created_at,
      'user_id', h.user_id,
      'old_data', h.old_data,
      'new_data', h.new_data
    )
    ORDER BY h.created_at DESC
  ), '[]'::jsonb)
  INTO v_recent_history
  FROM (
    SELECT al.*
    FROM public.audit_log al
    WHERE al.entity_id::text = p_restaurant_id::text
      AND al.entity_type IN ('restaurant', 'restaurants')
    ORDER BY al.created_at DESC NULLS LAST
    LIMIT 12
  ) h;

  RETURN jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id,
      'name', v_restaurant.name,
      'legal_name', v_restaurant.legal_name,
      'owner_id', v_restaurant.owner_id,
      'city', v_restaurant.city,
      'address', v_restaurant.address,
      'cuisine_type', v_restaurant.cuisine_type,
      'phone', v_restaurant.phone,
      'image_url', v_restaurant.image_url,
      'is_active', COALESCE(v_restaurant.is_active, true),
      'is_featured', COALESCE(v_restaurant.is_featured, false),
      'status', COALESCE(v_restaurant.status, 'active'),
      'supports_pickup', COALESCE(v_restaurant.supports_pickup, true),
      'supports_dinein', COALESCE(v_restaurant.supports_dinein, false),
      'supports_reservation', COALESCE(v_restaurant.supports_reservation, false),
      'stripe_account_id', v_restaurant.stripe_account_id,
      'created_at', v_restaurant.created_at,
      'updated_at', v_restaurant.updated_at
    ),
    'quality', jsonb_build_object(
      'score', v_quality_score,
      'publishable', v_publishable,
      'missing_fields', COALESCE(to_jsonb(v_missing_fields), '[]'::jsonb),
      'menu_items_count', v_menu_count,
      'checks', jsonb_build_object(
        'image', NOT ('image' = ANY(v_missing_fields)),
        'address', NOT ('address' = ANY(v_missing_fields)),
        'coordinates', NOT ('coordinates' = ANY(v_missing_fields)),
        'opening_hours', NOT ('opening_hours' = ANY(v_missing_fields)),
        'menu', NOT ('menu' = ANY(v_missing_fields)),
        'payment_methods', NOT ('payment_methods' = ANY(v_missing_fields)),
        'cuisine', NOT ('cuisine' = ANY(v_missing_fields))
      )
    ),
    'orders_summary', COALESCE(v_orders_summary, '{}'::jsonb),
    'reservations_summary', COALESCE(v_reservations_summary, '{}'::jsonb),
    'reviews_summary', COALESCE(v_reviews_summary, '{}'::jsonb),
    'campaigns_summary', COALESCE(v_campaigns_summary, '{}'::jsonb),
    'invoices_summary', COALESCE(v_invoices_summary, '{}'::jsonb),
    'incidents_summary', COALESCE(v_incidents_summary, '{}'::jsonb),
    'payment_health', COALESCE(v_payment_health, '{}'::jsonb),
    'recent_history', COALESCE(v_recent_history, '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_restaurant_admin_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_restaurant_admin_detail(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_restaurant_admin_detail(uuid) TO authenticated, service_role;
