BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- July's automatic activation contradicts October's inert production metadata.
-- The editable demo belongs to the separate demo project, not this singleton.
DROP TRIGGER IF EXISTS enforce_commercial_demo_restaurant_active ON public.restaurants;

-- Do not silently rewrite an unexpectedly unsafe deployed canonical row.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.commercial_demo_shared_restaurant shared
    JOIN public.restaurants r ON r.id = shared.restaurant_id
    WHERE shared.singleton AND (
      r.is_demo IS DISTINCT FROM true OR COALESCE(r.is_active, false)
      OR lower(COALESCE(r.status, '')) <> 'demo' OR r.stripe_account_id IS NOT NULL
      OR COALESCE(r.stripe_connect_details_submitted, false)
      OR COALESCE(r.stripe_connect_charges_enabled, false)
      OR COALESCE(r.stripe_connect_payouts_enabled, false)
    )
  ) THEN RAISE EXCEPTION 'Canonical commercial demo restaurant is unsafe; reconcile before migration'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_canonical_commercial_demo_inert_state()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.commercial_demo_shared_restaurant shared
             WHERE shared.singleton AND shared.restaurant_id = NEW.id)
     AND (NEW.is_demo IS DISTINCT FROM true OR COALESCE(NEW.is_active, false)
          OR lower(COALESCE(NEW.status, '')) <> 'demo' OR NEW.stripe_account_id IS NOT NULL
          OR COALESCE(NEW.stripe_connect_details_submitted, false)
          OR COALESCE(NEW.stripe_connect_charges_enabled, false)
          OR COALESCE(NEW.stripe_connect_payouts_enabled, false)) THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_CANONICAL_MUST_REMAIN_INERT' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_canonical_commercial_demo_inert_state()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS protect_canonical_commercial_demo_inert_state ON public.restaurants;
CREATE TRIGGER protect_canonical_commercial_demo_inert_state
  BEFORE UPDATE ON public.restaurants FOR EACH ROW
  EXECUTE FUNCTION public.protect_canonical_commercial_demo_inert_state();

NOTIFY pgrst, 'reload schema';
COMMIT;
