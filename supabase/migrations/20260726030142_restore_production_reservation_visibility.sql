-- Restore production rows that are not attached to a restaurant branch.
--
-- The restrictive branch-isolation policies call this helper for every row.
-- Production reservations normally have branch_id = NULL. Returning false for
-- NULL therefore overrode the valid client/restaurant ownership policies and
-- made those reservations invisible through the Data API.

BEGIN;

DO $preflight$
DECLARE
  helper_count integer;
  restrictive_policy_count integer;
BEGIN
  SELECT count(*)::integer
  INTO helper_count
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'can_view_commercial_demo_branch'
    AND pg_get_function_identity_arguments(procedure.oid) = 'p_branch_id uuid'
    AND procedure.prosecdef IS TRUE
    AND procedure.provolatile = 's'
    AND procedure.proconfig = ARRAY['search_path=""'];

  IF helper_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one stable SECURITY DEFINER can_view_commercial_demo_branch(uuid) helper with an empty search_path, found %',
      helper_count;
  END IF;

  SELECT count(*)::integer
  INTO restrictive_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname = 'hide_commercial_demo_branch_rows'
    AND permissive = 'RESTRICTIVE'
    AND cmd = 'SELECT'
    AND roles @> ARRAY['authenticated']::name[]
    AND qual = 'can_view_commercial_demo_branch(branch_id)';

  IF restrictive_policy_count = 0 THEN
    RAISE EXCEPTION
      'No restrictive branch-isolation policy backed by can_view_commercial_demo_branch(branch_id) was found';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_branch(
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    -- A NULL branch means the row is not part of a commercial-demo branch.
    -- Other permissive ownership/RBAC policies still decide whether it is
    -- visible; this helper must not reject the row globally.
    WHEN p_branch_id IS NULL THEN true
    ELSE COALESCE((
      SELECT public.can_view_commercial_demo_restaurant(branch.restaurant_id)
      FROM public.restaurant_branches AS branch
      WHERE branch.id = p_branch_id
    ), false)
  END
$function$;

COMMENT ON FUNCTION public.can_view_commercial_demo_branch(uuid) IS
  'Restrictive RLS helper: unscoped NULL branches pass to ownership policies; non-null branches remain isolated through their restaurant.';

DO $postflight$
DECLARE
  helper_owner name;
  helper_acl aclitem[];
BEGIN
  IF public.can_view_commercial_demo_branch(NULL::uuid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Unscoped production rows are still rejected by the branch-isolation helper';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurant_branches AS branch
    WHERE public.can_view_commercial_demo_branch(branch.id)
      IS DISTINCT FROM public.can_view_commercial_demo_restaurant(branch.restaurant_id)
  ) THEN
    RAISE EXCEPTION
      'Non-null branch isolation no longer matches restaurant isolation';
  END IF;

  SELECT owner.rolname, procedure.proacl
  INTO helper_owner, helper_acl
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN pg_roles AS owner
    ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'can_view_commercial_demo_branch'
    AND pg_get_function_identity_arguments(procedure.oid) = 'p_branch_id uuid';

  IF helper_owner IS DISTINCT FROM 'postgres'::name THEN
    RAISE EXCEPTION
      'can_view_commercial_demo_branch(uuid) owner drifted to %',
      helper_owner;
  END IF;

  IF NOT has_function_privilege(
    'anon',
    'public.can_view_commercial_demo_branch(uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.can_view_commercial_demo_branch(uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.can_view_commercial_demo_branch(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Required RLS helper EXECUTE privileges were not preserved (ACL: %)',
      helper_acl;
  END IF;
END
$postflight$;

COMMIT;
