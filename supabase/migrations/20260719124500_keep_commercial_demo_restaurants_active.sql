BEGIN;

-- A commercial demo must remain open so the customer, restaurant and courier
-- workspaces can exercise the same feature-flagged catalogue as production.
-- Financial isolation is enforced independently by the demo constraint and the
-- Stripe Test-only checkout endpoint.
CREATE OR REPLACE FUNCTION public.enforce_commercial_demo_restaurant_active()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_demo IS TRUE THEN
    NEW.is_active := true;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.enforce_commercial_demo_restaurant_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_commercial_demo_restaurant_active() FROM anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_commercial_demo_restaurant_active
  ON public.restaurants;

CREATE TRIGGER enforce_commercial_demo_restaurant_active
BEFORE INSERT OR UPDATE OF is_demo, is_active
ON public.restaurants
FOR EACH ROW
WHEN (NEW.is_demo IS TRUE)
EXECUTE FUNCTION public.enforce_commercial_demo_restaurant_active();

ALTER TABLE public.restaurants
  DISABLE TRIGGER protect_demo_restaurant_identity;

UPDATE public.restaurants
SET is_active = true,
    updated_at = now()
WHERE is_demo IS TRUE
  AND COALESCE(is_active, false) IS FALSE;

ALTER TABLE public.restaurants
  ENABLE TRIGGER protect_demo_restaurant_identity;

COMMENT ON FUNCTION public.enforce_commercial_demo_restaurant_active() IS
  'Keeps isolated commercial demo restaurants active; Stripe Live and Connect remain forbidden by restaurants_demo_isolation_check.';

COMMIT;
