CREATE INDEX IF NOT EXISTS orders_restaurant_user_created_idx
  ON public.orders (restaurant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reservations_restaurant_user_date_idx
  ON public.reservations (restaurant_id, user_id, date DESC, time DESC);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items (order_id);

DROP FUNCTION IF EXISTS public.get_customer_crm_profiles(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_customer_crm_profiles(
  p_restaurant_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 80,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  city text,
  address text,
  avatar_url text,
  loyalty_points integer,
  total_orders integer,
  total_reservations integer,
  restaurants_count integer,
  total_spent numeric,
  avg_order_value numeric,
  first_seen_at timestamptz,
  last_activity_at timestamptz,
  last_order_at timestamptz,
  last_reservation_at timestamptz,
  last_restaurant_name text,
  preferred_channel text,
  preferred_service text,
  preferred_weekday integer,
  favorite_order_hour integer,
  favorite_reservation_hour integer,
  favorite_items jsonb,
  favorite_cuisines text[],
  crm_score integer,
  total_matching_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := lower(trim(COALESCE(p_search, '')));
BEGIN
  IF p_restaurant_id IS NULL THEN
    IF NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'Admin access required for global CRM.';
    END IF;
  ELSIF NOT public.auth_is_admin() AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Access denied for restaurant CRM.';
  END IF;

  RETURN QUERY
  WITH scoped_orders AS (
    SELECT
      o.id,
      o.user_id,
      o.restaurant_id,
      o.created_at AS activity_at,
      o.total_amount,
      o.status,
      o.metadata
    FROM public.orders o
    WHERE o.user_id IS NOT NULL
      AND (p_restaurant_id IS NULL OR o.restaurant_id = p_restaurant_id)
      AND lower(COALESCE(o.status, '')) NOT IN ('pending', 'pending_payment', 'payment_failed')
  ),
  scoped_reservations AS (
    SELECT
      r.id,
      r.user_id,
      r.restaurant_id,
      (
        r.date::timestamp
        + COALESCE(NULLIF(r.time::text, '')::time, time '00:00')
      ) AT TIME ZONE 'Europe/Zurich' AS activity_at,
      r.total_amount,
      r.status,
      r.metadata,
      r.party_size
    FROM public.reservations r
    WHERE r.user_id IS NOT NULL
      AND (p_restaurant_id IS NULL OR r.restaurant_id = p_restaurant_id)
      AND lower(COALESCE(r.status, '')) <> 'pending_payment'
  ),
  activity AS (
    SELECT
      so.user_id,
      so.restaurant_id,
      so.activity_at,
      'order'::text AS activity_kind,
      CASE
        WHEN lower(COALESCE(so.status, '')) IN ('cancelled', 'canceled') THEN 0::numeric
        ELSE COALESCE(so.total_amount, 0)::numeric
      END AS revenue_amount
    FROM scoped_orders so
    UNION ALL
    SELECT
      sr.user_id,
      sr.restaurant_id,
      sr.activity_at,
      'reservation'::text AS activity_kind,
      CASE
        WHEN lower(COALESCE(sr.status, '')) IN ('cancelled', 'canceled', 'no_show') THEN 0::numeric
        ELSE COALESCE(sr.total_amount, 0)::numeric
      END AS revenue_amount
    FROM scoped_reservations sr
  ),
  metrics AS (
    SELECT
      a.user_id,
      COUNT(*) FILTER (WHERE a.activity_kind = 'order')::integer AS total_orders,
      COUNT(*) FILTER (WHERE a.activity_kind = 'reservation')::integer AS total_reservations,
      COUNT(DISTINCT a.restaurant_id)::integer AS restaurants_count,
      COALESCE(SUM(a.revenue_amount), 0)::numeric AS total_spent,
      MIN(a.activity_at) AS first_seen_at,
      MAX(a.activity_at) AS last_activity_at,
      MAX(a.activity_at) FILTER (WHERE a.activity_kind = 'order') AS last_order_at,
      MAX(a.activity_at) FILTER (WHERE a.activity_kind = 'reservation') AS last_reservation_at
    FROM activity a
    GROUP BY a.user_id
  ),
  enriched AS (
    SELECT
      m.*,
      au.email::text AS email,
      p.full_name AS profile_full_name,
      p.phone AS profile_phone,
      p.city,
      p.address,
      COALESCE(p.avatar_url, up.avatar_url) AS avatar_url,
      COALESCE(p.loyalty_points, 0)::integer AS loyalty_points,
      up.first_name,
      up.last_name,
      up.phone_number AS user_profile_phone
    FROM metrics m
    LEFT JOIN auth.users au ON au.id = m.user_id
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    LEFT JOIN public.user_profiles up ON up.user_id = m.user_id
  ),
  filtered AS (
    SELECT
      e.*,
      COALESCE(
        NULLIF(trim(COALESCE(e.profile_full_name, '')), ''),
        NULLIF(trim(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), ''),
        split_part(COALESCE(e.email, e.user_id::text), '@', 1)
      ) AS resolved_full_name,
      COALESCE(NULLIF(e.profile_phone, ''), NULLIF(e.user_profile_phone, '')) AS resolved_phone
    FROM enriched e
    WHERE v_search = ''
      OR lower(COALESCE(e.profile_full_name, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(e.first_name, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(e.last_name, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(e.email, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(e.profile_phone, e.user_profile_phone, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(e.city, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(e.address, '')) LIKE '%' || v_search || '%'
  ),
  scored AS (
    SELECT
      f.*,
      LEAST(
        100,
        12
        + LEAST(30, f.total_orders * 4)
        + LEAST(24, f.total_reservations * 4)
        + LEAST(18, floor(COALESCE(f.total_spent, 0) / 50)::integer)
        + CASE WHEN f.last_activity_at >= now() - interval '30 days' THEN 16 ELSE 0 END
        + CASE WHEN f.last_activity_at < now() - interval '90 days' THEN -18 ELSE 0 END
      )::integer AS score
    FROM filtered f
  )
  SELECT
    s.user_id,
    COALESCE(NULLIF(s.first_name, ''), split_part(s.resolved_full_name, ' ', 1)) AS first_name,
    COALESCE(
      NULLIF(s.last_name, ''),
      NULLIF(trim(substr(s.resolved_full_name, length(split_part(s.resolved_full_name, ' ', 1)) + 1)), '')
    ) AS last_name,
    s.resolved_full_name AS full_name,
    s.email,
    s.resolved_phone AS phone,
    s.city,
    s.address,
    s.avatar_url,
    s.loyalty_points,
    s.total_orders,
    s.total_reservations,
    s.restaurants_count,
    COALESCE(s.total_spent, 0)::numeric AS total_spent,
    CASE WHEN s.total_orders > 0 THEN (s.total_spent / s.total_orders)::numeric ELSE 0::numeric END AS avg_order_value,
    s.first_seen_at,
    s.last_activity_at,
    s.last_order_at,
    s.last_reservation_at,
    last_restaurant.name AS last_restaurant_name,
    CASE
      WHEN s.total_orders > 0 AND s.total_reservations > 0 THEN 'mixed'
      WHEN s.total_orders > 0 THEN 'orders'
      WHEN s.total_reservations > 0 THEN 'reservations'
      ELSE 'unknown'
    END AS preferred_channel,
    COALESCE(preferred_service.service_label, 'unknown') AS preferred_service,
    preferred_weekday.weekday AS preferred_weekday,
    favorite_order_hour.hour_value AS favorite_order_hour,
    favorite_reservation_hour.hour_value AS favorite_reservation_hour,
    COALESCE(favorite_items.items, '[]'::jsonb) AS favorite_items,
    COALESCE(favorite_cuisines.cuisines, ARRAY[]::text[]) AS favorite_cuisines,
    s.score AS crm_score,
    COUNT(*) OVER () AS total_matching_count
  FROM scored s
  LEFT JOIN LATERAL (
    SELECT r.name
    FROM activity a
    JOIN public.restaurants r ON r.id = a.restaurant_id
    WHERE a.user_id = s.user_id
    ORDER BY a.activity_at DESC
    LIMIT 1
  ) AS last_restaurant ON true
  LEFT JOIN LATERAL (
    SELECT bucket.service_label
    FROM (
      SELECT
        CASE
          WHEN extract(hour from a.activity_at AT TIME ZONE 'Europe/Zurich') BETWEEN 11 AND 14 THEN 'lunch'
          WHEN extract(hour from a.activity_at AT TIME ZONE 'Europe/Zurich') BETWEEN 18 AND 22 THEN 'dinner'
          ELSE 'off_peak'
        END AS service_label,
        COUNT(*) AS total
      FROM activity a
      WHERE a.user_id = s.user_id
      GROUP BY 1
      ORDER BY total DESC, service_label
      LIMIT 1
    ) bucket
  ) AS preferred_service ON true
  LEFT JOIN LATERAL (
    SELECT extract(isodow from a.activity_at AT TIME ZONE 'Europe/Zurich')::integer AS weekday
    FROM activity a
    WHERE a.user_id = s.user_id
    GROUP BY 1
    ORDER BY COUNT(*) DESC, weekday
    LIMIT 1
  ) AS preferred_weekday ON true
  LEFT JOIN LATERAL (
    SELECT extract(hour from so.activity_at AT TIME ZONE 'Europe/Zurich')::integer AS hour_value
    FROM scoped_orders so
    WHERE so.user_id = s.user_id
    GROUP BY 1
    ORDER BY COUNT(*) DESC, hour_value
    LIMIT 1
  ) AS favorite_order_hour ON true
  LEFT JOIN LATERAL (
    SELECT extract(hour from sr.activity_at AT TIME ZONE 'Europe/Zurich')::integer AS hour_value
    FROM scoped_reservations sr
    WHERE sr.user_id = s.user_id
    GROUP BY 1
    ORDER BY COUNT(*) DESC, hour_value
    LIMIT 1
  ) AS favorite_reservation_hour ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'label', item_name,
        'category', category_name,
        'quantity', quantity_total,
        'orders', orders_total
      )
      ORDER BY quantity_total DESC, item_name
    ) AS items
    FROM (
      SELECT
        COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article') AS item_name,
        NULLIF(COALESCE(mi.category, oi.metadata->>'category', ''), '') AS category_name,
        SUM(COALESCE(oi.quantity, 1))::integer AS quantity_total,
        COUNT(DISTINCT oi.order_id)::integer AS orders_total
      FROM scoped_orders so
      JOIN public.order_items oi ON oi.order_id = so.id
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE so.user_id = s.user_id
      GROUP BY 1, 2
      ORDER BY quantity_total DESC, item_name
      LIMIT 5
    ) favorites
  ) AS favorite_items ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(cuisine_name ORDER BY cuisine_name) AS cuisines
    FROM (
      SELECT DISTINCT COALESCE(c.name, NULLIF(r.cuisine_type, ''), 'Cuisine') AS cuisine_name
      FROM activity a
      JOIN public.restaurants r ON r.id = a.restaurant_id
      LEFT JOIN public.restaurant_cuisines rc ON rc.restaurant_id = r.id
      LEFT JOIN public.cuisines c ON c.id = rc.cuisine_id
      WHERE a.user_id = s.user_id
      LIMIT 6
    ) cuisine_values
  ) AS favorite_cuisines ON true
  ORDER BY s.last_activity_at DESC NULLS LAST, s.resolved_full_name
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) TO service_role;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('dashboard-crm', 'Dashboard: CRM clients', 'Expose le CRM restaurateur base sur les commandes et reservations.', true),
  ('admin-crm', 'Admin: CRM clients', 'Expose le CRM client global pour l''administration TOK.', true)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_active = COALESCE(public.feature_flags.is_active, EXCLUDED.is_active);

NOTIFY pgrst, 'reload schema';
