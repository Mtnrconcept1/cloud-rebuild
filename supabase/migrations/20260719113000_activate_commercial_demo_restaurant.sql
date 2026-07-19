BEGIN;

-- Commercial demonstrations use the real restaurant dashboard and therefore
-- need an active restaurant row. The demo marker, dedicated session mapping,
-- test-only checkout endpoint and null Stripe Connect fields remain mandatory.
ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_demo_isolation_check;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_demo_isolation_check
  CHECK (
    is_demo IS FALSE
    OR (
      COALESCE(is_featured, false) IS FALSE
      AND status = 'demo'
      AND stripe_account_id IS NULL
      AND stripe_connect_details_submitted IS FALSE
      AND stripe_connect_charges_enabled IS FALSE
      AND stripe_connect_payouts_enabled IS FALSE
    )
  );

UPDATE public.restaurants
SET is_active = true,
    updated_at = now()
WHERE is_demo IS TRUE
  AND COALESCE(is_active, false) IS FALSE;

COMMIT;
