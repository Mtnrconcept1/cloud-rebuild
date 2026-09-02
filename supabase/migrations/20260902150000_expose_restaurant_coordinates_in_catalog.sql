BEGIN;

DROP FUNCTION IF EXISTS public.search_restaurants_catalog(
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
);

CREATE FUNCTION public.search_restaurants_catalog(
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
  relevance_score numeric,
  latitude double precision,
  longitude double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    result.id,
    result.name,
    result.description,
    result.cuisine_type,
    result.rating,
    result.review_count,
    result.price_range,
    result.delivery_fee,
    result.image_url,
    result.address,
    result.city,
    result.delivery_available,
    result.created_at,
    result.category_names,
    result.category_slugs,
    result.matched_via_menu,
    result.monthly_reservations,
    result.monthly_orders,
    result.promotion_score,
    result.relevance_score,
    restaurant.latitude,
    restaurant.longitude
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
  JOIN public.restaurants AS restaurant ON restaurant.id = result.id
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
  'Public restaurant search with bounded filters, pagination and coordinates used for client-side proximity filtering.';

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
