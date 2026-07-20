-- Dedicated demo project only.
-- The browser uses the real client, restaurant and courier dashboards against
-- this isolated Supabase project. Every exception to the production guards is
-- tied to the restaurant assigned by the server-side demo account mapping.

CREATE OR REPLACE FUNCTION public.dedicated_demo_can_access_restaurant(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    public.is_dedicated_commercial_demo_actor()
    AND p_restaurant_id IS NOT NULL
    AND p_restaurant_id = public.commercial_demo_current_restaurant_id()
    AND public.can_view_commercial_demo_restaurant(p_restaurant_id),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.dedicated_demo_can_access_restaurant(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dedicated_demo_can_access_restaurant(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.dedicated_demo_can_access_restaurant(uuid) IS
  'Dedicated demo only. Authorizes exactly the active demo restaurant mapped to the current synthetic actor.';

-- Reuse the normal ownership checks throughout the real dashboard, but extend
-- them only for the single mapped demo restaurant. This does not make the
-- synthetic actor the owner of any unrelated restaurant.
CREATE OR REPLACE FUNCTION public.auth_owns_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.restaurants AS restaurant
      WHERE restaurant.id = p_restaurant_id
        AND restaurant.owner_id = auth.uid()
    )
    OR public.dedicated_demo_can_access_restaurant(p_restaurant_id),
    false
  );
$function$;

COMMENT ON FUNCTION public.auth_owns_restaurant(uuid) IS
  'Dedicated demo override. Preserves real ownership and recognizes only the current actor mapped to the requested demo restaurant.';

-- The protected-tool boundary deliberately lets these read-only RPCs reach the
-- dedicated project. Adapt only the two inherited production guards it uses;
-- all other generic transaction RPCs remain blocked.
DO $dedicated_demo_safe_read_rpcs$
DECLARE
  target_oid oid;
  original_definition text;
  patched_definition text; BEGIN
  target_oid := to_regprocedure(
    'public.get_restaurant_subscription_self_service_state(uuid)'
  );
  IF target_oid IS NULL THEN
    RAISE EXCEPTION
      'Missing read RPC get_restaurant_subscription_self_service_state(uuid)';
  END IF;

  original_definition := pg_get_functiondef(target_oid);
  patched_definition := replace(
    original_definition,
    'IF public.commercial_demo_current_user_is_restricted() THEN',
    'IF public.commercial_demo_current_user_is_restricted()
       AND NOT public.dedicated_demo_can_access_restaurant(p_restaurant_id) THEN'
  );
  IF patched_definition = original_definition THEN
    RAISE EXCEPTION
      'Could not scope get_restaurant_subscription_self_service_state to the mapped demo restaurant';
  END IF;
  EXECUTE patched_definition;

  target_oid := to_regprocedure(
    'public.get_reservation_fee_invoice_lines(uuid)'
  );
  IF target_oid IS NULL THEN
    RAISE EXCEPTION
      'Missing read RPC get_reservation_fee_invoice_lines(uuid)';
  END IF;

  original_definition := pg_get_functiondef(target_oid);
  patched_definition := replace(
    original_definition,
    'IF public.commercial_demo_current_user_is_restricted() THEN',
    'IF public.commercial_demo_current_user_is_restricted()
       AND NOT public.is_dedicated_commercial_demo_actor() THEN'
  );
  IF patched_definition = original_definition THEN
    RAISE EXCEPTION
      'Could not adapt get_reservation_fee_invoice_lines for the dedicated demo project';
  END IF;
  EXECUTE patched_definition;
END
$dedicated_demo_safe_read_rpcs$;

-- Credit usage is a SECURITY DEFINER read RPC without an ownership assertion.
-- Add a dedicated-actor resource check while leaving every non-demo caller's
-- existing production behavior unchanged.
DO $dedicated_demo_credit_usage_scope$
DECLARE
  target_oid oid;
  original_definition text;
  patched_definition text; BEGIN
  target_oid := to_regprocedure(
    'public.get_restaurant_credit_usage(uuid,timestamp with time zone,timestamp with time zone)'
  );
  IF target_oid IS NULL THEN
    RAISE EXCEPTION 'Missing read RPC get_restaurant_credit_usage';
  END IF;

  original_definition := pg_get_functiondef(target_oid);
  patched_definition := replace(
    original_definition,
    E'BEGIN\n  IF p_restaurant_id IS NULL THEN',
    E'BEGIN\n  IF public.is_dedicated_commercial_demo_actor()\n     AND NOT public.dedicated_demo_can_access_restaurant(p_restaurant_id) THEN\n    RAISE EXCEPTION ''DEMO_RESTAURANT_SCOPE_VIOLATION'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF p_restaurant_id IS NULL THEN'
  );
  IF patched_definition = original_definition THEN
    RAISE EXCEPTION
      'Could not scope get_restaurant_credit_usage to the mapped demo restaurant';
  END IF;
  EXECUTE patched_definition;
END
$dedicated_demo_credit_usage_scope$;

-- The client demo catalog exposes only the restaurant assigned to the current
-- server-provisioned commercial account, even if unrelated demo rows exist.
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
  v_tokens text[];
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
  END; BEGIN
  IF public.commercial_demo_current_user_is_restricted()
     AND NOT public.is_dedicated_commercial_demo_actor() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;

  -- Split query into individual tokens for multi-word matching
  IF v_query <> '' THEN
    v_tokens := string_to_array(v_query, ' ');
    -- Remove empty tokens
    v_tokens := array_remove(v_tokens, '');
  ELSE
    v_tokens := ARRAY[]::text[];
  END IF;

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
        -- Also match individual tokens against menu items
        OR (
          array_length(v_tokens, 1) > 1
          AND (
            SELECT bool_or(
              public.normalize_search_text(mi.name) LIKE '%' || tk || '%'
              OR public.normalize_search_text(mi.description) LIKE '%' || tk || '%'
            )
            FROM unnest(v_tokens) AS tk
          )
        )
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
      public.normalize_search_text(r.address) AS normalized_address,
      COALESCE(rc.category_blob, '') AS category_blob
    FROM public.restaurants r
    LEFT JOIN restaurant_categories rc ON rc.restaurant_id = r.id
    LEFT JOIN monthly_reservation_counts mrc ON mrc.restaurant_id = r.id
    LEFT JOIN monthly_order_counts moc ON moc.restaurant_id = r.id
    LEFT JOIN promotion_scores ps ON ps.restaurant_id = r.id
    LEFT JOIN menu_matches mm ON mm.restaurant_id = r.id
    WHERE r.is_active = true
      AND r.is_demo IS TRUE
      AND r.id = public.commercial_demo_current_restaurant_id()
      AND (v_city = '' OR public.normalize_search_text(r.city) LIKE '%' || v_city || '%')
      AND (COALESCE(p_price_range, 0) <= 0 OR r.price_range = p_price_range)
      AND (COALESCE(p_delivery_only, false) = false OR COALESCE(r.delivery_available, false) = true)
      AND COALESCE(r.rating, 0) >= GREATEST(COALESCE(p_min_rating, 0), 0)
  ),
  filtered AS (
    SELECT
      base.*,
      (
        -- === Full query matching (exact string) ===
        CASE
          WHEN v_query = '' THEN 0
          WHEN base.normalized_name = v_query THEN 220
          WHEN base.normalized_name LIKE v_query || '%' THEN 170
          WHEN base.normalized_name LIKE '%' || v_query || '%' THEN 120
          ELSE 0
        END
        + CASE WHEN v_query <> '' AND base.normalized_cuisine LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.category_blob LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.normalized_description LIKE '%' || v_query || '%' THEN 50 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.normalized_address LIKE '%' || v_query || '%' THEN 45 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.normalized_city LIKE '%' || v_query || '%' THEN 40 ELSE 0 END
        + CASE WHEN base.matched_via_menu THEN 60 ELSE 0 END

        -- === Token-level matching (each word scores independently) ===
        + CASE
            WHEN array_length(v_tokens, 1) > 1 THEN
              (
                SELECT COALESCE(SUM(
                  CASE WHEN base.normalized_name LIKE '%' || tk || '%' THEN 40 ELSE 0 END
                  + CASE WHEN base.normalized_cuisine LIKE '%' || tk || '%' THEN 25 ELSE 0 END
                  + CASE WHEN base.category_blob LIKE '%' || tk || '%' THEN 25 ELSE 0 END
                  + CASE WHEN base.normalized_description LIKE '%' || tk || '%' THEN 15 ELSE 0 END
                  + CASE WHEN base.normalized_address LIKE '%' || tk || '%' THEN 15 ELSE 0 END
                  + CASE WHEN base.normalized_city LIKE '%' || tk || '%' THEN 12 ELSE 0 END
                ), 0)
                FROM unnest(v_tokens) AS tk
              )
            ELSE 0
          END

        -- === Base engagement scores ===
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
        -- Full query match
        OR base.normalized_name LIKE '%' || v_query || '%'
        OR base.normalized_description LIKE '%' || v_query || '%'
        OR base.normalized_cuisine LIKE '%' || v_query || '%'
        OR base.category_blob LIKE '%' || v_query || '%'
        OR base.normalized_address LIKE '%' || v_query || '%'
        OR base.matched_via_menu
        -- Token-level match: include if ANY token matches ANY field
        OR (
          array_length(v_tokens, 1) > 1
          AND (
            SELECT bool_or(
              base.normalized_name LIKE '%' || tk || '%'
              OR base.normalized_description LIKE '%' || tk || '%'
              OR base.normalized_cuisine LIKE '%' || tk || '%'
              OR base.category_blob LIKE '%' || tk || '%'
              OR base.normalized_address LIKE '%' || tk || '%'
              OR base.normalized_city LIKE '%' || tk || '%'
            )
            FROM unnest(v_tokens) AS tk
          )
        )
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

COMMENT ON FUNCTION public.search_restaurants_catalog(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
) IS
  'Dedicated demo catalog. Returns only the active shared restaurant mapped to the current actor.';

-- Remove the previous actor-wide access only on mutable restaurant identity and
-- menu tables. The replacement policies bind every row to the server mapping.
DROP POLICY IF EXISTS dedicated_commercial_demo_full_access
  ON public.restaurants;
DROP POLICY IF EXISTS dedicated_commercial_demo_full_access
  ON public.menu_items;

DROP POLICY IF EXISTS dedicated_commercial_demo_shared_restaurant_select
  ON public.restaurants;
DROP POLICY IF EXISTS dedicated_commercial_demo_shared_restaurant_update
  ON public.restaurants;
DROP POLICY IF EXISTS block_commercial_demo_restaurant_update
  ON public.restaurants;

CREATE POLICY dedicated_commercial_demo_shared_restaurant_select
ON public.restaurants
FOR SELECT
TO authenticated
USING (
  public.dedicated_demo_can_access_restaurant(id)
);

CREATE POLICY dedicated_commercial_demo_shared_restaurant_update
ON public.restaurants
FOR UPDATE
TO authenticated
USING (
  public.dedicated_demo_can_access_restaurant(id)
)
WITH CHECK (
  public.dedicated_demo_can_access_restaurant(id)
);

CREATE POLICY block_commercial_demo_restaurant_update
ON public.restaurants
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  NOT public.commercial_demo_current_user_is_restricted()
  OR public.dedicated_demo_can_access_restaurant(id)
)
WITH CHECK (
  NOT public.commercial_demo_current_user_is_restricted()
  OR public.dedicated_demo_can_access_restaurant(id)
);

-- Restaurant creation/deletion stays blocked by the inherited restrictive
-- production policies. Menu CRUD is useful in the demo editor and is allowed
-- only when both the previous and next row belong to the mapped restaurant.
DROP POLICY IF EXISTS dedicated_commercial_demo_mapped_menu_select
  ON public.menu_items;
DROP POLICY IF EXISTS dedicated_commercial_demo_mapped_menu_insert
  ON public.menu_items;
DROP POLICY IF EXISTS dedicated_commercial_demo_mapped_menu_update
  ON public.menu_items;
DROP POLICY IF EXISTS dedicated_commercial_demo_mapped_menu_delete
  ON public.menu_items;
DROP POLICY IF EXISTS block_commercial_demo_menu_item_insert
  ON public.menu_items;
DROP POLICY IF EXISTS block_commercial_demo_menu_item_update
  ON public.menu_items;
DROP POLICY IF EXISTS block_commercial_demo_menu_item_delete
  ON public.menu_items;

CREATE POLICY dedicated_commercial_demo_mapped_menu_select
ON public.menu_items
FOR SELECT
TO authenticated
USING (
  public.dedicated_demo_can_access_restaurant(restaurant_id)
);

CREATE POLICY dedicated_commercial_demo_mapped_menu_insert
ON public.menu_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.dedicated_demo_can_access_restaurant(restaurant_id)
);

