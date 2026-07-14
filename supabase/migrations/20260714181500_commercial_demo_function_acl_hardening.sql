-- Keep trigger-only SECURITY DEFINER helpers out of the Data API.
--
-- This project grants EXECUTE to API roles through default privileges.  A
-- REVOKE from PUBLIC alone therefore does not remove the explicit grants made
-- to anon, authenticated and service_role when a new function is created.
-- PostgreSQL triggers do not require the DML caller to retain EXECUTE on their
-- trigger function after the trigger has been installed.

-- All newly assigned commercial roles must have the managed demo mapping.
-- Existing legacy rows remain valid because unrelated UPDATEs return before
-- this check, while the provisioning RPC creates the mapping before the role.
CREATE OR REPLACE FUNCTION public.guard_commercial_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service_role boolean := COALESCE(auth.role() = 'service_role', false);
  v_is_admin boolean := COALESCE(public.auth_is_admin(), false);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'commercial'::public.app_role THEN
    IF NOT (v_is_service_role OR v_is_admin) THEN
      RAISE EXCEPTION 'Commercial accounts are administrator-managed'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.commercial_demo_accounts account
      WHERE account.user_id = NEW.user_id
        AND account.is_active
    ) THEN
      RAISE EXCEPTION 'Commercial role requires an active administrator-managed demo account'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

-- Demo media may be shown locally, but must never enter the real Ollama image
-- analysis queue. Centralising the guard on the queue covers every current and
-- future enqueue path, while returning NULL lets the demo media write succeed.
CREATE OR REPLACE FUNCTION public.guard_commercial_demo_image_analysis_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.restaurant_images image
    JOIN public.restaurants restaurant ON restaurant.id = image.restaurant_id
    WHERE image.id = NEW.image_id
      AND restaurant.is_demo
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_commercial_demo_image_analysis_job
  ON public.image_analysis_jobs;
CREATE TRIGGER guard_commercial_demo_image_analysis_job
  BEFORE INSERT OR UPDATE ON public.image_analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_demo_image_analysis_job();

-- Remove any job created between the first commercial migration and this
-- central guard. This is idempotent and currently expected to delete no rows.
DELETE FROM public.image_analysis_jobs job
USING public.restaurant_images image, public.restaurants restaurant
WHERE image.id = job.image_id
  AND restaurant.id = image.restaurant_id
  AND restaurant.is_demo;

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

REVOKE ALL ON FUNCTION public.guard_commercial_demo_image_analysis_job()
  FROM PUBLIC, anon, authenticated, service_role;

-- Cover the administrator relationship used by audit and lifecycle queries.
CREATE INDEX IF NOT EXISTS commercial_demo_accounts_created_by_idx
  ON public.commercial_demo_accounts (created_by);

NOTIFY pgrst, 'reload schema';
