BEGIN;

-- The public catalogue must not hide an otherwise verified restaurant while its
-- photo is still being enriched. RestaurantCard already renders a local TOK
-- placeholder until a real image is available. Keep the existing image-backed
-- index untouched for image-specific workloads and add a visibility index for
-- the broader verified catalogue.
CREATE INDEX IF NOT EXISTS idx_restaurants_public_catalog_visible_city_trgm
  ON public.restaurants
  USING gin (public.normalize_search_text(city) gin_trgm_ops)
  WHERE is_active IS TRUE
    AND is_demo IS FALSE
    AND lower(COALESCE(status, '')) = 'active'
    AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE);

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
BEGIN
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;

  IF v_query <> '' THEN
    v_tokens := array_remove(string_to_array(v_query, ' '), '');
  END IF;

  RETURN QUERY
  WITH candidate_restaurants AS MATERIALIZED (
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
      public.normalize_search_text(r.name) AS normalized_name,
      public.normalize_search_text(r.description) AS normalized_description,
      public.normalize_search_text(r.cuisine_type) AS normalized_cuisine,
      public.normalize_search_text(r.city) AS normalized_city,
      public.normalize_search_text(r.address) AS normalized_address
    FROM public.restaurants AS r
    WHERE r.is_active IS TRUE
      AND r.is_demo IS FALSE
      AND lower(COALESCE(r.status, '')) = 'active'
      AND public.restaurant_address_city_is_consistent(r.address, r.city)
      AND (r.is_directory_listing IS FALSE OR r.directory_public_name_verified IS TRUE)
      AND (v_city = '' OR public.normalize_search_text(r.city) LIKE '%' || v_city || '%')
      AND (COALESCE(p_price_range, 0) <= 0 OR r.price_range = p_price_range)
      AND (COALESCE(p_delivery_only, false) IS FALSE OR COALESCE(r.delivery_available, false) IS TRUE)
      AND COALESCE(r.rating, 0) >= GREATEST(COALESCE(p_min_rating, 0), 0)
  ),
  restaurant_categories AS (
    SELECT
      rc.restaurant_id,
      array_remove(array_agg(DISTINCT cuisine.name), NULL) AS category_names,
      array_remove(array_agg(DISTINCT COALESCE(cuisine.slug, public.normalize_search_text(cuisine.name))), NULL) AS category_slugs,
      public.normalize_search_text(
        COALESCE(string_agg(DISTINCT cuisine.name, ' '), '') || ' ' ||
        COALESCE(string_agg(DISTINCT cuisine.slug, ' '), '') || ' ' ||
        COALESCE(string_agg(DISTINCT array_to_string(cuisine.keywords, ' '), ' '), '')
      ) AS category_blob
    FROM public.restaurant_cuisines AS rc
    JOIN candidate_restaurants AS candidate ON candidate.id = rc.restaurant_id
    JOIN public.cuisines AS cuisine ON cuisine.id = rc.cuisine_id
    GROUP BY rc.restaurant_id
  ),
  enriched AS MATERIALIZED (
    SELECT
      candidate.*,
      COALESCE(categories.category_names, ARRAY[]::text[]) AS category_names,
      COALESCE(categories.category_slugs, ARRAY[]::text[]) AS category_slugs,
      COALESCE(categories.category_blob, '') AS category_blob,
      COALESCE(monthly.monthly_reservations, 0)::integer AS monthly_reservations,
      COALESCE(monthly.monthly_orders, 0)::integer AS monthly_orders,
      GREATEST(COALESCE(promotions.anti_waste_score, 0), COALESCE(promotions.formula_score, 0))::numeric AS promotion_score,
      COALESCE(menu.matched_via_menu, false) AS matched_via_menu
    FROM candidate_restaurants AS candidate
    LEFT JOIN restaurant_categories AS categories ON categories.restaurant_id = candidate.id
    LEFT JOIN LATERAL (
      SELECT
        (SELECT count(*) FROM public.reservations AS reservation
          WHERE reservation.restaurant_id = candidate.id
            AND reservation.date >= date_trunc('month', now())::date
            AND lower(COALESCE(reservation.status, '')) NOT IN ('cancelled', 'refused')) AS monthly_reservations,
        (SELECT count(*) FROM public.orders AS customer_order
          WHERE customer_order.restaurant_id = candidate.id
            AND customer_order.created_at >= date_trunc('month', now())
            AND lower(COALESCE(customer_order.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')) AS monthly_orders
    ) AS monthly ON true
    LEFT JOIN LATERAL (
      SELECT
        (SELECT max(CASE WHEN COALESCE(offer.original_price, 0) > 0
          THEN round((((offer.original_price - COALESCE(offer.discounted_price, 0)) / offer.original_price) * 100)::numeric, 2)
          ELSE 0 END)
          FROM public.anti_waste_offers AS offer
          WHERE offer.restaurant_id = candidate.id
            AND offer.is_active IS TRUE
            AND offer.available_date >= current_date) AS anti_waste_score,
        (SELECT max(COALESCE(formula.discount_percent, 0)::numeric)
          FROM public.meal_formulas AS formula
          WHERE formula.restaurant_id = candidate.id
            AND formula.is_active IS TRUE) AS formula_score
    ) AS promotions ON true
    LEFT JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1
        FROM public.menu_items AS menu_item
        WHERE menu_item.restaurant_id = candidate.id
          AND menu_item.is_available IS TRUE
          AND v_query <> ''
          AND (
            public.normalize_search_text(menu_item.name) LIKE '%' || v_query || '%'
            OR public.normalize_search_text(menu_item.description) LIKE '%' || v_query || '%'
            OR public.normalize_search_text(menu_item.category) LIKE '%' || v_query || '%'
            OR EXISTS (
              SELECT 1 FROM unnest(v_tokens) AS token(value)
              WHERE public.normalize_search_text(menu_item.name) LIKE '%' || token.value || '%'
                 OR public.normalize_search_text(menu_item.description) LIKE '%' || token.value || '%'
            )
          )
      ) AS matched_via_menu
    ) AS menu ON true
  ),
  filtered AS MATERIALIZED (
    SELECT
      enriched.*,
      (
        CASE
          WHEN v_query = '' THEN 0
          WHEN enriched.normalized_name = v_query THEN 220
          WHEN enriched.normalized_name LIKE v_query || '%' THEN 170
          WHEN enriched.normalized_name LIKE '%' || v_query || '%' THEN 120
          ELSE 0
        END
        + CASE WHEN v_query <> '' AND enriched.normalized_cuisine LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND enriched.category_blob LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND enriched.normalized_description LIKE '%' || v_query || '%' THEN 50 ELSE 0 END
        + CASE WHEN v_query <> '' AND enriched.normalized_address LIKE '%' || v_query || '%' THEN 45 ELSE 0 END
        + CASE WHEN v_query <> '' AND enriched.normalized_city LIKE '%' || v_query || '%' THEN 40 ELSE 0 END
        + CASE WHEN enriched.matched_via_menu THEN 60 ELSE 0 END
        + CASE WHEN v_query = '' THEN (enriched.rating * 18) + (enriched.review_count * 0.9) ELSE 0 END
        + (enriched.monthly_reservations * 4)
        + (enriched.monthly_orders * 3)
        + (enriched.promotion_score * 1.4)
        + CASE WHEN enriched.delivery_available THEN 6 ELSE 0 END
      )::numeric AS relevance_score
    FROM enriched
    WHERE (v_cuisine = '' OR enriched.normalized_cuisine LIKE '%' || v_cuisine || '%' OR enriched.category_blob LIKE '%' || v_cuisine || '%')
      AND (
        v_query = ''
        OR enriched.normalized_name LIKE '%' || v_query || '%'
        OR enriched.normalized_description LIKE '%' || v_query || '%'
        OR enriched.normalized_cuisine LIKE '%' || v_query || '%'
        OR enriched.category_blob LIKE '%' || v_query || '%'
        OR enriched.normalized_address LIKE '%' || v_query || '%'
        OR enriched.matched_via_menu
        OR EXISTS (
          SELECT 1 FROM unnest(v_tokens) AS token(value)
          WHERE enriched.normalized_name LIKE '%' || token.value || '%'
             OR enriched.normalized_description LIKE '%' || token.value || '%'
             OR enriched.normalized_cuisine LIKE '%' || token.value || '%'
             OR enriched.category_blob LIKE '%' || token.value || '%'
             OR enriched.normalized_address LIKE '%' || token.value || '%'
             OR enriched.normalized_city LIKE '%' || token.value || '%'
        )
      )
  ),
  ordered AS MATERIALIZED (
    SELECT
      filtered.id, filtered.name, filtered.description, filtered.cuisine_type,
      filtered.rating, filtered.review_count, filtered.price_range, filtered.delivery_fee,
      filtered.image_url, filtered.address, filtered.city, filtered.delivery_available,
      filtered.created_at, filtered.category_names, filtered.category_slugs,
      filtered.matched_via_menu, filtered.monthly_reservations, filtered.monthly_orders,
      filtered.promotion_score, filtered.relevance_score, filtered.latitude, filtered.longitude,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
          CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,
          CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'desc' THEN filtered.promotion_score END DESC,
          CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'asc' THEN filtered.promotion_score END ASC,
          CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'asc' THEN filtered.price_range END ASC,
          CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'desc' THEN filtered.price_range END DESC,
          CASE WHEN v_sort_by = 'popularite' AND v_sort_direction = 'desc' THEN filtered.review_count + filtered.monthly_reservations * 4 + filtered.monthly_orders * 3 END DESC,
          CASE WHEN v_sort_by = 'popularite' AND v_sort_direction = 'asc' THEN filtered.review_count + filtered.monthly_reservations * 4 + filtered.monthly_orders * 3 END ASC,
          CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'desc' THEN filtered.created_at END DESC,
          CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'asc' THEN filtered.created_at END ASC,
          CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
          CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,
          CASE WHEN v_sort_by IN ('mieux_notes_mois', 'plus_reserves_mois') AND v_sort_direction = 'desc' THEN filtered.monthly_reservations END DESC,
          CASE WHEN v_sort_by IN ('mieux_notes_mois', 'plus_reserves_mois') AND v_sort_direction = 'asc' THEN filtered.monthly_reservations END ASC,
          CASE WHEN v_sort_by = 'pertinence' AND v_query <> '' AND v_sort_direction = 'desc' THEN filtered.relevance_score END DESC,
          CASE WHEN v_sort_by = 'pertinence' AND v_query <> '' AND v_sort_direction = 'asc' THEN filtered.relevance_score END ASC,
          CASE WHEN v_sort_by = 'pertinence' AND v_query = '' THEN md5(v_random_seed || ':' || filtered.id::text) END ASC,
          filtered.rating DESC,
          filtered.review_count DESC,
          md5(v_random_seed || ':' || filtered.id::text) ASC,
          filtered.id ASC
      ) AS catalog_position
    FROM filtered
  ),
  page_rows AS (
    SELECT ordered.* FROM ordered
    ORDER BY ordered.catalog_position
    LIMIT v_page_limit OFFSET v_page_offset
  ),
  summary AS (SELECT count(*)::bigint AS row_count FROM ordered)
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) - 'catalog_position' ORDER BY page_rows.catalog_position) FROM page_rows), '[]'::jsonb),
    summary.row_count,
    CASE WHEN v_page_offset + v_page_limit < summary.row_count THEN v_page_offset + v_page_limit ELSE NULL END::integer
  FROM summary;
END;
$function$;

COMMENT ON FUNCTION public.search_restaurants_catalog_page(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
) IS 'Verified public catalogue pagination. Restaurants remain visible with the TOK placeholder while real images are enriched.';

NOTIFY pgrst, 'reload schema';
COMMIT;
