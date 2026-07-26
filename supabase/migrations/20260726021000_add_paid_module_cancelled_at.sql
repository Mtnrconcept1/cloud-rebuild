-- Repair the Fair Growth paid-module cancellation lifecycle.
-- request_fair_growth_module() resets cancelled_at when a cancelled module is
-- requested again, but the original table migration omitted the column.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtext('tok:restaurant-paid-modules:cancelled-at:v1')
);

DO $preflight$
BEGIN
  IF to_regclass('public.restaurant_paid_modules') IS NULL THEN
    RAISE EXCEPTION 'restaurant_paid_modules is missing';
  END IF;

  IF to_regprocedure('public.request_fair_growth_module(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'request_fair_growth_module(uuid,text) is missing';
  END IF;

  IF pg_get_functiondef(
      'public.request_fair_growth_module(uuid,text)'::regprocedure
    ) NOT ILIKE '%cancelled_at%'
  THEN
    RAISE EXCEPTION 'request_fair_growth_module no longer uses cancelled_at';
  END IF;
END;
$preflight$;

ALTER TABLE public.restaurant_paid_modules
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.restaurant_paid_modules
SET cancelled_at = updated_at
WHERE status = 'cancelled'
  AND cancelled_at IS NULL;

COMMENT ON COLUMN public.restaurant_paid_modules.cancelled_at
IS 'Timestamp at which the paid module was cancelled; cleared when a cancelled module is requested again.';

DO $postflight$
DECLARE
  v_data_type text;
  v_is_nullable text;
BEGIN
  SELECT data_type, is_nullable
  INTO v_data_type, v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'restaurant_paid_modules'
    AND column_name = 'cancelled_at';

  IF v_data_type IS DISTINCT FROM 'timestamp with time zone'
    OR v_is_nullable IS DISTINCT FROM 'YES'
  THEN
    RAISE EXCEPTION 'restaurant_paid_modules.cancelled_at has an invalid definition';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurant_paid_modules
    WHERE status = 'cancelled'
      AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A cancelled paid module is missing cancelled_at';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
