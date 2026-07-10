-- Stripe Connect readiness state for mandatory restaurant payouts.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_requirements_due text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS stripe_connect_disabled_reason text,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_connect_last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_connect_ready
  ON public.restaurants(stripe_connect_payouts_enabled, stripe_connect_charges_enabled)
  WHERE stripe_account_id IS NOT NULL;

COMMENT ON COLUMN public.restaurants.stripe_connect_details_submitted IS
  'Stripe Connect indicates the account holder submitted the required onboarding details.';
COMMENT ON COLUMN public.restaurants.stripe_connect_charges_enabled IS
  'Stripe Connect account can accept charges.';
COMMENT ON COLUMN public.restaurants.stripe_connect_payouts_enabled IS
  'Stripe Connect account can receive payouts/transfers.';
COMMENT ON COLUMN public.restaurants.stripe_connect_requirements_due IS
  'Outstanding Stripe Connect verification fields cached from account.requirements.currently_due.';
COMMENT ON COLUMN public.restaurants.stripe_connect_disabled_reason IS
  'Stripe Connect requirements.disabled_reason cached for operational visibility.';

CREATE OR REPLACE FUNCTION public.restaurant_stripe_connect_ready(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT r.stripe_account_id IS NOT NULL
         AND r.stripe_connect_details_submitted
         AND r.stripe_connect_charges_enabled
         AND r.stripe_connect_payouts_enabled
         AND cardinality(r.stripe_connect_requirements_due) = 0
      FROM public.restaurants r
      WHERE r.id = p_restaurant_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.restaurant_stripe_connect_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_stripe_connect_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_stripe_connect_ready(uuid) TO service_role;

COMMENT ON FUNCTION public.restaurant_stripe_connect_ready(uuid) IS
  'Returns true only when a restaurant connected account is fully onboarded and able to receive its 90 percent share.';
