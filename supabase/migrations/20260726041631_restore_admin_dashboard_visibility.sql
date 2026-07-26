-- Restore production dashboard visibility without weakening commercial-demo
-- isolation.
--
-- The restaurant isolation helper is used by RESTRICTIVE SELECT policies.
-- Rows such as standalone AI support conversations legitimately have no
-- restaurant_id. Returning false for NULL therefore hid them even when a
-- permissive ownership/admin policy allowed access.
--
-- The admin operations page also reads orders and reservations directly, but
-- both tables only granted SELECT to the customer, restaurant owner or courier.

BEGIN;

DO $preflight$
DECLARE
  helper_count integer;
  restrictive_policy_count integer;
  target_table_count integer;
BEGIN
  SELECT count(*)::integer
  INTO helper_count
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'can_view_commercial_demo_restaurant'
    AND pg_get_function_identity_arguments(procedure.oid) = 'p_restaurant_id uuid'
    AND procedure.prosecdef IS TRUE
    AND procedure.provolatile = 's'
    AND procedure.proconfig = ARRAY['search_path=public'];

  IF helper_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one stable SECURITY DEFINER can_view_commercial_demo_restaurant(uuid) helper with search_path=public, found %',
      helper_count;
  END IF;

  SELECT count(*)::integer
  INTO restrictive_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname = 'hide_commercial_demo_rows'
    AND permissive = 'RESTRICTIVE'
    AND cmd = 'SELECT'
    AND roles @> ARRAY['authenticated']::name[]
    AND qual = 'can_view_commercial_demo_restaurant(restaurant_id)';

  IF restrictive_policy_count < 2 THEN
    RAISE EXCEPTION
      'Expected restaurant isolation on multiple dashboard tables, found % matching policies',
      restrictive_policy_count;
  END IF;

  SELECT count(*)::integer
  INTO target_table_count
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('orders', 'reservations')
    AND relation.relkind = 'r'
    AND relation.relrowsecurity IS TRUE;

  IF target_table_count <> 2 THEN
    RAISE EXCEPTION
      'orders and reservations must both exist with RLS enabled, found %',
      target_table_count;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    -- A NULL restaurant means that the row is not scoped to a commercial-demo
    -- restaurant. Other permissive ownership/RBAC policies still decide
    -- whether it is visible.
    WHEN p_restaurant_id IS NULL THEN true
    ELSE COALESCE((
      SELECT restaurant.is_demo IS FALSE
        AND (
          (
            restaurant.is_active IS TRUE
            AND lower(COALESCE(restaurant.status, '')) = 'active'
          )
          OR restaurant.owner_id = (SELECT auth.uid())
          OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        )
      FROM public.restaurants AS restaurant
      WHERE restaurant.id = p_restaurant_id
    ), false)
  END
$function$;

COMMENT ON FUNCTION public.can_view_commercial_demo_restaurant(uuid) IS
  'Restrictive RLS helper: NULL restaurant scopes pass to ownership policies; non-null restaurants keep production/demo isolation.';

DROP POLICY IF EXISTS orders_admin_select_production
  ON public.orders;
CREATE POLICY orders_admin_select_production
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS reservations_admin_select_production
  ON public.reservations;
CREATE POLICY reservations_admin_select_production
  ON public.reservations
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DO $postflight$
DECLARE
  helper_owner name;
  helper_acl aclitem[];
  admin_policy_count integer;
BEGIN
  IF public.can_view_commercial_demo_restaurant(NULL::uuid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Unscoped production rows are still rejected by restaurant isolation';
  END IF;

  IF public.can_view_commercial_demo_restaurant(gen_random_uuid()) IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'Unknown non-null restaurant IDs must remain rejected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    WHERE restaurant.is_demo IS TRUE
      AND public.can_view_commercial_demo_restaurant(restaurant.id)
  ) THEN
    RAISE EXCEPTION
      'A commercial-demo restaurant became visible through the production helper';
  END IF;

  SELECT count(*)::integer
  INTO admin_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('orders', 'reservations')
    AND policyname IN (
      'orders_admin_select_production',
      'reservations_admin_select_production'
    )
    AND permissive = 'PERMISSIVE'
    AND cmd = 'SELECT'
    AND roles = ARRAY['authenticated']::name[]
    AND qual = 'has_role(( SELECT auth.uid() AS uid), ''admin''::app_role)';

  IF admin_policy_count <> 2 THEN
    RAISE EXCEPTION
      'Expected two scoped admin SELECT policies, found %',
      admin_policy_count;
  END IF;

  SELECT owner.rolname, procedure.proacl
  INTO helper_owner, helper_acl
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN pg_roles AS owner
    ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'can_view_commercial_demo_restaurant'
    AND pg_get_function_identity_arguments(procedure.oid) = 'p_restaurant_id uuid';

  IF helper_owner IS DISTINCT FROM 'postgres'::name THEN
    RAISE EXCEPTION
      'can_view_commercial_demo_restaurant(uuid) owner drifted to %',
      helper_owner;
  END IF;

  IF NOT has_function_privilege(
    'anon',
    'public.can_view_commercial_demo_restaurant(uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.can_view_commercial_demo_restaurant(uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.can_view_commercial_demo_restaurant(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Required RLS helper EXECUTE privileges were not preserved (ACL: %)',
      helper_acl;
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
