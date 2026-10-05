-- Dedicated commercial demo project only.
-- Pin every commercial presenter to one server-authoritative restaurant.
-- The selected restaurant is seeded from the existing affiliations when they
-- already agree; otherwise the oldest safe demo restaurant becomes canonical.

CREATE TABLE IF NOT EXISTS public.commercial_demo_shared_restaurant (
  singleton boolean PRIMARY KEY DEFAULT true,
  restaurant_id uuid NOT NULL UNIQUE
    REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_demo_shared_restaurant_singleton_check
    CHECK (singleton IS TRUE)
);

ALTER TABLE public.commercial_demo_shared_restaurant ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_demo_shared_restaurant
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.commercial_demo_shared_restaurant IS
  'Dedicated demo-only singleton selecting the one restaurant shared by every commercial presenter. Browser roles have no direct access.';

DO $seed_shared_demo_restaurant$
DECLARE
  v_configured_restaurant_id uuid;
  v_target_restaurant_id uuid;
  v_account_count integer := 0;
  v_distinct_restaurant_count integer := 0;
BEGIN
  SELECT config.restaurant_id
  INTO v_configured_restaurant_id
  FROM public.commercial_demo_shared_restaurant AS config
  WHERE config.singleton IS TRUE;

  IF v_configured_restaurant_id IS NOT NULL THEN
    v_target_restaurant_id := v_configured_restaurant_id;
  ELSE
    SELECT
      count(*)::integer,
      count(DISTINCT account.demo_restaurant_id)::integer,
      min(account.demo_restaurant_id::text)::uuid
    INTO
      v_account_count,
      v_distinct_restaurant_count,
      v_target_restaurant_id
    FROM public.commercial_demo_accounts AS account;

    IF v_account_count > 0 AND v_distinct_restaurant_count <> 1 THEN
      RAISE EXCEPTION
        'Commercial demo accounts already target multiple restaurants; refusing to choose one implicitly'
        USING ERRCODE = '23514';
    END IF;

    IF v_target_restaurant_id IS NULL THEN
      SELECT restaurant.id
      INTO v_target_restaurant_id
      FROM public.restaurants AS restaurant
      WHERE restaurant.is_demo IS TRUE
        AND COALESCE(restaurant.is_active, false) IS TRUE
        AND restaurant.status = 'demo'
        AND restaurant.stripe_account_id IS NULL
        AND restaurant.stripe_connect_details_submitted IS FALSE
        AND restaurant.stripe_connect_charges_enabled IS FALSE
        AND restaurant.stripe_connect_payouts_enabled IS FALSE
      ORDER BY restaurant.created_at ASC, restaurant.id ASC
      LIMIT 1;
    END IF;

    IF v_target_restaurant_id IS NULL THEN
      RAISE EXCEPTION
        'No safe restaurant is available for the commercial demo'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.commercial_demo_shared_restaurant (
      singleton,
      restaurant_id
    ) VALUES (
      true,
      v_target_restaurant_id
    )
    ON CONFLICT (singleton) DO NOTHING;

    SELECT config.restaurant_id
    INTO v_target_restaurant_id
    FROM public.commercial_demo_shared_restaurant AS config
    WHERE config.singleton IS TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = v_target_restaurant_id
      AND restaurant.is_demo IS TRUE
      AND COALESCE(restaurant.is_active, false) IS TRUE
      AND restaurant.status = 'demo'
      AND restaurant.stripe_account_id IS NULL
      AND restaurant.stripe_connect_details_submitted IS FALSE
      AND restaurant.stripe_connect_charges_enabled IS FALSE
      AND restaurant.stripe_connect_payouts_enabled IS FALSE
  ) THEN
    RAISE EXCEPTION
      'Configured commercial demo restaurant is not safe for presentations'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_demo_accounts AS account
    WHERE account.demo_restaurant_id IS DISTINCT FROM v_target_restaurant_id
  ) THEN
    RAISE EXCEPTION
      'Commercial demo account mapping conflicts with the shared restaurant'
      USING ERRCODE = '23514';
  END IF;
END
$seed_shared_demo_restaurant$;

CREATE OR REPLACE FUNCTION public.commercial_demo_shared_restaurant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant_id uuid;
BEGIN
  SELECT config.restaurant_id
  INTO v_restaurant_id
  FROM public.commercial_demo_shared_restaurant AS config
  WHERE config.singleton IS TRUE;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION
      'Shared commercial demo restaurant is not configured'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = v_restaurant_id
      AND restaurant.is_demo IS TRUE
      AND COALESCE(restaurant.is_active, false) IS TRUE
      AND restaurant.status = 'demo'
      AND restaurant.stripe_account_id IS NULL
      AND restaurant.stripe_connect_details_submitted IS FALSE
      AND restaurant.stripe_connect_charges_enabled IS FALSE
      AND restaurant.stripe_connect_payouts_enabled IS FALSE
  ) THEN
    RAISE EXCEPTION
      'Shared commercial demo restaurant is unavailable'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_restaurant_id;
END
$function$;

REVOKE ALL ON FUNCTION public.commercial_demo_shared_restaurant_id()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_shared_restaurant_id()
  TO service_role;

COMMENT ON FUNCTION public.commercial_demo_shared_restaurant_id() IS
  'Dedicated demo-only server resolver for the single restaurant shared by all commercial presenters.';

CREATE OR REPLACE FUNCTION public.enforce_commercial_demo_shared_restaurant_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_shared_restaurant_id uuid;
BEGIN
  v_shared_restaurant_id := public.commercial_demo_shared_restaurant_id();

  IF NEW.demo_restaurant_id IS DISTINCT FROM v_shared_restaurant_id THEN
    RAISE EXCEPTION
      'Commercial demo accounts must target the shared presentation restaurant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_commercial_demo_shared_restaurant_mapping()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_commercial_demo_shared_restaurant_mapping
  ON public.commercial_demo_accounts;

CREATE TRIGGER enforce_commercial_demo_shared_restaurant_mapping
BEFORE INSERT OR UPDATE OF demo_restaurant_id
ON public.commercial_demo_accounts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_commercial_demo_shared_restaurant_mapping();

DO $postflight_shared_demo_restaurant$
DECLARE
  v_shared_restaurant_id uuid;
BEGIN
  v_shared_restaurant_id := public.commercial_demo_shared_restaurant_id();

  IF (
    SELECT count(DISTINCT account.demo_restaurant_id)
    FROM public.commercial_demo_accounts AS account
  ) > 1 THEN
    RAISE EXCEPTION
      'Commercial demo accounts do not share one restaurant after migration'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_demo_accounts AS account
    WHERE account.demo_restaurant_id IS DISTINCT FROM v_shared_restaurant_id
  ) THEN
    RAISE EXCEPTION
      'Commercial demo account mapping differs from the configured shared restaurant'
      USING ERRCODE = '23514';
  END IF;
END
$postflight_shared_demo_restaurant$;
