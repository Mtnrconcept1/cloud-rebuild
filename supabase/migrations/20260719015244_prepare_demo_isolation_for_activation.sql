BEGIN;

-- Production's existing demo isolation constraint predates active commercial
-- demonstrations and requires every demo restaurant to stay inactive. Relax
-- only that obsolete activity predicate before the activation migration runs.
-- Status, visibility and every Stripe Connect safeguard remain mandatory.
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

COMMIT;
