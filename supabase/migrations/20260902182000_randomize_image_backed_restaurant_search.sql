-- Keep public restaurant search image-backed and non-alphabetical while preserving
-- deterministic pagination. The daily seed is stable for every page fetched on
-- the same day, so infinite scrolling cannot reshuffle between offsets.
BEGIN;

DO $migration$
BEGIN
  IF to_regprocedure(
    'public.search_restaurants_catalog_unguarded(text,text,text,integer,boolean,numeric,text,text,integer,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required function search_restaurants_catalog_unguarded is missing';
  END IF;

  IF to_regprocedure('public.restaurant_is_publicly_visible(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Required function restaurant_is_publicly_visible is missing';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.search_restaurants_catalog_page(
  p_query text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_cuisine text DEFAULT NULL::text,
  p_price_range integer DEFAULT NULL::integer,
  p_delivery_only boolean DEFAULT false,
  p_min_rating numeric DEFAULT 0,
  p_sort_by text DEFAULT 'pertinence'::text,
  p_sort_direction text DEFAULT NULL::text,
  p_limit integer DEFAULT 54,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  items jsonb,
  total_count bigint,
  next_offset integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH controls AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 54), 1), 54)::integer AS page_limit,
      LEAST(GREATEST(COALESCE(p_offset, 0), 0), 1000000)::integer AS page_offset,
      CASE
        WHEN public.normalize_search_text(p_sort_by) IN (
          'pertinence',
          'note',
          'promotion',
          'prix',
          'popularite',
          'nouveaux',
          'mieux_notes_mois',
          'plus_reserves_mois'
        ) THEN public.normalize_search_text(p_sort_by)
        ELSE 'pertinence'
      END AS sort_by,
      CASE
        WHEN lower(COALESCE(p_sort_direction, '')) IN ('asc', 'desc')
          THEN lower(p_sort_direction)
        WHEN public.normalize_search_text(p_sort_by) = 'prix'
          THEN 'asc'
        ELSE 'desc'
      END AS sort_direction,
      NULLIF(btrim(COALESCE(p_query, '')), '') IS NOT NULL AS has_query,
      to_char(current_date, 'YYYY-MM-DD') AS random_seed
  ),
  visible AS MATERIALIZED (
    SELECT result.*
    FROM public.search_restaurants_catalog_unguarded(
      left(p_query, 160),
      left(p_city, 120),
      left(p_cuisine, 120),
      p_price_range,
      p_delivery_only,
      p_min_rating,
      left(p_sort_by, 32),
      left(p_sort_direction, 8),
      2147483647,
      0
    ) AS result
    WHERE public.restaurant_is_publicly_visible(result.id)
      AND NULLIF(btrim(result.image_url), '') IS NOT NULL
  ),
  ordered AS MATERIALIZED (
    SELECT
      visible.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN controls.sort_by = 'note' AND controls.sort_direction = 'desc' THEN visible.rating END DESC,
          CASE WHEN controls.sort_by = 'note' AND controls.sort_direction = 'asc' THEN visible.rating END ASC,
          CASE WHEN controls.sort_by = 'promotion' AND controls.sort_direction = 'desc' THEN visible.promotion_score END DESC,
          CASE WHEN controls.sort_by = 'promotion' AND controls.sort_direction = 'asc' THEN visible.promotion_score END ASC,
          CASE WHEN controls.sort_by = 'prix' AND controls.sort_direction = 'asc' THEN visible.price_range END ASC,
          CASE WHEN controls.sort_by = 'prix' AND controls.sort_direction = 'desc' THEN visible.price_range END DESC,
          CASE
            WHEN controls.sort_by = 'popularite' AND controls.sort_direction = 'desc'
              THEN visible.review_count + (visible.monthly_reservations * 4) + (visible.monthly_orders * 3)
          END DESC,
          CASE
            WHEN controls.sort_by = 'popularite' AND controls.sort_direction = 'asc'
              THEN visible.review_count + (visible.monthly_reservations * 4) + (visible.monthly_orders * 3)
          END ASC,
          CASE WHEN controls.sort_by = 'nouveaux' AND controls.sort_direction = 'desc' THEN visible.created_at END DESC,
          CASE WHEN controls.sort_by = 'nouveaux' AND controls.sort_direction = 'asc' THEN visible.created_at END ASC,
          CASE
            WHEN controls.sort_by = 'mieux_notes_mois' AND controls.sort_direction = 'desc'
              THEN CASE WHEN visible.monthly_reservations > 0 THEN 1 ELSE 0 END
          END DESC,
          CASE
            WHEN controls.sort_by = 'mieux_notes_mois' AND controls.sort_direction = 'asc'
              THEN CASE WHEN visible.monthly_reservations > 0 THEN 1 ELSE 0 END
          END ASC,
          CASE WHEN controls.sort_by = 'mieux_notes_mois' AND controls.sort_direction = 'desc' THEN visible.rating END DESC,
          CASE WHEN controls.sort_by = 'mieux_notes_mois' AND controls.sort_direction = 'asc' THEN visible.rating END ASC,
          CASE
            WHEN controls.sort_by = 'mieux_notes_mois' AND controls.sort_direction = 'desc'
              THEN visible.monthly_reservations
          END DESC,
          CASE
            WHEN controls.sort_by = 'mieux_notes_mois' AND controls.sort_direction = 'asc'
              THEN visible.monthly_reservations
          END ASC,
          CASE
            WHEN controls.sort_by = 'plus_reserves_mois' AND controls.sort_direction = 'desc'
              THEN visible.monthly_reservations
          END DESC,
          CASE
            WHEN controls.sort_by = 'plus_reserves_mois' AND controls.sort_direction = 'asc'
              THEN visible.monthly_reservations
          END ASC,
          CASE
            WHEN controls.sort_by = 'pertinence'
              AND controls.has_query
              AND controls.sort_direction = 'desc'
              THEN visible.relevance_score
          END DESC,
          CASE
            WHEN controls.sort_by = 'pertinence'
              AND controls.has_query
              AND controls.sort_direction = 'asc'
              THEN visible.relevance_score
          END ASC,
          CASE
            WHEN controls.sort_by = 'pertinence' AND NOT controls.has_query
              THEN md5(controls.random_seed || ':' || visible.id::text)
          END ASC,
          visible.rating DESC,
          visible.review_count DESC,
          md5(controls.random_seed || ':' || visible.id::text) ASC,
          visible.id ASC
      ) AS catalog_position
    FROM visible
    CROSS JOIN controls
  ),
  page AS (
    SELECT ordered.*
    FROM ordered
    ORDER BY ordered.catalog_position
    LIMIT (SELECT page_limit FROM controls)
    OFFSET (SELECT page_offset FROM controls)
  ),
  summary AS (
    SELECT count(*)::bigint AS total_count
    FROM ordered
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(page) - 'catalog_position'
          ORDER BY page.catalog_position
        )
        FROM page
      ),
      '[]'::jsonb
    ) AS items,
    summary.total_count,
    CASE
      WHEN controls.page_offset + controls.page_limit < summary.total_count
        THEN controls.page_offset + controls.page_limit
      ELSE NULL
    END::integer AS next_offset
  FROM controls
  CROSS JOIN summary;
$function$;

COMMENT ON FUNCTION public.search_restaurants_catalog_page(
  text,
  text,
  text,
  integer,
  boolean,
  numeric,
  text,
  text,
  integer,
  integer
) IS
  'Returns exact image-backed public restaurant pages; default discovery rotates daily without alphabetical ordering while explicit sorts remain deterministic.';

REVOKE ALL ON FUNCTION public.search_restaurants_catalog_page(
  text,
  text,
  text,
  integer,
  boolean,
  numeric,
  text,
  text,
  integer,
  integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog_page(
  text,
  text,
  text,
  integer,
  boolean,
  numeric,
  text,
  text,
  integer,
  integer
) TO anon, authenticated, service_role;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS privilege
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'search_restaurants_catalog_page'
      AND procedure.oid = 'public.search_restaurants_catalog_page(text,text,text,integer,boolean,numeric,text,text,integer,integer)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute catalog pagination directly';
  END IF;

  IF NOT has_function_privilege(
    'anon',
    'public.search_restaurants_catalog_page(text,text,text,integer,boolean,numeric,text,text,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous catalog pagination grant is missing';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.search_restaurants_catalog_page(text,text,text,integer,boolean,numeric,text,text,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated catalog pagination grant is missing';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
