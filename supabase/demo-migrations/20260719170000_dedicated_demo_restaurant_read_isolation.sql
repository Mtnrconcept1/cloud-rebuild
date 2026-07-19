-- Dedicated demo project counterpart for the production read-isolation
-- migration. The production-only restrictive policy must never block the
-- shared demo restaurant inside this project.

DROP POLICY IF EXISTS production_hide_demo_restaurants ON public.restaurants;

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
    SELECT
      restaurant.is_demo IS TRUE
      AND (
        public.auth_is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.commercial_demo_accounts AS demo_account
          WHERE demo_account.user_id = (SELECT auth.uid())
            AND demo_account.demo_restaurant_id = restaurant.id
            AND demo_account.is_active
        )
      )
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
  ), false)
$function$;

REVOKE ALL ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
