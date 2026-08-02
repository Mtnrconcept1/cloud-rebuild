from __future__ import annotations

from pathlib import Path


MIGRATION = """BEGIN;

-- `status` and `is_active` previously behaved like two independent
-- activation controls. One invariant now protects every caller,
-- including older clients and the admin console.
CREATE OR REPLACE FUNCTION public.normalize_restaurant_operational_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(COALESCE(NULLIF(trim(NEW.status), ''), 'pending'));
  v_status_changed boolean := TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status;
  v_active_changed boolean := TG_OP = 'INSERT' OR NEW.is_active IS DISTINCT FROM OLD.is_active;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN
    NEW.status := 'demo';
    RETURN NEW;
  END IF;

  IF v_status NOT IN ('active', 'pending', 'paused', 'suspended', 'archived') THEN
    RAISE EXCEPTION 'Unsupported restaurant status: %', NEW.status
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_active, false) OR v_status = 'active' THEN
      NEW.status := 'active';
      NEW.is_active := true;
    ELSE
      NEW.status := v_status;
      NEW.is_active := false;
    END IF;
    RETURN NEW;
  END IF;

  IF v_status_changed THEN
    NEW.status := v_status;
    NEW.is_active := v_status = 'active';
  ELSIF v_active_changed THEN
    IF COALESCE(NEW.is_active, false) THEN
      NEW.status := 'active';
      NEW.is_active := true;
    ELSE
      NEW.status := CASE
        WHEN lower(COALESCE(OLD.status, 'pending')) = 'active' THEN 'paused'
        ELSE v_status
      END;
      NEW.is_active := false;
    END IF;
  ELSIF COALESCE(NEW.is_active, false) IS TRUE AND v_status <> 'active' THEN
    NEW.status := 'active';
    NEW.is_active := true;
  ELSIF COALESCE(NEW.is_active, false) IS FALSE AND v_status = 'active' THEN
    NEW.status := 'paused';
    NEW.is_active := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_restaurant_operational_state()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS normalize_restaurant_operational_state ON public.restaurants;
CREATE TRIGGER normalize_restaurant_operational_state
BEFORE INSERT OR UPDATE OF status, is_active, is_demo
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.normalize_restaurant_operational_state();

-- Repair only contradictory real restaurants. An application that has
-- not completed human review remains private; demos retain status=demo.
UPDATE public.restaurants AS restaurant
SET
  status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.signup_applications AS application
      WHERE application.user_id = restaurant.owner_id
        AND application.requested_role = 'restaurateur'::public.app_role
        AND application.status = 'approved'
        AND application.reviewed_by IS NOT NULL
        AND application.reviewed_at IS NOT NULL
        AND application.metadata->>'restaurant_id' = restaurant.id::text
    )
    THEN CASE WHEN COALESCE(restaurant.is_active, false) THEN 'active' ELSE 'paused' END
    ELSE 'pending'
  END,
  is_active = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.signup_applications AS application
      WHERE application.user_id = restaurant.owner_id
        AND application.requested_role = 'restaurateur'::public.app_role
        AND application.status = 'approved'
        AND application.reviewed_by IS NOT NULL
        AND application.reviewed_at IS NOT NULL
        AND application.metadata->>'restaurant_id' = restaurant.id::text
    )
    THEN COALESCE(restaurant.is_active, false)
    ELSE false
  END,
  updated_at = now()
WHERE COALESCE(restaurant.is_demo, false) IS FALSE
  AND (
    (
      COALESCE(restaurant.is_active, false) IS TRUE
      AND lower(COALESCE(restaurant.status, '')) <> 'active'
    )
    OR
    (
      COALESCE(restaurant.is_active, false) IS FALSE
      AND lower(COALESCE(restaurant.status, '')) = 'active'
    )
  );

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_operational_state_consistent;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_operational_state_consistent
  CHECK (
    (
      COALESCE(is_demo, false) IS TRUE
      AND lower(COALESCE(status, '')) = 'demo'
    )
    OR
    (
      COALESCE(is_demo, false) IS FALSE
      AND COALESCE(is_active, false) IS TRUE
      AND lower(COALESCE(status, '')) = 'active'
    )
    OR
    (
      COALESCE(is_demo, false) IS FALSE
      AND COALESCE(is_active, false) IS FALSE
      AND lower(COALESCE(status, 'pending')) <> 'active'
    )
  ) NOT VALID;

ALTER TABLE public.restaurants
  VALIDATE CONSTRAINT restaurants_operational_state_consistent;

COMMENT ON CONSTRAINT restaurants_operational_state_consistent ON public.restaurants IS
  'Real restaurants are public only when status=active and is_active=true; demo restaurants keep status=demo.';

NOTIFY pgrst, 'reload schema';

COMMIT;
"""


def main() -> None:
    path = Path("supabase/migrations/20260802000000_restaurateur_onboarding_reliability.sql")
    path.write_text(MIGRATION, encoding="utf-8")


if __name__ == "__main__":
    main()
