-- Production-only defense in depth.
-- Demo data is served from the dedicated commercial demo project. No
-- authenticated or anonymous Data API request may hydrate a demo restaurant
-- from the production database, including legacy owner/admin mappings.
--
-- Rollback: drop policy production_hide_demo_restaurants and restore the
-- previous can_view_commercial_demo_restaurant() body from
-- 20260714120000_commercial_demo_accounts.sql.

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_hide_demo_restaurants ON public.restaurants;
CREATE POLICY production_hide_demo_restaurants
  ON public.restaurants
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (is_demo IS FALSE);

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT restaurant.is_demo IS FALSE
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
  ), false)
$function$;

REVOKE ALL ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
