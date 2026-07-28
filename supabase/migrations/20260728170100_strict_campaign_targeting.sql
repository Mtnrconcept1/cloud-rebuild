-- Align every campaign delivery surface and the dashboard audience estimate.
-- Values inside one family are OR-ed, while all active targeting families must match.

CREATE OR REPLACE FUNCTION public.social_campaign_targeting_score(
  p_target_criteria jsonb,
  p_restaurant_id uuid,
  p_restaurant_city text DEFAULT NULL::text,
  p_restaurant_cuisine text DEFAULT NULL::text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_city text := '';
  v_profile_gender text := '';
  v_cities text[] := ARRAY[]::text[];
  v_cuisines text[] := ARRAY[]::text[];
  v_genders text[] := ARRAY[]::text[];
  v_journey_types text[] := ARRAY[]::text[];
  v_service_moments text[] := ARRAY[]::text[];
  v_user_cuisines text[] := ARRAY[]::text[];
  v_user_journeys text[] := ARRAY[]::text[];
  v_user_service_moments text[] := ARRAY[]::text[];
  v_interaction_count integer := 0;
  v_avg_basket numeric := 0;
  v_days_since_last_activity integer := NULL;
  v_last_activity timestamptz := NULL;
  v_favorites_only boolean := false;
  v_is_favorite boolean := false;
  v_min_orders numeric := 0;
  v_min_avg_basket numeric := 0;
  v_max_days_since_order numeric := 365;
  v_customer_segment text := 'all';
  v_score numeric := 0;
  v_has_targeting boolean := false;
BEGIN
  p_target_criteria := COALESCE(p_target_criteria, '{}'::jsonb);

  SELECT COALESCE(array_agg(public.normalize_search_text(value)), ARRAY[]::text[]) INTO v_cities
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_target_criteria->'cities') = 'array' THEN p_target_criteria->'cities' ELSE '[]'::jsonb END
  ) AS value;

  SELECT COALESCE(array_agg(public.normalize_search_text(value)), ARRAY[]::text[]) INTO v_cuisines
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_target_criteria->'cuisines') = 'array' THEN p_target_criteria->'cuisines' ELSE '[]'::jsonb END
  ) AS value;

  SELECT COALESCE(array_agg(
    CASE public.normalize_search_text(value)
      WHEN 'femme' THEN 'female'
      WHEN 'f' THEN 'female'
      WHEN 'homme' THEN 'male'
      WHEN 'm' THEN 'male'
      ELSE public.normalize_search_text(value)
    END
  ), ARRAY[]::text[]) INTO v_genders
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_target_criteria->'genders') = 'array' THEN p_target_criteria->'genders' ELSE '[]'::jsonb END
  ) AS value;

  SELECT COALESCE(array_agg(
    CASE public.normalize_search_text(value)
      WHEN 'zero attente' THEN 'zero_attente'
      WHEN 'zero-attente' THEN 'zero_attente'
      ELSE public.normalize_search_text(value)
    END
  ), ARRAY[]::text[]) INTO v_journey_types
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_target_criteria->'journeyTypes') = 'array' THEN p_target_criteria->'journeyTypes' ELSE '[]'::jsonb END
  ) AS value;

  SELECT COALESCE(array_agg(
    CASE public.normalize_search_text(value)
      WHEN 'midi' THEN 'lunch'
      WHEN 'soir' THEN 'dinner'
      WHEN 'week end' THEN 'weekend'
      ELSE public.normalize_search_text(value)
    END
  ), ARRAY[]::text[]) INTO v_service_moments
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_target_criteria->'serviceMoments') = 'array' THEN p_target_criteria->'serviceMoments' ELSE '[]'::jsonb END
  ) AS value;

  v_favorites_only := COALESCE((p_target_criteria->>'favoritesOnly')::boolean, false);
  v_min_orders := GREATEST(0, COALESCE(NULLIF(p_target_criteria->>'minOrders', '')::numeric, 0));
  v_min_avg_basket := GREATEST(0, COALESCE(NULLIF(p_target_criteria->>'minAvgBasket', '')::numeric, 0));
  v_max_days_since_order := GREATEST(1, COALESCE(NULLIF(p_target_criteria->>'maxDaysSinceOrder', '')::numeric, 365));
  v_customer_segment := public.normalize_search_text(COALESCE(p_target_criteria->>'customerSegment', 'all'));

  v_has_targeting := cardinality(v_cities) > 0
    OR cardinality(v_cuisines) > 0
    OR (cardinality(v_genders) > 0 AND NOT ('all' = ANY(v_genders)))
    OR cardinality(v_journey_types) > 0
    OR cardinality(v_service_moments) > 0
    OR v_favorites_only
    OR v_min_orders > 0
    OR v_min_avg_basket > 0
    OR v_max_days_since_order < 365
    OR v_customer_segment <> 'all';

  IF NOT v_has_targeting THEN
    RETURN 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    public.normalize_search_text(p.city),
    CASE public.normalize_search_text(p.gender)
      WHEN 'femme' THEN 'female'
      WHEN 'f' THEN 'female'
      WHEN 'homme' THEN 'male'
      WHEN 'm' THEN 'male'
      ELSE public.normalize_search_text(p.gender)
    END
  INTO v_profile_city, v_profile_gender
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.favorites f
    WHERE f.user_id = v_user_id
      AND f.restaurant_id = p_restaurant_id
  ) INTO v_is_favorite;

  SELECT count(*)::integer, COALESCE(avg(NULLIF(o.total_amount, 0)), 0), max(o.created_at)
  INTO v_interaction_count, v_avg_basket, v_last_activity
  FROM public.orders o
  WHERE o.user_id = v_user_id
    AND o.restaurant_id IS NOT NULL
    AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'refunded', 'payment_failed', 'failed');

  SELECT
    v_interaction_count + count(*)::integer,
    COALESCE(greatest(v_last_activity, max(rv.created_at)), v_last_activity, max(rv.created_at))
  INTO v_interaction_count, v_last_activity
  FROM public.reservations rv
  WHERE rv.user_id = v_user_id
    AND rv.restaurant_id IS NOT NULL
    AND lower(COALESCE(rv.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'no_show', 'failed');

  IF v_last_activity IS NOT NULL THEN
    v_days_since_last_activity := floor(extract(epoch from (now() - v_last_activity)) / 86400.0)::integer;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT public.normalize_search_text(token)), ARRAY[]::text[]) INTO v_user_cuisines
  FROM (
    SELECT unnest(COALESCE(up.favorite_cuisines, up.dietary_tags, ARRAY[]::text[])) AS token
    FROM public.user_preferences up
    WHERE up.user_id = v_user_id
    UNION ALL
    SELECT regexp_split_to_table(COALESCE(r.cuisine_type, ''), ',') AS token
    FROM public.restaurants r
    WHERE r.id IN (
      SELECT f.restaurant_id FROM public.favorites f WHERE f.user_id = v_user_id
      UNION
      SELECT o.restaurant_id FROM public.orders o WHERE o.user_id = v_user_id AND o.restaurant_id IS NOT NULL
      UNION
      SELECT rv.restaurant_id FROM public.reservations rv WHERE rv.user_id = v_user_id AND rv.restaurant_id IS NOT NULL
    )
  ) cuisine_source
  WHERE trim(token) <> '';

  SELECT COALESCE(array_agg(DISTINCT journey), ARRAY[]::text[]) INTO v_user_journeys
  FROM (
    SELECT CASE WHEN COALESCE(trim(o.delivery_address), '') <> '' THEN 'delivery' ELSE 'takeaway' END AS journey
    FROM public.orders o
    WHERE o.user_id = v_user_id
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'refunded', 'payment_failed', 'failed')
    UNION ALL
    SELECT CASE
      WHEN public.normalize_search_text(COALESCE(rv.feature, rv.metadata->>'feature')) IN ('zero attente', 'zero-attente') THEN 'zero_attente'
      ELSE 'reservation'
    END AS journey
    FROM public.reservations rv
    WHERE rv.user_id = v_user_id
      AND lower(COALESCE(rv.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'no_show', 'failed')
  ) journey_source;

  SELECT COALESCE(array_agg(DISTINCT moment), ARRAY[]::text[]) INTO v_user_service_moments
  FROM (
    SELECT CASE WHEN extract(hour from o.created_at) < 15 THEN 'lunch' ELSE 'dinner' END AS moment
    FROM public.orders o
    WHERE o.user_id = v_user_id
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'refunded', 'payment_failed', 'failed')
    UNION ALL
    SELECT 'weekend' AS moment
    FROM public.orders o
    WHERE o.user_id = v_user_id
      AND extract(isodow from o.created_at) IN (6, 7)
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'refunded', 'payment_failed', 'failed')
    UNION ALL
    SELECT CASE
      WHEN public.normalize_search_text(rv.metadata->>'service') IN ('lunch', 'midi') THEN 'lunch'
      WHEN public.normalize_search_text(rv.metadata->>'service') IN ('dinner', 'soir') THEN 'dinner'
      WHEN extract(hour from COALESCE(rv.time, time '12:00')) < 15 THEN 'lunch'
      ELSE 'dinner'
    END AS moment
    FROM public.reservations rv
    WHERE rv.user_id = v_user_id
      AND lower(COALESCE(rv.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'no_show', 'failed')
    UNION ALL
    SELECT 'weekend' AS moment
    FROM public.reservations rv
    WHERE rv.user_id = v_user_id
      AND extract(isodow from COALESCE(rv.date, rv.created_at::date)) IN (6, 7)
      AND lower(COALESCE(rv.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'no_show', 'failed')
  ) moment_source;

  IF cardinality(v_genders) > 0 AND NOT ('all' = ANY(v_genders)) THEN
    IF v_profile_gender = '' OR NOT (v_profile_gender = ANY(v_genders)) THEN RETURN 0; END IF;
    v_score := v_score + 1;
  END IF;

  IF cardinality(v_cities) > 0 THEN
    IF v_profile_city = '' OR NOT (v_profile_city = ANY(v_cities)) THEN RETURN 0; END IF;
    v_score := v_score + 8;
  END IF;

  IF cardinality(v_cuisines) > 0 THEN
    IF NOT (v_cuisines && v_user_cuisines) THEN RETURN 0; END IF;
    v_score := v_score + 10;
  END IF;

  IF v_favorites_only THEN
    IF NOT v_is_favorite THEN RETURN 0; END IF;
    v_score := v_score + 8;
  END IF;

  IF v_min_orders > 0 THEN
    IF v_interaction_count < v_min_orders THEN RETURN 0; END IF;
    v_score := v_score + 5;
  END IF;

  IF v_min_avg_basket > 0 THEN
    IF v_avg_basket < v_min_avg_basket THEN RETURN 0; END IF;
    v_score := v_score + 5;
  END IF;

  IF v_max_days_since_order < 365 THEN
    IF v_days_since_last_activity IS NULL OR v_days_since_last_activity > v_max_days_since_order THEN RETURN 0; END IF;
    v_score := v_score + 5;
  END IF;

  IF cardinality(v_journey_types) > 0 THEN
    IF NOT (v_journey_types && v_user_journeys) THEN RETURN 0; END IF;
    v_score := v_score + 4;
  END IF;

  IF cardinality(v_service_moments) > 0 THEN
    IF NOT (v_service_moments && v_user_service_moments) THEN RETURN 0; END IF;
    v_score := v_score + 3;
  END IF;

  IF v_customer_segment = 'new' THEN
    IF v_interaction_count <> 0 THEN RETURN 0; END IF;
    v_score := v_score + 6;
  ELSIF v_customer_segment = 'returning' THEN
    IF v_interaction_count <= 0 THEN RETURN 0; END IF;
    v_score := v_score + 6;
  ELSIF v_customer_segment = 'loyal' THEN
    IF NOT (v_interaction_count >= 5 OR v_is_favorite) THEN RETURN 0; END IF;
    v_score := v_score + 6;
  ELSIF v_customer_segment = 'inactive' THEN
    IF NOT (v_interaction_count > 0 AND v_days_since_last_activity IS NOT NULL AND v_days_since_last_activity >= 45) THEN RETURN 0; END IF;
    v_score := v_score + 6;
  END IF;

  RETURN GREATEST(v_score, 1);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.estimate_campaign_audience(
  p_restaurant_id uuid,
  p_criteria jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_criteria->'cities') = 'array' THEN p_criteria->'cities' ELSE '[]'::jsonb END
        ) value
      ), ARRAY[]::text[]) AS cities,
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_criteria->'cuisines') = 'array' THEN p_criteria->'cuisines' ELSE '[]'::jsonb END
        ) value
      ), ARRAY[]::text[]) AS cuisines,
      COALESCE((
        SELECT array_agg(CASE public.normalize_search_text(value)
          WHEN 'femme' THEN 'female'
          WHEN 'f' THEN 'female'
          WHEN 'homme' THEN 'male'
          WHEN 'm' THEN 'male'
          ELSE public.normalize_search_text(value)
        END)
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_criteria->'genders') = 'array' THEN p_criteria->'genders' ELSE '[]'::jsonb END
        ) value
      ), ARRAY[]::text[]) AS genders,
      COALESCE((
        SELECT array_agg(CASE public.normalize_search_text(value)
          WHEN 'zero attente' THEN 'zero_attente'
          WHEN 'zero-attente' THEN 'zero_attente'
          ELSE public.normalize_search_text(value)
        END)
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_criteria->'journeyTypes') = 'array' THEN p_criteria->'journeyTypes' ELSE '[]'::jsonb END
        ) value
      ), ARRAY[]::text[]) AS journey_types,
      COALESCE((
        SELECT array_agg(CASE public.normalize_search_text(value)
          WHEN 'midi' THEN 'lunch'
          WHEN 'soir' THEN 'dinner'
          WHEN 'week end' THEN 'weekend'
          ELSE public.normalize_search_text(value)
        END)
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_criteria->'serviceMoments') = 'array' THEN p_criteria->'serviceMoments' ELSE '[]'::jsonb END
        ) value
      ), ARRAY[]::text[]) AS service_moments,
      GREATEST(COALESCE(NULLIF(p_criteria->>'minOrders', '')::integer, 0), 0) AS min_orders,
      GREATEST(COALESCE(NULLIF(p_criteria->>'maxDaysSinceOrder', '')::integer, 365), 1) AS max_days_since_order,
      GREATEST(COALESCE(NULLIF(p_criteria->>'minAvgBasket', '')::numeric, 0), 0) AS min_avg_basket,
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
      CASE WHEN COALESCE(trim(o.delivery_address), '') <> '' THEN 'delivery' ELSE 'takeaway' END AS journey_type,
      CASE WHEN EXTRACT(HOUR FROM o.created_at) < 15 THEN 'lunch' ELSE 'dinner' END AS service_moment
    FROM public.orders o
    WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'refunded', 'payment_failed', 'failed')
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
        WHEN public.normalize_search_text(COALESCE(r.feature, r.metadata->>'feature')) IN ('zero attente', 'zero-attente') THEN 'zero_attente'
        ELSE 'reservation'
      END AS journey_type,
      CASE
        WHEN public.normalize_search_text(r.metadata->>'service') IN ('lunch', 'midi') THEN 'lunch'
        WHEN public.normalize_search_text(r.metadata->>'service') IN ('dinner', 'soir') THEN 'dinner'
        WHEN EXTRACT(HOUR FROM COALESCE(r.time, time '12:00')) < 15 THEN 'lunch'
        ELSE 'dinner'
      END AS service_moment
    FROM public.reservations r
    WHERE lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'canceled', 'refused', 'rejected', 'no_show', 'failed')
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
      BOOL_OR(vo.service_moment = 'lunch') AS lunch_order,
      BOOL_OR(vo.service_moment = 'dinner') AS dinner_order,
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
      FROM unnest(ARRAY[c.name, c.slug, r.cuisine_type]::text[]) AS token_values(token_value)
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
      CASE public.normalize_search_text(p.gender)
        WHEN 'femme' THEN 'female'
        WHEN 'f' THEN 'female'
        WHEN 'homme' THEN 'male'
        WHEN 'm' THEN 'male'
        ELSE public.normalize_search_text(p.gender)
      END AS gender,
      COALESCE(fs.favorite_restaurant_ids, ARRAY[]::text[]) AS favorite_restaurant_ids,
      (COALESCE(os.order_count, 0) + COALESCE(rs.reservation_count, 0))::integer AS interaction_count,
      COALESCE(os.avg_basket, 0)::numeric AS avg_basket,
      CASE
        WHEN GREATEST(
          COALESCE(os.last_order_at, 'epoch'::timestamptz),
          COALESCE(rs.last_reservation_at, 'epoch'::timestamptz)
        ) = 'epoch'::timestamptz THEN NULL
        ELSE FLOOR(
          EXTRACT(EPOCH FROM (
            now() - GREATEST(
              COALESCE(os.last_order_at, 'epoch'::timestamptz),
              COALESCE(rs.last_reservation_at, 'epoch'::timestamptz)
            )
          )) / 86400
        )::integer
      END AS days_since_last_activity,
      COALESCE(cs.cuisine_tokens, ARRAY[]::text[]) AS cuisine_tokens,
      array_remove(ARRAY(
        SELECT DISTINCT journey_type
        FROM unnest(COALESCE(os.journey_types, ARRAY[]::text[]) || COALESCE(rs.journey_types, ARRAY[]::text[])) AS journey_values(journey_type)
      ), NULL) AS journey_types,
      array_remove(ARRAY[
        CASE WHEN COALESCE(os.lunch_order, false) OR COALESCE(rs.lunch_reservation, false) THEN 'lunch' ELSE NULL END,
        CASE WHEN COALESCE(os.dinner_order, false) OR COALESCE(rs.dinner_reservation, false) THEN 'dinner' ELSE NULL END,
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
      cardinality(c.cities) = 0
      OR s.city = ANY(c.cities)
    )
    AND (
      cardinality(c.cuisines) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.cuisine_tokens) AS token_values(token)
        JOIN unnest(c.cuisines) AS wanted_values(wanted)
          ON token_values.token LIKE '%' || wanted_values.wanted || '%'
      )
    )
    AND (
      cardinality(c.genders) = 0
      OR 'all' = ANY(c.genders)
      OR s.gender = ANY(c.genders)
    )
    AND (
      c.favorites_only = false
      OR p_restaurant_id::text = ANY(s.favorite_restaurant_ids)
    )
    AND s.interaction_count >= c.min_orders
    AND s.avg_basket >= c.min_avg_basket
    AND (
      c.max_days_since_order >= 365
      OR (
        s.days_since_last_activity IS NOT NULL
        AND s.days_since_last_activity <= c.max_days_since_order
      )
    )
    AND (
      cardinality(c.journey_types) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.journey_types) AS journey_values(journey_type)
        WHERE journey_values.journey_type = ANY(c.journey_types)
      )
    )
    AND (
      cardinality(c.service_moments) = 0
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
      WHEN 'inactive' THEN s.interaction_count > 0 AND s.days_since_last_activity IS NOT NULL AND s.days_since_last_activity >= 45
      ELSE true
    END;

  RETURN COALESCE(v_result, 0);
END;
$function$;
