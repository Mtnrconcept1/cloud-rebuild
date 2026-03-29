-- Harden client-callable SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  user_id_param uuid,
  points_to_redeem integer,
  description_param text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_current_points integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id_param IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF COALESCE(points_to_redeem, 0) <= 0 THEN
    RAISE EXCEPTION 'points_to_redeem must be positive';
  END IF;

  SELECT loyalty_points
  INTO v_current_points
  FROM public.profiles
  WHERE user_id = v_actor_id
  FOR UPDATE;

  IF v_current_points IS NULL OR v_current_points < points_to_redeem THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET loyalty_points = loyalty_points - points_to_redeem
  WHERE user_id = v_actor_id;

  INSERT INTO public.loyalty_transactions (
    user_id,
    amount,
    transaction_type,
    description
  )
  VALUES (
    v_actor_id,
    -points_to_redeem,
    'redeem',
    description_param
  );

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_restaurant_performance(
  p_restaurant_id uuid,
  p_from text,
  p_to text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') AND NOT EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND owner_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_build_object(
    'total_orders',
      COALESCE((
        SELECT count(*)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'avg_ticket',
      COALESCE((
        SELECT avg(total_amount)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_reservations',
      COALESCE((
        SELECT count(*)
        FROM public.reservations
        WHERE restaurant_id = p_restaurant_id
          AND date >= p_from::date
          AND date <= p_to::date
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
      ), 0),
    'cancel_rate',
      COALESCE((
        SELECT round(
          count(*) FILTER (WHERE lower(COALESCE(status, '')) IN ('cancelled', 'refused', 'payment_failed'))::numeric
          / NULLIF(count(*), 0) * 100,
          1
        )
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_comparison(
  p_restaurant_id uuid,
  p_period text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  days_back integer;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') AND NOT EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND owner_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  days_back := CASE p_period WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 30 END;

  SELECT json_build_object(
    'my_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_orders',
      COALESCE((
        SELECT count(*)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_avg_rating',
      COALESCE((SELECT avg(rating) FROM public.reviews WHERE restaurant_id = p_restaurant_id), 0),
    'avg_revenue',
      COALESCE((
        SELECT avg(rev)
        FROM (
          SELECT sum(total_amount) AS rev
          FROM public.orders
          WHERE lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
            AND created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_orders',
      COALESCE((
        SELECT avg(cnt)
        FROM (
          SELECT count(*) AS cnt
          FROM public.orders
          WHERE created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_rating',
      COALESCE((SELECT avg(rating) FROM public.reviews), 0)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_recommendations(
  p_restaurant_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') AND NOT EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND owner_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
  INTO result
  FROM (
    SELECT *
    FROM public.restaurant_recommendations
    WHERE restaurant_id = p_restaurant_id
      AND status = 'pending'
    ORDER BY priority ASC
    LIMIT 10
  ) r;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_recommendations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_recommendations(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_recommendations(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_recommendations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_recommendations(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_campaign_stats(campaign_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(
  campaign_id uuid,
  recipients integer,
  notifications_count integer,
  read_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  RETURN QUERY
  WITH campaign_scope AS (
    SELECT nc.id
    FROM public.notification_campaigns nc
    WHERE campaign_ids IS NULL OR nc.id = ANY(campaign_ids)
  ),
  campaign_notifications AS (
    SELECT
      n.id,
      n.user_id,
      n.read_at,
      (n.data ->> 'campaign_id')::uuid AS campaign_id
    FROM public.notifications n
    WHERE (n.data ->> 'campaign_id') IS NOT NULL
  ),
  scoped_notifications AS (
    SELECT cn.*
    FROM campaign_notifications cn
    JOIN campaign_scope cs ON cs.id = cn.campaign_id
  ),
  scoped_deliveries AS (
    SELECT
      d.notification_id,
      d.channel,
      d.status,
      sn.campaign_id
    FROM public.notification_deliveries d
    JOIN scoped_notifications sn ON sn.id = d.notification_id
  )
  SELECT
    cs.id AS campaign_id,
    COUNT(DISTINCT sn.user_id)::integer AS recipients,
    COUNT(DISTINCT sn.id)::integer AS notifications_count,
    COUNT(DISTINCT CASE WHEN sn.read_at IS NOT NULL THEN sn.id END)::integer AS read_count,
    COUNT(sd.notification_id)::integer AS deliveries_total,
    COUNT(CASE WHEN sd.status = 'queued' THEN 1 END)::integer AS deliveries_queued,
    COUNT(CASE WHEN sd.status = 'sent' THEN 1 END)::integer AS deliveries_sent,
    COUNT(CASE WHEN sd.status = 'failed' THEN 1 END)::integer AS deliveries_failed,
    COUNT(CASE WHEN sd.channel = 'in_app' THEN 1 END)::integer AS in_app_total,
    COUNT(CASE WHEN sd.channel = 'email' THEN 1 END)::integer AS email_total,
    COUNT(CASE WHEN sd.channel = 'push' THEN 1 END)::integer AS push_total
  FROM campaign_scope cs
  LEFT JOIN scoped_notifications sn ON sn.campaign_id = cs.id
  LEFT JOIN scoped_deliveries sd ON sd.campaign_id = cs.id
  GROUP BY cs.id
  ORDER BY cs.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_campaign_stats(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_campaign_stats(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_campaign_stats(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_stats(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_stats(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