CREATE POLICY dedicated_commercial_demo_mapped_menu_update
ON public.menu_items
FOR UPDATE
TO authenticated
USING (
  public.dedicated_demo_can_access_restaurant(restaurant_id)
)
WITH CHECK (
  public.dedicated_demo_can_access_restaurant(restaurant_id)
);

CREATE POLICY dedicated_commercial_demo_mapped_menu_delete
ON public.menu_items
FOR DELETE
TO authenticated
USING (
  public.dedicated_demo_can_access_restaurant(restaurant_id)
);

CREATE POLICY block_commercial_demo_menu_item_insert
ON public.menu_items
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  NOT public.commercial_demo_current_user_is_restricted()
  OR public.dedicated_demo_can_access_restaurant(restaurant_id)
);

CREATE POLICY block_commercial_demo_menu_item_update
ON public.menu_items
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  NOT public.commercial_demo_current_user_is_restricted()
  OR public.dedicated_demo_can_access_restaurant(restaurant_id)
)
WITH CHECK (
  NOT public.commercial_demo_current_user_is_restricted()
  OR public.dedicated_demo_can_access_restaurant(restaurant_id)
);

CREATE POLICY block_commercial_demo_menu_item_delete
ON public.menu_items
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  NOT public.commercial_demo_current_user_is_restricted()
  OR public.dedicated_demo_can_access_restaurant(restaurant_id)
);

