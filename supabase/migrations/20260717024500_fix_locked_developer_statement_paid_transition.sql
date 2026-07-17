-- Follow-up fix for preview databases where 20260717023000 was already recorded.
-- Compare only authoritative immutable fields during the validated -> paid
-- transition. Generated columns are intentionally excluded because their NEW
-- value is not stable in a BEFORE UPDATE trigger.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_locked_developer_statement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('validated', 'paid') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'validated or paid developer statements are immutable; create an adjustment statement instead';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'paid developer statements are immutable; create an adjustment statement instead';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'validated' THEN
    IF NOT (
      NEW.status = 'paid'
      AND NEW.paid_at IS NOT NULL
      AND NEW.statement_id IS NOT DISTINCT FROM OLD.statement_id
      AND NEW.period_start IS NOT DISTINCT FROM OLD.period_start
      AND NEW.period_end IS NOT DISTINCT FROM OLD.period_end
      AND NEW.currency IS NOT DISTINCT FROM OLD.currency
      AND NEW.reservation_revenue_cents IS NOT DISTINCT FROM OLD.reservation_revenue_cents
      AND NEW.paid_services_revenue_cents IS NOT DISTINCT FROM OLD.paid_services_revenue_cents
      AND NEW.subscription_revenue_cents IS NOT DISTINCT FROM OLD.subscription_revenue_cents
      AND NEW.adjustments_cents IS NOT DISTINCT FROM OLD.adjustments_cents
      AND NEW.developer_share_bps IS NOT DISTINCT FROM OLD.developer_share_bps
      AND NEW.developer_amount_cents IS NOT DISTINCT FROM OLD.developer_amount_cents
      AND NEW.validated_at IS NOT DISTINCT FROM OLD.validated_at
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
      AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
      AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'validated developer statements only allow the paid transition';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_locked_developer_statement_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_locked_developer_statement_mutation()
  TO service_role;

COMMIT;
