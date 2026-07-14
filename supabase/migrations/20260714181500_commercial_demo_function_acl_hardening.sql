-- Keep trigger-only SECURITY DEFINER helpers out of the Data API.
--
-- This project grants EXECUTE to API roles through default privileges. A
-- REVOKE from PUBLIC alone therefore does not remove the explicit grants made
-- to anon, authenticated and service_role when a new function is created.
-- PostgreSQL triggers do not require the DML caller to retain EXECUTE on their
-- trigger function after the trigger has been installed.

REVOKE ALL ON FUNCTION public.protect_demo_restaurant_identity()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.protect_commercial_demo_account_mapping()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_commercial_role_assignment()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.block_commercial_demo_side_effect_row()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.block_commercial_demo_social_side_effect_row()
  FROM PUBLIC, anon, authenticated, service_role;

-- Cover the administrator relationship used by audit and lifecycle queries.
CREATE INDEX IF NOT EXISTS commercial_demo_accounts_created_by_idx
  ON public.commercial_demo_accounts (created_by);

NOTIFY pgrst, 'reload schema';