DO $dedicated_demo_runtime_assertions$
DECLARE
  broad_policy_count integer;
  scoped_policy_count integer; BEGIN
  SELECT count(*)::integer
  INTO broad_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('restaurants', 'menu_items')
    AND policyname = 'dedicated_commercial_demo_full_access';

  IF broad_policy_count <> 0 THEN
    RAISE EXCEPTION
      'Actor-wide restaurant/menu policies remain after dedicated demo scoping';
  END IF;

  SELECT count(*)::integer
  INTO scoped_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (
        tablename = 'restaurants'
        AND policyname IN (
          'dedicated_commercial_demo_shared_restaurant_select',
          'dedicated_commercial_demo_shared_restaurant_update'
        )
      )
      OR (
        tablename = 'menu_items'
        AND policyname IN (
          'dedicated_commercial_demo_mapped_menu_select',
          'dedicated_commercial_demo_mapped_menu_insert',
          'dedicated_commercial_demo_mapped_menu_update',
          'dedicated_commercial_demo_mapped_menu_delete'
        )
      )
    );

  IF scoped_policy_count <> 6 THEN
    RAISE EXCEPTION
      'Expected 6 scoped restaurant/menu policies, found %',
      scoped_policy_count;
  END IF;
END
$dedicated_demo_runtime_assertions$;
