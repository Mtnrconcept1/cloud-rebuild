-- Post-advisor hardening for the Fair Growth migration.
-- Kept separate so the already-applied migration remains immutable.

BEGIN;

-- The VAT catalogue is readable through RLS by every role that can execute
-- this pure resolver, so elevated privileges are unnecessary.
ALTER FUNCTION public.resolve_swiss_vat_rate_bps(text, text, date)
  SECURITY INVOKER;

-- CREATE OR REPLACE VIEW resets this option. Restore the invoker behavior
-- that protects the underlying finance tables and their RLS policies.
ALTER VIEW public.admin_platform_finance_monthly_snapshot
  SET (security_invoker = true);

-- Cover every foreign-key access path introduced by Fair Growth. Besides
-- improving joins, these indexes avoid long locks during parent-row updates.
CREATE INDEX IF NOT EXISTS restaurant_paid_modules_module_idx
  ON public.restaurant_paid_modules (module_id);
CREATE INDEX IF NOT EXISTS restaurant_paid_modules_requested_by_idx
  ON public.restaurant_paid_modules (requested_by);
CREATE INDEX IF NOT EXISTS reservations_acquisition_channel_idx
  ON public.reservations (acquisition_channel_id);
CREATE INDEX IF NOT EXISTS reservation_fee_charges_reservation_restaurant_idx
  ON public.reservation_fee_charges (reservation_id, restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_charges_restaurant_idx
  ON public.reservation_fee_charges (restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_charges_invoice_idx
  ON public.reservation_fee_charges (invoice_id);
CREATE INDEX IF NOT EXISTS reservation_fee_charges_zero_revenue_reviewer_idx
  ON public.reservation_fee_charges (zero_revenue_reviewed_by);
CREATE INDEX IF NOT EXISTS reservation_fee_adjustments_charge_restaurant_idx
  ON public.reservation_fee_adjustments (reservation_fee_charge_id, restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_adjustments_restaurant_idx
  ON public.reservation_fee_adjustments (restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_adjustments_created_by_idx
  ON public.reservation_fee_adjustments (created_by);

DO $fair_growth_post_advisor_assertions$
DECLARE
  v_security_invoker boolean := false;
  v_index_count integer := 0;
BEGIN
  IF (
    SELECT proc.prosecdef
    FROM pg_catalog.pg_proc proc
    WHERE proc.oid =
      'public.resolve_swiss_vat_rate_bps(text,text,date)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Swiss VAT resolver must remain SECURITY INVOKER';
  END IF;

  SELECT COALESCE(
    relation.reloptions @> ARRAY['security_invoker=true']::text[], false
  ) INTO v_security_invoker
  FROM pg_catalog.pg_class relation
  WHERE relation.oid =
    'public.admin_platform_finance_monthly_snapshot'::regclass;
  IF NOT v_security_invoker THEN
    RAISE EXCEPTION 'Finance monthly view must remain SECURITY INVOKER';
  END IF;

  SELECT count(*) INTO v_index_count
  FROM pg_catalog.pg_class index_relation
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = index_relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_relation.relkind = 'i'
    AND index_relation.relname IN (
      'restaurant_paid_modules_module_idx',
      'restaurant_paid_modules_requested_by_idx',
      'reservations_acquisition_channel_idx',
      'reservation_fee_charges_reservation_restaurant_idx',
      'reservation_fee_charges_restaurant_idx',
      'reservation_fee_charges_invoice_idx',
      'reservation_fee_charges_zero_revenue_reviewer_idx',
      'reservation_fee_adjustments_charge_restaurant_idx',
      'reservation_fee_adjustments_restaurant_idx',
      'reservation_fee_adjustments_created_by_idx'
    );
  IF v_index_count <> 10 THEN
    RAISE EXCEPTION 'Fair Growth foreign-key index set is incomplete';
  END IF;
END;
$fair_growth_post_advisor_assertions$;

COMMIT;
