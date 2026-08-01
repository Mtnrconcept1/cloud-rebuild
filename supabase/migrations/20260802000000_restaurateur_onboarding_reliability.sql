BEGIN;

-- `status` and `is_active` previously behaved like two independent activation
-- controls. Keep one canonical operational state at the database boundary so
-- every caller, including older clients, receives the same result.
CREATE OR REPLACE FUNCTION public.normalize_restaurant_operational_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(COALESCE(NULLIF(trim(NEW.status), ''), 'pending'));
  v_status_changed boolean := TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status;
  v_active_changed boolean := TG_OP = 'INSERT' OR NEW.is_active IS DISTINCT FROM OLD.is_active;
BEGIN
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
      NEW.status := CASE WHEN lower(COALESCE(OLD.status, 'pending')) = 'active'
        THEN 'paused'
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
BEFORE INSERT OR UPDATE OF status, is_active
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.normalize_restaurant_operational_state();

-- Repair the two inconsistent production rows conservatively. A restaurant
-- whose human review is not complete must remain private. An approved row keeps
-- the boolean intent and receives the matching canonical status.
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
WHERE (
  COALESCE(restaurant.is_active, false) IS TRUE
  AND lower(COALESCE(restaurant.status, '')) <> 'active'
) OR (
  COALESCE(restaurant.is_active, false) IS FALSE
  AND lower(COALESCE(restaurant.status, '')) = 'active'
);

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_operational_state_consistent;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_operational_state_consistent
  CHECK (
    (
      COALESCE(is_active, false) IS TRUE
      AND lower(COALESCE(status, '')) = 'active'
    )
    OR
    (
      COALESCE(is_active, false) IS FALSE
      AND lower(COALESCE(status, 'pending')) <> 'active'
    )
  ) NOT VALID;

ALTER TABLE public.restaurants
  VALIDATE CONSTRAINT restaurants_operational_state_consistent;

COMMENT ON CONSTRAINT restaurants_operational_state_consistent ON public.restaurants IS
  'A restaurant is public only when status=active and is_active=true; every other status is private.';

NOTIFY pgrst, 'reload schema';

COMMIT;
