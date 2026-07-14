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
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role
  THEN
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

DROP TRIGGER IF EXISTS guard_commercial_role_assignment ON public.user_roles;
CREATE TRIGGER guard_commercial_role_assignment
  BEFORE INSERT OR UPDATE OF user_id, role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_role_assignment();

-- Preserve already-existing legacy roles when an administrator changes a
-- different role. The historical RPC deleted and reinserted every role, which
-- would incorrectly turn a retained legacy commercial role into a new one.
CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
  p_user_id uuid,
  p_roles public.app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_role public.app_role;
  v_roles public.app_role[];
  v_old_roles public.app_role[];
  v_last_admin_removal boolean;
BEGIN
  IF NOT v_is_service_role AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'Super admin access required.';
  END IF;

  SELECT COALESCE(
    array_agg(deduped.role_name ORDER BY deduped.role_name::text),
    ARRAY['client'::public.app_role]
  )
  INTO v_roles
  FROM (
    SELECT DISTINCT role_name
    FROM unnest(COALESCE(p_roles, ARRAY['client'::public.app_role])) AS role_name
    WHERE role_name IS NOT NULL
  ) AS deduped;

  IF COALESCE(array_length(v_roles, 1), 0) = 0 THEN
    v_roles := ARRAY['client'::public.app_role];
  END IF;

  PERFORM 1
  FROM public.user_roles
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(
    array_agg(ur.role ORDER BY ur.role::text),
    ARRAY[]::public.app_role[]
  )
  INTO v_old_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  v_last_admin_removal :=
    'admin'::public.app_role = ANY(v_old_roles)
    AND NOT ('admin'::public.app_role = ANY(v_roles))
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.role = 'admin'::public.app_role
        AND ur.user_id <> p_user_id
    );

  IF v_last_admin_removal THEN
    RAISE EXCEPTION 'Cannot remove the last admin role.';
  END IF;

  DELETE FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND NOT (ur.role = ANY(v_roles));

  FOREACH v_role IN ARRAY v_roles LOOP
    IF NOT (v_role = ANY(v_old_roles)) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (p_user_id, v_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END LOOP;

  IF 'commercial'::public.app_role = ANY(v_roles) THEN
    INSERT INTO public.commercial_compensation_profiles (
      user_id,
      status,
      sprint_started_at,
      employment_active
    )
    VALUES (
      p_user_id,
      'sprint',
      CURRENT_DATE,
      false
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      status = CASE
        WHEN public.commercial_compensation_profiles.status = 'inactive' THEN 'sprint'
        ELSE public.commercial_compensation_profiles.status
      END,
      updated_at = now();
  ELSE
    UPDATE public.commercial_compensation_profiles
    SET
      status = 'inactive',
      employment_active = false,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  VALUES (
    v_actor_id,
    'admin_set_user_roles',
    'user_roles',
    p_user_id,
    jsonb_build_object('roles', COALESCE(to_jsonb(v_old_roles), '[]'::jsonb)),
    jsonb_build_object('roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb))
  );
END
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[])
  TO authenticated, service_role;

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

-- A real restaurant cannot be reclassified as a demo after a worker has
-- claimed one of its images, and an indexed image cannot be reassigned to a
-- demo restaurant. Demo identity and image ownership are immutable.
CREATE OR REPLACE FUNCTION public.prevent_restaurant_demo_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'Restaurant demonstration status is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS prevent_restaurant_demo_status_change
  ON public.restaurants;
CREATE TRIGGER prevent_restaurant_demo_status_change
  BEFORE UPDATE OF is_demo ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_restaurant_demo_status_change();

CREATE OR REPLACE FUNCTION public.prevent_restaurant_image_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
    RAISE EXCEPTION 'Indexed restaurant image ownership is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS prevent_restaurant_image_reassignment
  ON public.restaurant_images;
CREATE TRIGGER prevent_restaurant_image_reassignment
  BEFORE UPDATE OF restaurant_id ON public.restaurant_images
  FOR EACH ROW EXECUTE FUNCTION public.prevent_restaurant_image_reassignment();

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

REVOKE ALL ON FUNCTION public.prevent_restaurant_demo_status_change()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_restaurant_image_reassignment()
  FROM PUBLIC, anon, authenticated, service_role;

-- Cover the administrator relationship used by audit and lifecycle queries.
CREATE INDEX IF NOT EXISTS commercial_demo_accounts_created_by_idx
  ON public.commercial_demo_accounts (created_by);

NOTIFY pgrst, 'reload schema';
