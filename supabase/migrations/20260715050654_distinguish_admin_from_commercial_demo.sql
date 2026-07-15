-- Keep real administrators operational even when they carry the commercial
-- capability role. Durable demo markers remain authoritative, so granting an
-- admin role to a mapped commercial-demo identity never reopens production.

BEGIN;

CREATE OR REPLACE FUNCTION public.commercial_demo_user_is_restricted(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.commercial_demo_accounts AS account
        WHERE account.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM auth.users AS managed_user
        WHERE managed_user.id = p_user_id
          AND lower(btrim(COALESCE(
            managed_user.raw_app_meta_data ->> 'account_type',
            ''
          ))) = 'commercial_demo'
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.user_roles AS commercial_role
          WHERE commercial_role.user_id = p_user_id
            AND commercial_role.role = 'commercial'::public.app_role
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_roles AS admin_role
          WHERE admin_role.user_id = p_user_id
            AND admin_role.role = 'admin'::public.app_role
        )
      )
    )
$$;

REVOKE ALL
  ON FUNCTION public.commercial_demo_user_is_restricted(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.commercial_demo_user_is_restricted(uuid) IS
  'Restricts mapped/marked demo identities and non-admin commercial users while preserving unmarked administrator access.';

COMMIT;
