-- Close the dedicated commercial demo privilege-escalation path.
-- The blanket demo policy must never grant mutation access to user_roles.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtext('tok-demo:user-roles-privilege-escalation:v1')
);

DO $preflight$
DECLARE
  v_policy record;
BEGIN
  IF to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION 'public.user_roles is missing';
  END IF;

  IF NOT (
    SELECT c.relrowsecurity
    FROM pg_class AS c
    WHERE c.oid = 'public.user_roles'::regclass
  ) THEN
    RAISE EXCEPTION 'RLS is disabled on public.user_roles';
  END IF;

  SELECT permissive, roles, cmd, qual, with_check
  INTO v_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_roles'
    AND policyname = 'dedicated_commercial_demo_full_access';

  IF FOUND AND (
    v_policy.permissive IS DISTINCT FROM 'PERMISSIVE'
    OR v_policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
    OR v_policy.cmd IS DISTINCT FROM 'ALL'
    OR v_policy.qual IS DISTINCT FROM 'is_dedicated_commercial_demo_actor()'
    OR v_policy.with_check IS DISTINCT FROM 'is_dedicated_commercial_demo_actor()'
  ) THEN
    RAISE EXCEPTION 'Unexpected demo policy shape on public.user_roles';
  END IF;

  IF to_regclass('public.commercial_demo_accounts') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.commercial_demo_accounts AS demo_account
      JOIN public.user_roles AS assigned_role
        ON assigned_role.user_id = demo_account.user_id
      WHERE demo_account.is_active
        AND assigned_role.role = 'admin'::public.app_role
    )
  THEN
    RAISE EXCEPTION 'Incident check failed: an active demo actor already has admin';
  END IF;
END;
$preflight$;

DROP POLICY IF EXISTS dedicated_commercial_demo_full_access
  ON public.user_roles;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'dedicated_commercial_demo_full_access'
  ) THEN
    RAISE EXCEPTION 'The blanket demo policy remains on public.user_roles';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'user_roles_self_select'
      AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'The authenticated self-read policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'user_roles_super_admin_all'
      AND cmd = 'ALL'
      AND roles = ARRAY['authenticated']::name[]
      AND qual = 'auth_is_super_admin()'
      AND with_check = 'auth_is_super_admin()'
  ) THEN
    RAISE EXCEPTION 'The super-admin management policy changed unexpectedly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (
        COALESCE(qual, '') ILIKE '%dedicated_commercial_demo%'
        OR COALESCE(with_check, '') ILIKE '%dedicated_commercial_demo%'
      )
  ) THEN
    RAISE EXCEPTION 'A demo actor mutation policy remains on public.user_roles';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
