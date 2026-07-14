-- Defense in depth: simulated commercial journeys must never become revenue,
-- commission, restaurant payable, developer payable, or accounting entries.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_ledger_reject_commercial_demo'
      AND conrelid = 'public.financial_ledger'::regclass
  ) THEN
    ALTER TABLE public.financial_ledger
      ADD CONSTRAINT financial_ledger_reject_commercial_demo
      CHECK (
        lower(btrim(COALESCE(metadata ->> 'checkout_kind', ''))) <> 'commercial-demo-order'
        AND lower(btrim(COALESCE(metadata ->> 'demo_environment', ''))) <> 'commercial_demo'
        AND lower(btrim(COALESCE(metadata ->> 'finance_routing_mode', ''))) <> 'demo_isolated'
        AND lower(btrim(COALESCE(metadata ->> 'no_financial_ledger', 'false'))) <> 'true'
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_revenue_reject_commercial_demo'
      AND conrelid = 'public.platform_revenue_entries'::regclass
  ) THEN
    ALTER TABLE public.platform_revenue_entries
      ADD CONSTRAINT platform_revenue_reject_commercial_demo
      CHECK (
        lower(btrim(COALESCE(metadata ->> 'checkout_kind', ''))) <> 'commercial-demo-order'
        AND lower(btrim(COALESCE(metadata ->> 'demo_environment', ''))) <> 'commercial_demo'
        AND lower(btrim(COALESCE(metadata ->> 'finance_routing_mode', ''))) <> 'demo_isolated'
        AND lower(btrim(COALESCE(metadata ->> 'no_financial_ledger', 'false'))) <> 'true'
      ) NOT VALID;
  END IF;
END
$$;

COMMENT ON CONSTRAINT financial_ledger_reject_commercial_demo ON public.financial_ledger IS
  'Rejects commercial Stripe Test demo rows even if an application-level guard regresses.';
COMMENT ON CONSTRAINT platform_revenue_reject_commercial_demo ON public.platform_revenue_entries IS
  'Rejects commercial Stripe Test demo revenue even if an application-level guard regresses.';

COMMIT;
