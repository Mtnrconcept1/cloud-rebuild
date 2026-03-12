CREATE OR REPLACE FUNCTION public.normalize_search_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT trim(
    regexp_replace(
      translate(
        lower(COALESCE(p_text, '')),
        'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ),
      '[^a-z0-9\s-]+',
      ' ',
      'g'
    )
  );
$function$;

CREATE TABLE IF NOT EXISTS public.edge_function_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  action text NOT NULL DEFAULT 'invoke',
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_roles text[] NOT NULL DEFAULT '{}'::text[],
  is_service_role boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('success', 'failure')),
  target_entity_type text,
  target_entity_id text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_function_audit_logs_function_created
  ON public.edge_function_audit_logs(function_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_function_audit_logs_actor_created
  ON public.edge_function_audit_logs(actor_user_id, created_at DESC);

ALTER TABLE public.edge_function_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edge_function_audit_logs_admin_select" ON public.edge_function_audit_logs;
CREATE POLICY "edge_function_audit_logs_admin_select"
  ON public.edge_function_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.edge_function_audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.search_restaurants_catalog(
  p_query text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cuisine text DEFAULT NULL,
  p_price_range integer DEFAULT NULL,
  p_delivery_only boolean DEFAULT false,
  p_min_rating numeric DEFAULT 0,
  p_sort_by text DEFAULT 'pertinence',
  p_sort_direction text DEFAULT NULL,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  cuisine_type text,
  rating numeric,
  review_count integer,
  price_range integer,
  delivery_fee numeric,
  image_url text,
  address text,
  city text,
  delivery_available boolean,
  created_at timestamptz,
  category_names text[],
  category_slugs text[],
  matched_via_menu boolean,
  monthly_reservations integer,
  monthly_orders integer,
  promotion_score numeric,
  relevance_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_query text := public.normalize_search_text(p_query);
  v_city text := public.normalize_search_text(p_city);
  v_cuisine text := public.normalize_search_text(p_cuisine);
  v_sort_by text := CASE
    WHEN public.normalize_search_text(p_sort_by) IN (
      'pertinence', 'note', 'promotion', 'prix',
      'popularite', 'nouveaux', 'mieux_notes_mois', 'plus_reserves_mois'
    ) THEN public.normalize_search_text(p_sort_by)
    ELSE 'pertinence'
  END;
  v_sort_direction text := CASE
    WHEN lower(COALESCE(p_sort_direction, '')) IN ('asc', 'desc') THEN lower(p_sort_direction)
    WHEN public.normalize_search_text(p_sort_by) = 'prix' THEN 'asc'
    ELSE 'desc'
  END;
BEGIN
  RETURN QUERY
  WITH restaurant_categories AS (
    SELECT
      rc.restaurant_id,
      array_remove(array_agg(DISTINCT c.name), NULL) AS category_names,
      array_remove(array_agg(DISTINCT COALESCE(c.slug, public.normalize_search_text(c.name))), NULL) AS category_slugs,
      public.normalize_search_text(
        COALESCE(string_agg(DISTINCT c.name, ' '), '') || ' ' ||
        COALESCE(string_agg(DISTINCT c.slug, ' '), '') || ' ' ||
        COALESCE(string_agg(DISTINCT array_to_string(c.keywords, ' '), ' '), '')
      ) AS category_blob
    FROM public.restaurant_cuisines rc
    JOIN public.cuisines c ON c.id = rc.cuisine_id
    GROUP BY rc.restaurant_id
  ),
  monthly_reservation_counts AS (
    SELECT
      r.restaurant_id,
      COUNT(*)::integer AS monthly_reservations
    FROM public.reservations r
    WHERE r.date >= date_trunc('month', now())::date
      AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'refused')
    GROUP BY r.restaurant_id
  ),
  monthly_order_counts AS (
    SELECT
      o.restaurant_id,
      COUNT(*)::integer AS monthly_orders
    FROM public.orders o
    WHERE o.created_at >= date_trunc('month', now())
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    GROUP BY o.restaurant_id
  ),
  anti_waste_scores AS (
    SELECT
      awo.restaurant_id,
      MAX(
        CASE
          WHEN COALESCE(awo.original_price, 0) > 0
            THEN ROUND((((awo.original_price - COALESCE(awo.discounted_price, 0)) / awo.original_price) * 100)::numeric, 2)
          ELSE 0
        END
      ) AS score
    FROM public.anti_waste_offers awo
    WHERE awo.is_active = true
      AND awo.available_date >= current_date
    GROUP BY awo.restaurant_id
  ),
  formula_scores AS (
    SELECT
      mf.restaurant_id,
      MAX(COALESCE(mf.discount_percent, 0)::numeric) AS score
    FROM public.meal_formulas mf
    WHERE mf.is_active = true
    GROUP BY mf.restaurant_id
  ),
  promotion_scores AS (
    SELECT
      scores.restaurant_id,
      MAX(scores.score) AS promotion_score
    FROM (
      SELECT * FROM anti_waste_scores
      UNION ALL
      SELECT * FROM formula_scores
    ) scores
    GROUP BY scores.restaurant_id
  ),
  menu_matches AS (
    SELECT
      mi.restaurant_id,
      true AS matched_via_menu
    FROM public.menu_items mi
    WHERE mi.is_available = true
      AND v_query <> ''
      AND (
        public.normalize_search_text(mi.name) LIKE '%' || v_query || '%'
        OR public.normalize_search_text(mi.description) LIKE '%' || v_query || '%'
        OR public.normalize_search_text(mi.category) LIKE '%' || v_query || '%'
      )
    GROUP BY mi.restaurant_id
  ),
  base AS (
    SELECT
      r.id,
      r.name,
      r.description,
      r.cuisine_type,
      COALESCE(r.rating, 0) AS rating,
      COALESCE(r.review_count, 0) AS review_count,
      COALESCE(r.price_range, 2) AS price_range,
      COALESCE(r.delivery_fee, 0) AS delivery_fee,
      r.image_url,
      r.address,
      r.city,
      COALESCE(r.delivery_available, false) AS delivery_available,
      r.created_at,
      COALESCE(rc.category_names, ARRAY[]::text[]) AS category_names,
      COALESCE(rc.category_slugs, ARRAY[]::text[]) AS category_slugs,
      COALESCE(mm.matched_via_menu, false) AS matched_via_menu,
      COALESCE(mrc.monthly_reservations, 0) AS monthly_reservations,
      COALESCE(moc.monthly_orders, 0) AS monthly_orders,
      COALESCE(ps.promotion_score, 0) AS promotion_score,
      public.normalize_search_text(r.name) AS normalized_name,
      public.normalize_search_text(r.description) AS normalized_description,
      public.normalize_search_text(r.cuisine_type) AS normalized_cuisine,
      public.normalize_search_text(r.city) AS normalized_city,
      COALESCE(rc.category_blob, '') AS category_blob
    FROM public.restaurants r
    LEFT JOIN restaurant_categories rc ON rc.restaurant_id = r.id
    LEFT JOIN monthly_reservation_counts mrc ON mrc.restaurant_id = r.id
    LEFT JOIN monthly_order_counts moc ON moc.restaurant_id = r.id
    LEFT JOIN promotion_scores ps ON ps.restaurant_id = r.id
    LEFT JOIN menu_matches mm ON mm.restaurant_id = r.id
    WHERE r.is_active = true
      AND (v_city = '' OR public.normalize_search_text(r.city) LIKE '%' || v_city || '%')
      AND (COALESCE(p_price_range, 0) <= 0 OR r.price_range = p_price_range)
      AND (COALESCE(p_delivery_only, false) = false OR COALESCE(r.delivery_available, false) = true)
      AND COALESCE(r.rating, 0) >= GREATEST(COALESCE(p_min_rating, 0), 0)
  ),
  filtered AS (
    SELECT
      base.*,
      (
        CASE
          WHEN v_query = '' THEN 0
          WHEN base.normalized_name = v_query THEN 220
          WHEN base.normalized_name LIKE v_query || '%' THEN 170
          WHEN base.normalized_name LIKE '%' || v_query || '%' THEN 120
          ELSE 0
        END
        + CASE WHEN v_query <> '' AND base.normalized_cuisine LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.category_blob LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.normalized_city LIKE '%' || v_query || '%' THEN 40 ELSE 0 END
        + CASE WHEN base.matched_via_menu THEN 60 ELSE 0 END
        + CASE WHEN v_query = '' THEN (base.rating * 18) + (base.review_count * 0.9) ELSE 0 END
        + (base.monthly_reservations * 4)
        + (base.monthly_orders * 3)
        + (base.promotion_score * 1.4)
        + CASE WHEN base.delivery_available THEN 6 ELSE 0 END
      )::numeric AS relevance_score,
      (
        base.review_count
        + (base.monthly_reservations * 4)
        + (base.monthly_orders * 3)
      )::numeric AS popularity_score
    FROM base
    WHERE (v_cuisine = '' OR base.normalized_cuisine LIKE '%' || v_cuisine || '%' OR base.category_blob LIKE '%' || v_cuisine || '%')
      AND (
        v_query = ''
        OR base.normalized_name LIKE '%' || v_query || '%'
        OR base.normalized_description LIKE '%' || v_query || '%'
        OR base.normalized_cuisine LIKE '%' || v_query || '%'
        OR base.category_blob LIKE '%' || v_query || '%'
        OR base.matched_via_menu
      )
  )
  SELECT
    filtered.id,
    filtered.name,
    filtered.description,
    filtered.cuisine_type,
    filtered.rating,
    filtered.review_count,
    filtered.price_range,
    filtered.delivery_fee,
    filtered.image_url,
    filtered.address,
    filtered.city,
    filtered.delivery_available,
    filtered.created_at,
    filtered.category_names,
    filtered.category_slugs,
    filtered.matched_via_menu,
    filtered.monthly_reservations,
    filtered.monthly_orders,
    filtered.promotion_score,
    filtered.relevance_score
  FROM filtered
  ORDER BY
    CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
    CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,

    CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'desc' THEN filtered.promotion_score END DESC,
    CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'asc' THEN filtered.promotion_score END ASC,

    CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'asc' THEN filtered.price_range END ASC,
    CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'desc' THEN filtered.price_range END DESC,

    CASE WHEN v_sort_by = 'popularite' AND v_sort_direction = 'desc' THEN filtered.popularity_score END DESC,
    CASE WHEN v_sort_by = 'popularite' AND v_sort_direction = 'asc' THEN filtered.popularity_score END ASC,

    CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'desc' THEN filtered.created_at END DESC,
    CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'asc' THEN filtered.created_at END ASC,

    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN CASE WHEN filtered.monthly_reservations > 0 THEN 1 ELSE 0 END END DESC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN CASE WHEN filtered.monthly_reservations > 0 THEN 1 ELSE 0 END END ASC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN filtered.monthly_reservations END DESC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN filtered.monthly_reservations END ASC,

    CASE WHEN v_sort_by = 'plus_reserves_mois' AND v_sort_direction = 'desc' THEN filtered.monthly_reservations END DESC,
    CASE WHEN v_sort_by = 'plus_reserves_mois' AND v_sort_direction = 'asc' THEN filtered.monthly_reservations END ASC,

    CASE WHEN v_sort_by = 'pertinence' AND v_sort_direction = 'desc' THEN filtered.relevance_score END DESC,
    CASE WHEN v_sort_by = 'pertinence' AND v_sort_direction = 'asc' THEN filtered.relevance_score END ASC,

    filtered.rating DESC,
    filtered.review_count DESC,
    filtered.name ASC
  LIMIT GREATEST(COALESCE(p_limit, 60), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog(text, text, text, integer, boolean, numeric, text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog(text, text, text, integer, boolean, numeric, text, text, integer, integer) TO authenticated;

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
        WHEN COALESCE(NULLIF(split_part(COALESCE(r.time, '12:00'), ':', 1), ''), '12')::integer < 15 THEN 'lunch'
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
