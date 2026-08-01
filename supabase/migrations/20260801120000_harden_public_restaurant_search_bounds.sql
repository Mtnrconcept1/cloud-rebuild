-- Bound the anonymous catalog search at the public wrapper.
-- The unguarded implementation remains private and is only invoked through
-- this SECURITY DEFINER function after text and pagination inputs are clamped.
BEGIN;

DO $migration$
BEGIN
  IF to_regprocedure(
    'public.search_restaurants_catalog_unguarded(text,text,text,integer,boolean,numeric,text,text,integer,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required function search_restaurants_catalog_unguarded is missing';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.search_restaurants_catalog(
  p_query text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_cuisine text DEFAULT NULL::text,
  p_price_range integer DEFAULT NULL::integer,
  p_delivery_only boolean DEFAULT false,
  p_min_rating numeric DEFAULT 0,
  p_sort_by text DEFAULT 'pertinence'::text,
  p_sort_direction text DEFAULT NULL::text,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
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
  created_at timestamp with time zone,
  category_names text[],
  category_slugs text[],
  matched_via_menu boolean,
  monthly_reservations integer,
  monthly_orders integer,
  promotion_score numeric,
  relevance_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100),
    LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000)
  ) AS result
  WHERE public.restaurant_is_publicly_visible(result.id);
$function$;

COMMENT ON FUNCTION public.search_restaurants_catalog(
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
  'Public restaurant search with bounded filters, page size and pagination depth.';

REVOKE ALL ON FUNCTION public.search_restaurants_catalog_unguarded(
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

REVOKE ALL ON FUNCTION public.search_restaurants_catalog(
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

GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog(
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

NOTIFY pgrst, 'reload schema';

COMMIT;
