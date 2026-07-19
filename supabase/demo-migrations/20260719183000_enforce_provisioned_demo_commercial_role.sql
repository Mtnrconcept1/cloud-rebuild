-- Dedicated TOK demo project: every automatically provisioned presentation
-- identity persists exactly one role. The frame layer supplies temporary actor
-- roles for the client, restaurant and courier dashboards without widening RLS.
WITH provisioned_demo_identities AS (
  SELECT DISTINCT account.user_id
  FROM public.commercial_demo_accounts AS account
  JOIN auth.users AS identity
    ON identity.id = account.user_id
  WHERE account.is_active
    AND identity.raw_app_meta_data ->> 'account_type' = 'commercial_demo'
)
INSERT INTO public.user_roles (user_id, role)
SELECT identity.user_id, 'commercial'::public.app_role
FROM provisioned_demo_identities AS identity
ON CONFLICT (user_id, role) DO NOTHING;

WITH provisioned_demo_identities AS (
  SELECT DISTINCT account.user_id
  FROM public.commercial_demo_accounts AS account
  JOIN auth.users AS identity
    ON identity.id = account.user_id
  WHERE account.is_active
    AND identity.raw_app_meta_data ->> 'account_type' = 'commercial_demo'
)
DELETE FROM public.user_roles AS assigned
USING provisioned_demo_identities AS identity
WHERE assigned.user_id = identity.user_id
  AND assigned.role <> 'commercial';
