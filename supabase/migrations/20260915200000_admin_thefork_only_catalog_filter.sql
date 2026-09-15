BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $preflight$
BEGIN
  IF to_regclass('public.restaurants') IS NULL
    OR to_regclass('public.marketing_contacts') IS NULL
    OR to_regclass('public.feature_flags') IS NULL
  THEN
    RAISE EXCEPTION 'Required restaurant catalogue relations are missing';
  END IF;

  IF to_regprocedure('public.normalize_search_text(text)') IS NULL
    OR to_regprocedure('public.restaurant_address_city_is_consistent(text,text)') IS NULL
  THEN
    RAISE EXCEPTION 'Required restaurant catalogue helpers are missing';
  END IF;
END;
$preflight$;

-- Positive/safe semantics: TRUE keeps the current catalogue behavior.
-- The admin "The fork" button turns this flag OFF to restrict public reads.
INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'public-restaurants-all-sources',
  'Catalogue public : toutes les sources',
  'Autorise toutes les sources restaurant éligibles. Désactivé, les lectures publiques sont limitées aux restaurants présents dans le catalogue TheFork vérifié.',
  true
)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.restaurant_thefork_catalog (
  source_objectid bigint PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_thefork_catalog_restaurant_id
  ON public.restaurant_thefork_catalog (restaurant_id);

ALTER TABLE public.restaurant_thefork_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_thefork_catalog FROM PUBLIC, anon, authenticated;

-- Resolve the exact 440 verified 2026-07-24 TheFork sources. Most rows still
-- carry their source id directly; four were consolidated onto pre-existing
-- restaurant rows by the original import's normalized name/address dedupe.
WITH source_rows AS (
  SELECT
    c.source_objectid,
    c.display_name,
    COALESCE(
      NULLIF(btrim(c.street_address), ''),
      NULLIF(
        btrim(concat_ws(
          ' ',
          NULLIF(btrim(c.postal_code), ''),
          COALESCE(NULLIF(btrim(c.city), ''), NULLIF(btrim(c.commune), ''), 'Genève')
        )),
        ''
      ),
      'Genève'
    ) AS public_address
  FROM public.marketing_contacts AS c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND c.source_objectid BETWEEN 2600000001 AND 2600000520
    AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
    AND c.branch = 'Restaurant référencé sur TheFork'
    AND NULLIF(btrim(c.display_name), '') IS NOT NULL
), resolved AS (
  SELECT
    source.source_objectid,
    COALESCE(direct_match.id, dedup_match.id) AS restaurant_id
  FROM source_rows AS source
  LEFT JOIN LATERAL (
    SELECT restaurant.id
    FROM public.restaurants AS restaurant
    WHERE restaurant.is_directory_listing IS TRUE
      AND restaurant.directory_source = 'commercial_prospect_catalog'
      AND restaurant.directory_source_reference = source.source_objectid::text
    ORDER BY
      restaurant.directory_public_name_verified DESC,
      restaurant.is_active DESC,
      restaurant.id
    LIMIT 1
  ) AS direct_match ON TRUE
  LEFT JOIN LATERAL (
    SELECT restaurant.id
    FROM public.restaurants AS restaurant
    WHERE direct_match.id IS NULL
      AND public.normalize_search_text(restaurant.name) = public.normalize_search_text(source.display_name)
      AND public.normalize_search_text(COALESCE(restaurant.address, '')) = public.normalize_search_text(source.public_address)
    ORDER BY
      restaurant.is_directory_listing DESC,
      restaurant.directory_public_name_verified DESC,
      restaurant.is_active DESC,
      restaurant.id
    LIMIT 1
  ) AS dedup_match ON direct_match.id IS NULL
)
INSERT INTO public.restaurant_thefork_catalog (source_objectid, restaurant_id)
SELECT source_objectid, restaurant_id
FROM resolved
WHERE restaurant_id IS NOT NULL
ON CONFLICT (source_objectid) DO UPDATE
SET restaurant_id = EXCLUDED.restaurant_id;

CREATE OR REPLACE FUNCTION public.public_restaurant_all_sources_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT flag.is_active
      FROM public.feature_flags AS flag
      WHERE flag.name = 'public-restaurants-all-sources'
      LIMIT 1
    ),
    true
  );
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_is_thefork_catalog_member(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_thefork_catalog AS membership
    WHERE membership.restaurant_id = p_restaurant_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_source_is_publicly_displayable(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.public_restaurant_all_sources_enabled()
    OR public.restaurant_is_thefork_catalog_member(p_restaurant_id);
$function$;

REVOKE ALL ON FUNCTION public.public_restaurant_all_sources_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_is_thefork_catalog_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_source_is_publicly_displayable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_restaurant_all_sources_enabled() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_is_thefork_catalog_member(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_source_is_publicly_displayable(uuid) TO anon, authenticated, service_role;

-- Public SELECT policies are permissive/ORed. Apply the source gate to every
-- broad production read path while leaving owner/admin/demo-specific policies
-- unchanged. Transactional server helpers remain untouched.
DROP POLICY IF EXISTS restaurants_public_select ON public.restaurants;
CREATE POLICY restaurants_public_select
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_active IS TRUE
  AND is_demo IS FALSE
  AND lower(COALESCE(status, '')) = 'active'
  AND public.restaurant_address_city_is_consistent(address, city)
  AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
  AND public.restaurant_source_is_publicly_displayable(id)
);

DROP POLICY IF EXISTS production_hide_demo_restaurants ON public.restaurants;
CREATE POLICY production_hide_demo_restaurants
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_demo IS FALSE
  AND public.restaurant_address_city_is_consistent(address, city)
  AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
  AND public.restaurant_source_is_publicly_displayable(id)
);

DROP POLICY IF EXISTS scope_production_restaurants_for_commercial_demo_accounts ON public.restaurants;
CREATE POLICY scope_production_restaurants_for_commercial_demo_accounts
ON public.restaurants
FOR SELECT
TO authenticated
USING (
  (
    NOT public.commercial_demo_current_user_is_restricted()
    AND public.restaurant_address_city_is_consistent(address, city)
    AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
    AND public.restaurant_source_is_publicly_displayable(id)
  )
  OR id = public.commercial_demo_current_restaurant_id()
);

-- Keep the current timeout-safe RPC contract and implementation. The only
-- catalogue change is the indexed source-membership predicate in base_restaurants.
CREATE OR REPLACE FUNCTION public.search_restaurants_catalog_page(
  p_query text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cuisine text DEFAULT NULL,
  p_price_range integer DEFAULT NULL,
  p_delivery_only boolean DEFAULT false,
  p_min_rating numeric DEFAULT 0,
  p_sort_by text DEFAULT 'pertinence',
  p_sort_direction text DEFAULT NULL,
  p_limit integer DEFAULT 54,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(items jsonb, total_count bigint, next_offset integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_query text := public.normalize_search_text(left(p_query, 160));
  v_city text := public.normalize_search_text(left(p_city, 120));
  v_cuisine text := public.normalize_search_text(left(p_cuisine, 120));
  v_tokens text[] := ARRAY[]::text[];
  v_ts_query tsquery := NULL;
  v_prefix_ts_query tsquery := NULL;
  v_sort_by text := CASE
    WHEN public.normalize_search_text(left(p_sort_by, 32)) IN (
      'pertinence', 'note', 'promotion', 'prix', 'popularite', 'nouveaux',
      'mieux_notes_mois', 'plus_reserves_mois'
    ) THEN public.normalize_search_text(left(p_sort_by, 32))
    ELSE 'pertinence'
  END;
  v_sort_direction text := CASE
    WHEN lower(COALESCE(left(p_sort_direction, 8), '')) IN ('asc', 'desc')
      THEN lower(left(p_sort_direction, 8))
    WHEN public.normalize_search_text(left(p_sort_by, 32)) = 'prix' THEN 'asc'
    ELSE 'desc'
  END;
  v_page_limit integer := LEAST(GREATEST(COALESCE(p_limit, 54), 1), 54);
  v_page_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 1000000);
  v_random_seed text := to_char(current_date, 'YYYY-MM-DD');
  v_all_sources_enabled boolean := public.public_restaurant_all_sources_enabled();
BEGIN
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;

  IF v_query <> '' THEN
    v_tokens := array_remove(
      string_to_array(replace(v_query, '-', ' '), ' '),
      ''
    );
    v_ts_query := websearch_to_tsquery('french', left(COALESCE(p_query, ''), 160));

    SELECT to_tsquery(
      'french',
      string_agg(token || ':*', ' | ' ORDER BY token)
    )
    INTO v_prefix_ts_query
    FROM (
      SELECT DISTINCT token
      FROM unnest(v_tokens) AS token
      WHERE token ~ '^[a-z0-9]+$'
    ) AS safe_tokens;
  END IF;

  RETURN QUERY
  WITH base_restaurants AS MATERIALIZED (
    SELECT
      r.id,
      r.name,
      r.description,
      r.cuisine_type,
      COALESCE(r.rating, 0)::numeric AS rating,
      COALESCE(r.review_count, 0)::integer AS review_count,
      COALESCE(r.price_range, 2)::integer AS price_range,
      COALESCE(r.delivery_fee, 0)::numeric AS delivery_fee,
      r.image_url,
      r.address,
      r.city,
      COALESCE(r.delivery_available, false) AS delivery_available,
      r.created_at,
      r.latitude,
      r.longitude,
      r.search_vector
    FROM public.restaurants AS r
    WHERE r.is_active IS TRUE
      AND r.is_demo IS FALSE
      AND lower(COALESCE(r.status, '')) = 'active'
      AND public.restaurant_address_city_is_consistent(r.address, r.city)
      AND (r.is_directory_listing IS FALSE OR r.directory_public_name_verified IS TRUE)
      AND (
        v_all_sources_enabled
        OR EXISTS (
          SELECT 1
          FROM public.restaurant_thefork_catalog AS membership
          WHERE membership.restaurant_id = r.id
        )
      )
      AND (v_city = '' OR public.normalize_search_text(r.city) LIKE '%' || v_city || '%')
      AND (COALESCE(p_price_range, 0) <= 0 OR r.price_range = p_price_range)
      AND (COALESCE(p_delivery_only, false) IS FALSE OR COALESCE(r.delivery_available, false) IS TRUE)
      AND COALESCE(r.rating, 0) >= GREATEST(COALESCE(p_min_rating, 0), 0)
  ),
  restaurant_categories AS MATERIALIZED (
    SELECT
      rc.restaurant_id,
      array_remove(array_agg(DISTINCT cuisine.name), NULL) AS category_names,
      array_remove(
        array_agg(DISTINCT COALESCE(cuisine.slug, public.normalize_search_text(cuisine.name))),
        NULL
      ) AS category_slugs,
      public.normalize_search_text(
        COALESCE(
          string_agg(
            DISTINCT concat_ws(
              ' ',
              cuisine.name,
              cuisine.slug,
              array_to_string(cuisine.keywords, ' ')
            ),
            ' '
          ),
          ''
        )
      ) AS category_blob
    FROM public.restaurant_cuisines AS rc
    JOIN base_restaurants AS base ON base.id = rc.restaurant_id
    JOIN public.cuisines AS cuisine ON cuisine.id = rc.cuisine_id
    GROUP BY rc.restaurant_id
  ),
  menu_matches AS MATERIALIZED (
    SELECT menu_item.restaurant_id
    FROM public.menu_items AS menu_item
    JOIN base_restaurants AS base ON base.id = menu_item.restaurant_id
    WHERE menu_item.is_available IS TRUE
      AND v_query <> ''
      AND (
        public.normalize_search_text(
          concat_ws(' ', menu_item.name, menu_item.description, menu_item.category)
        ) LIKE '%' || v_query || '%'
        OR EXISTS (
          SELECT 1
          FROM unnest(v_tokens) AS token(value)
          WHERE public.normalize_search_text(
            concat_ws(' ', menu_item.name, menu_item.description, menu_item.category)
          ) LIKE '%' || token.value || '%'
        )
      )
    GROUP BY menu_item.restaurant_id
  ),
  monthly_reservations AS (
    SELECT
      reservation.restaurant_id,
      count(*)::integer AS monthly_reservations
    FROM public.reservations AS reservation
    WHERE reservation.date >= date_trunc('month', now())::date
      AND lower(COALESCE(reservation.status, '')) NOT IN ('cancelled', 'refused')
    GROUP BY reservation.restaurant_id
  ),
  monthly_orders AS (
    SELECT
      customer_order.restaurant_id,
      count(*)::integer AS monthly_orders
    FROM public.orders AS customer_order
    WHERE customer_order.created_at >= date_trunc('month', now())
      AND lower(COALESCE(customer_order.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    GROUP BY customer_order.restaurant_id
  ),
  anti_waste_scores AS (
    SELECT
      offer.restaurant_id,
      max(
        CASE
          WHEN COALESCE(offer.original_price, 0) > 0 THEN round(
            (((offer.original_price - COALESCE(offer.discounted_price, 0)) / offer.original_price) * 100)::numeric,
            2
          )
          ELSE 0
        END
      )::numeric AS score
    FROM public.anti_waste_offers AS offer
    WHERE offer.is_active IS TRUE
      AND offer.available_date >= current_date
    GROUP BY offer.restaurant_id
  ),
  formula_scores AS (
    SELECT
      formula.restaurant_id,
      max(COALESCE(formula.discount_percent, 0)::numeric) AS score
    FROM public.meal_formulas AS formula
    WHERE formula.is_active IS TRUE
    GROUP BY formula.restaurant_id
  ),
  promotion_scores AS (
    SELECT
      source.restaurant_id,
      max(source.score)::numeric AS promotion_score
    FROM (
      SELECT restaurant_id, score FROM anti_waste_scores
      UNION ALL
      SELECT restaurant_id, score FROM formula_scores
    ) AS source
    GROUP BY source.restaurant_id
  ),
  enriched AS MATERIALIZED (
    SELECT
      base.id,
      base.name,
      base.description,
      base.cuisine_type,
      base.rating,
      base.review_count,
      base.price_range,
      base.delivery_fee,
      base.image_url,
      base.address,
      base.city,
      base.delivery_available,
      base.created_at,
      base.latitude,
      base.longitude,
      base.search_vector,
      COALESCE(categories.category_names, ARRAY[]::text[]) AS category_names,
      COALESCE(categories.category_slugs, ARRAY[]::text[]) AS category_slugs,
      COALESCE(categories.category_blob, '') AS category_blob,
      COALESCE(reservation_stats.monthly_reservations, 0)::integer AS monthly_reservations,
      COALESCE(order_stats.monthly_orders, 0)::integer AS monthly_orders,
      COALESCE(promotions.promotion_score, 0)::numeric AS promotion_score,
      (menu_match.restaurant_id IS NOT NULL) AS matched_via_menu
    FROM base_restaurants AS base
    LEFT JOIN restaurant_categories AS categories ON categories.restaurant_id = base.id
    LEFT JOIN monthly_reservations AS reservation_stats ON reservation_stats.restaurant_id = base.id
    LEFT JOIN monthly_orders AS order_stats ON order_stats.restaurant_id = base.id
    LEFT JOIN promotion_scores AS promotions ON promotions.restaurant_id = base.id
    LEFT JOIN menu_matches AS menu_match ON menu_match.restaurant_id = base.id
  ),
  filtered AS MATERIALIZED (
    SELECT
      enriched.*,
      (
        CASE
          WHEN v_query = '' THEN 0
          WHEN public.normalize_search_text(enriched.name) = v_query THEN 220
          WHEN public.normalize_search_text(enriched.name) LIKE v_query || '%' THEN 170
          WHEN public.normalize_search_text(enriched.name) LIKE '%' || v_query || '%' THEN 120
          ELSE 0
        END
        + CASE
            WHEN v_query <> ''
              AND public.normalize_search_text(enriched.cuisine_type) LIKE '%' || v_query || '%'
              THEN 80
            ELSE 0
          END
        + CASE
            WHEN v_query <> '' AND enriched.category_blob LIKE '%' || v_query || '%' THEN 80
            ELSE 0
          END
        + CASE
            WHEN v_query <> ''
              AND public.normalize_search_text(enriched.description) LIKE '%' || v_query || '%'
              THEN 50
            ELSE 0
          END
        + CASE
            WHEN v_query <> ''
              AND public.normalize_search_text(enriched.address) LIKE '%' || v_query || '%'
              THEN 45
            ELSE 0
          END
        + CASE
            WHEN v_query <> ''
              AND public.normalize_search_text(enriched.city) LIKE '%' || v_query || '%'
              THEN 40
            ELSE 0
          END
        + CASE WHEN enriched.matched_via_menu THEN 60 ELSE 0 END
        + CASE
            WHEN v_query = '' THEN (enriched.rating * 18) + (enriched.review_count * 0.9)
            ELSE COALESCE(ts_rank_cd(enriched.search_vector, v_ts_query), 0) * 100
          END
        + (enriched.monthly_reservations * 4)
        + (enriched.monthly_orders * 3)
        + (enriched.promotion_score * 1.4)
        + CASE WHEN enriched.delivery_available THEN 6 ELSE 0 END
      )::numeric AS relevance_score
    FROM enriched
    WHERE (
        v_cuisine = ''
        OR public.normalize_search_text(enriched.cuisine_type) LIKE '%' || v_cuisine || '%'
        OR enriched.category_blob LIKE '%' || v_cuisine || '%'
      )
      AND (
        v_query = ''
        OR (v_ts_query IS NOT NULL AND enriched.search_vector @@ v_ts_query)
        OR (v_prefix_ts_query IS NOT NULL AND enriched.search_vector @@ v_prefix_ts_query)
        OR public.normalize_search_text(enriched.name) LIKE '%' || v_query || '%'
        OR public.normalize_search_text(enriched.description) LIKE '%' || v_query || '%'
        OR public.normalize_search_text(enriched.cuisine_type) LIKE '%' || v_query || '%'
        OR enriched.category_blob LIKE '%' || v_query || '%'
        OR public.normalize_search_text(enriched.address) LIKE '%' || v_query || '%'
        OR public.normalize_search_text(enriched.city) LIKE '%' || v_query || '%'
        OR enriched.matched_via_menu
        OR EXISTS (
          SELECT 1
          FROM unnest(v_tokens) AS token(value)
          WHERE public.normalize_search_text(enriched.name) LIKE '%' || token.value || '%'
             OR public.normalize_search_text(enriched.description) LIKE '%' || token.value || '%'
             OR public.normalize_search_text(enriched.cuisine_type) LIKE '%' || token.value || '%'
             OR enriched.category_blob LIKE '%' || token.value || '%'
             OR public.normalize_search_text(enriched.address) LIKE '%' || token.value || '%'
             OR public.normalize_search_text(enriched.city) LIKE '%' || token.value || '%'
        )
      )
  ),
  page_rows AS MATERIALIZED (
    SELECT filtered.*
    FROM filtered
    ORDER BY
      CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
      CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,
      CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'desc' THEN filtered.promotion_score END DESC,
      CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'asc' THEN filtered.promotion_score END ASC,
      CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'asc' THEN filtered.price_range END ASC,
      CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'desc' THEN filtered.price_range END DESC,
      CASE
        WHEN v_sort_by = 'popularite' AND v_sort_direction = 'desc'
          THEN filtered.review_count + filtered.monthly_reservations * 4 + filtered.monthly_orders * 3
      END DESC,
      CASE
        WHEN v_sort_by = 'popularite' AND v_sort_direction = 'asc'
          THEN filtered.review_count + filtered.monthly_reservations * 4 + filtered.monthly_orders * 3
      END ASC,
      CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'desc' THEN filtered.created_at END DESC,
      CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'asc' THEN filtered.created_at END ASC,
      CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
      CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,
      CASE
        WHEN v_sort_by IN ('mieux_notes_mois', 'plus_reserves_mois') AND v_sort_direction = 'desc'
          THEN filtered.monthly_reservations
      END DESC,
      CASE
        WHEN v_sort_by IN ('mieux_notes_mois', 'plus_reserves_mois') AND v_sort_direction = 'asc'
          THEN filtered.monthly_reservations
      END ASC,
      CASE
        WHEN v_sort_by = 'pertinence' AND v_query <> '' AND v_sort_direction = 'desc'
          THEN filtered.relevance_score
      END DESC,
      CASE
        WHEN v_sort_by = 'pertinence' AND v_query <> '' AND v_sort_direction = 'asc'
          THEN filtered.relevance_score
      END ASC,
      CASE
        WHEN v_sort_by = 'pertinence' AND v_query = ''
          THEN md5(v_random_seed || ':' || filtered.id::text)
      END ASC,
      filtered.rating DESC,
      filtered.review_count DESC,
      md5(v_random_seed || ':' || filtered.id::text) ASC,
      filtered.id ASC
    LIMIT v_page_limit
    OFFSET v_page_offset
  ),
  summary AS (
    SELECT count(*)::bigint AS row_count FROM filtered
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(page_rows) - 'search_vector' - 'category_blob'
          ORDER BY
            CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'desc' THEN page_rows.rating END DESC,
            CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'asc' THEN page_rows.rating END ASC,
            CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'desc' THEN page_rows.promotion_score END DESC,
            CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'asc' THEN page_rows.promotion_score END ASC,
            CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'asc' THEN page_rows.price_range END ASC,
            CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'desc' THEN page_rows.price_range END DESC,
            CASE
              WHEN v_sort_by = 'popularite' AND v_sort_direction = 'desc'
                THEN page_rows.review_count + page_rows.monthly_reservations * 4 + page_rows.monthly_orders * 3
            END DESC,
            CASE
              WHEN v_sort_by = 'popularite' AND v_sort_direction = 'asc'
                THEN page_rows.review_count + page_rows.monthly_reservations * 4 + page_rows.monthly_orders * 3
            END ASC,
            CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'desc' THEN page_rows.created_at END DESC,
            CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'asc' THEN page_rows.created_at END ASC,
            CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN page_rows.rating END DESC,
            CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN page_rows.rating END ASC,
            CASE
              WHEN v_sort_by IN ('mieux_notes_mois', 'plus_reserves_mois') AND v_sort_direction = 'desc'
                THEN page_rows.monthly_reservations
            END DESC,
            CASE
              WHEN v_sort_by IN ('mieux_notes_mois', 'plus_reserves_mois') AND v_sort_direction = 'asc'
                THEN page_rows.monthly_reservations
            END ASC,
            CASE
              WHEN v_sort_by = 'pertinence' AND v_query <> '' AND v_sort_direction = 'desc'
                THEN page_rows.relevance_score
            END DESC,
            CASE
              WHEN v_sort_by = 'pertinence' AND v_query <> '' AND v_sort_direction = 'asc'
                THEN page_rows.relevance_score
            END ASC,
            CASE
              WHEN v_sort_by = 'pertinence' AND v_query = ''
                THEN md5(v_random_seed || ':' || page_rows.id::text)
            END ASC,
            page_rows.rating DESC,
            page_rows.review_count DESC,
            md5(v_random_seed || ':' || page_rows.id::text) ASC,
            page_rows.id ASC
        )
        FROM page_rows
      ),
      '[]'::jsonb
    ),
    summary.row_count,
    CASE
      WHEN v_page_offset + v_page_limit < summary.row_count
        THEN v_page_offset + v_page_limit
      ELSE NULL
    END::integer
  FROM summary;
END;
$function$;

COMMENT ON FUNCTION public.search_restaurants_catalog_page(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
) IS 'Timeout-safe verified public catalogue pagination with optional indexed TheFork-only source filtering.';

DO $postflight$
DECLARE
  v_source_count integer;
  v_mapped_count integer;
  v_reserved_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_source_count
  FROM public.marketing_contacts AS c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND c.source_objectid BETWEEN 2600000001 AND 2600000520
    AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
    AND c.branch = 'Restaurant référencé sur TheFork'
    AND NULLIF(btrim(c.display_name), '') IS NOT NULL;

  IF v_source_count <> 440 THEN
    RAISE EXCEPTION 'Expected 440 verified TheFork sources, found %', v_source_count;
  END IF;

  SELECT count(*)::integer
  INTO v_mapped_count
  FROM public.restaurant_thefork_catalog AS membership
  WHERE membership.source_objectid BETWEEN 2600000001 AND 2600000520
    AND membership.source_objectid NOT BETWEEN 2600000121 AND 2600000200;

  IF v_mapped_count <> 440 THEN
    RAISE EXCEPTION 'Expected 440 mapped TheFork sources, found %', v_mapped_count;
  END IF;

  SELECT count(*)::integer
  INTO v_reserved_count
  FROM public.restaurant_thefork_catalog AS membership
  WHERE membership.source_objectid BETWEEN 2600000121 AND 2600000200;

  IF v_reserved_count <> 0 THEN
    RAISE EXCEPTION 'Reserved TheFork placeholder range must remain unmapped; found % rows', v_reserved_count;
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;
