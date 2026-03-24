CREATE OR REPLACE FUNCTION public.estimate_campaign_audience(
  p_restaurant_id uuid,
  p_criteria jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_owner boolean := false;
  v_result integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT public.has_role(v_actor_id, 'admin') INTO v_is_admin;
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id = v_actor_id
  ) INTO v_is_owner;

  IF NOT v_is_admin AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH criteria AS (
    SELECT
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'cities', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS cities,
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'cuisines', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS cuisines,
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'journeyTypes', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS journey_types,
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'serviceMoments', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS service_moments,
      GREATEST(COALESCE((p_criteria->>'minOrders')::integer, 0), 0) AS min_orders,
      GREATEST(COALESCE((p_criteria->>'maxDaysSinceOrder')::integer, 365), 1) AS max_days_since_order,
      GREATEST(COALESCE((p_criteria->>'minAvgBasket')::numeric, 0), 0) AS min_avg_basket,
      COALESCE((p_criteria->>'favoritesOnly')::boolean, false) AS favorites_only,
      CASE
        WHEN public.normalize_search_text(p_criteria->>'customerSegment') IN ('new', 'returning', 'loyal', 'inactive')
          THEN public.normalize_search_text(p_criteria->>'customerSegment')
        ELSE 'all'
      END AS customer_segment
  ),
  valid_orders AS (
    SELECT
      o.user_id,
      o.restaurant_id,
      o.total_amount,
      o.created_at,
      CASE
        WHEN COALESCE(trim(o.delivery_address), '') <> '' THEN 'delivery'
        ELSE 'takeaway'
      END AS journey_type
    FROM public.orders o
    WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
  ),
  valid_reservations AS (
    SELECT
      r.user_id,
      r.restaurant_id,
      COALESCE(
        (((r.date)::timestamp + COALESCE(r.time::time, time '12:00')) AT TIME ZONE 'UTC'),
        r.created_at
      ) AS activity_at,
      CASE
        WHEN public.normalize_search_text(COALESCE(r.feature, r.metadata->>'feature')) IN ('zero attente', 'zero_attente', 'zero-attente')
          THEN 'zero_attente'
        ELSE 'reservation'
      END AS journey_type,
      CASE
        WHEN public.normalize_search_text(r.metadata->>'service') IN ('lunch', 'midi') THEN 'lunch'
        WHEN public.normalize_search_text(r.metadata->>'service') IN ('dinner', 'soir') THEN 'dinner'
        WHEN EXTRACT(HOUR FROM COALESCE(r.time, time '12:00')) < 15 THEN 'lunch'
        ELSE 'dinner'
      END AS service_moment
    FROM public.reservations r
    WHERE lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'refused')
  ),
  favorite_stats AS (
    SELECT
      f.user_id,
      array_remove(array_agg(DISTINCT f.restaurant_id::text), NULL) AS favorite_restaurant_ids
    FROM public.favorites f
    GROUP BY f.user_id
  ),
  order_stats AS (
    SELECT
      vo.user_id,
      COUNT(*)::integer AS order_count,
      AVG(COALESCE(vo.total_amount, 0))::numeric AS avg_basket,
      MAX(vo.created_at) AS last_order_at,
      BOOL_OR(EXTRACT(DOW FROM vo.created_at) IN (0, 6)) AS weekend_order,
      array_remove(array_agg(DISTINCT vo.journey_type), NULL) AS journey_types
    FROM valid_orders vo
    GROUP BY vo.user_id
  ),
  reservation_stats AS (
    SELECT
      vr.user_id,
      COUNT(*)::integer AS reservation_count,
      MAX(vr.activity_at) AS last_reservation_at,
      BOOL_OR(EXTRACT(DOW FROM vr.activity_at) IN (0, 6)) AS weekend_reservation,
      BOOL_OR(vr.service_moment = 'lunch') AS lunch_reservation,
      BOOL_OR(vr.service_moment = 'dinner') AS dinner_reservation,
      array_remove(array_agg(DISTINCT vr.journey_type), NULL) AS journey_types
    FROM valid_reservations vr
    GROUP BY vr.user_id
  ),
  interacted_restaurants AS (
    SELECT vo.user_id, vo.restaurant_id FROM valid_orders vo
    UNION
    SELECT vr.user_id, vr.restaurant_id FROM valid_reservations vr
    UNION
    SELECT f.user_id, f.restaurant_id FROM public.favorites f
  ),
  cuisine_signals AS (
    SELECT
      ir.user_id,
      array_remove(array_agg(DISTINCT signal.token), NULL) AS cuisine_tokens
    FROM interacted_restaurants ir
    JOIN public.restaurants r ON r.id = ir.restaurant_id
    LEFT JOIN public.restaurant_cuisines rc ON rc.restaurant_id = ir.restaurant_id
    LEFT JOIN public.cuisines c ON c.id = rc.cuisine_id
    LEFT JOIN LATERAL (
      SELECT public.normalize_search_text(token_value) AS token
      FROM unnest(ARRAY[
        c.name,
        c.slug,
        r.cuisine_type
      ]::text[]) AS token_values(token_value)
      UNION ALL
      SELECT public.normalize_search_text(keyword_value)
      FROM unnest(COALESCE(c.keywords, ARRAY[]::text[])) AS keyword_values(keyword_value)
    ) signal ON true
    GROUP BY ir.user_id
  ),
  snapshots AS (
    SELECT
      p.user_id,
      public.normalize_search_text(p.city) AS city,
      COALESCE(fs.favorite_restaurant_ids, ARRAY[]::text[]) AS favorite_restaurant_ids,
      (COALESCE(os.order_count, 0) + COALESCE(rs.reservation_count, 0))::integer AS interaction_count,
      COALESCE(os.avg_basket, 0)::numeric AS avg_basket,
      CASE
        WHEN GREATEST(
          COALESCE(os.last_order_at, 'epoch'::timestamptz),
          COALESCE(rs.last_reservation_at, 'epoch'::timestamptz)
        ) = 'epoch'::timestamptz THEN NULL
        ELSE FLOOR(
          EXTRACT(
            EPOCH FROM (
              now() - GREATEST(
                COALESCE(os.last_order_at, 'epoch'::timestamptz),
                COALESCE(rs.last_reservation_at, 'epoch'::timestamptz)
              )
            )
          ) / 86400
        )::integer
      END AS days_since_last_activity,
      COALESCE(cs.cuisine_tokens, ARRAY[]::text[]) AS cuisine_tokens,
      array_remove(ARRAY(
        SELECT DISTINCT journey_type
        FROM unnest(COALESCE(os.journey_types, ARRAY[]::text[]) || COALESCE(rs.journey_types, ARRAY[]::text[])) AS journey_values(journey_type)
      ), NULL) AS journey_types,
      array_remove(ARRAY[
        CASE WHEN COALESCE(rs.lunch_reservation, false) THEN 'lunch' ELSE NULL END,
        CASE WHEN COALESCE(rs.dinner_reservation, false) THEN 'dinner' ELSE NULL END,
        CASE WHEN COALESCE(os.weekend_order, false) OR COALESCE(rs.weekend_reservation, false) THEN 'weekend' ELSE NULL END
      ], NULL) AS service_moments
    FROM public.profiles p
    LEFT JOIN favorite_stats fs ON fs.user_id = p.user_id
    LEFT JOIN order_stats os ON os.user_id = p.user_id
    LEFT JOIN reservation_stats rs ON rs.user_id = p.user_id
    LEFT JOIN cuisine_signals cs ON cs.user_id = p.user_id
  )
  SELECT COUNT(*)::integer
  INTO v_result
  FROM snapshots s
  CROSS JOIN criteria c
  WHERE (
      array_length(c.cities, 1) IS NULL
      OR array_length(c.cities, 1) = 0
      OR s.city = ANY(c.cities)
    )
    AND (
      array_length(c.cuisines, 1) IS NULL
      OR array_length(c.cuisines, 1) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.cuisine_tokens) AS token_values(token)
        JOIN unnest(c.cuisines) AS wanted_values(wanted) ON token_values.token LIKE '%' || wanted_values.wanted || '%'
      )
    )
    AND (
      c.favorites_only = false
      OR p_restaurant_id::text = ANY(s.favorite_restaurant_ids)
    )
    AND s.interaction_count >= c.min_orders
    AND s.avg_basket >= c.min_avg_basket
    AND (
      c.customer_segment = 'new'
      OR c.max_days_since_order >= 365
      OR (
        s.days_since_last_activity IS NOT NULL
        AND s.days_since_last_activity <= c.max_days_since_order
      )
    )
    AND (
      array_length(c.journey_types, 1) IS NULL
      OR array_length(c.journey_types, 1) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.journey_types) AS journey_values(journey_type)
        WHERE journey_values.journey_type = ANY(c.journey_types)
      )
    )
    AND (
      array_length(c.service_moments, 1) IS NULL
      OR array_length(c.service_moments, 1) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.service_moments) AS service_values(service_moment)
        WHERE service_values.service_moment = ANY(c.service_moments)
      )
    )
    AND CASE c.customer_segment
      WHEN 'new' THEN s.interaction_count = 0
      WHEN 'returning' THEN s.interaction_count > 0
      WHEN 'loyal' THEN s.interaction_count >= 5 OR p_restaurant_id::text = ANY(s.favorite_restaurant_ids)
      WHEN 'inactive' THEN s.interaction_count > 0 AND COALESCE(s.days_since_last_activity, 0) >= 45
      ELSE true
    END;

  RETURN COALESCE(v_result, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.estimate_campaign_audience(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
