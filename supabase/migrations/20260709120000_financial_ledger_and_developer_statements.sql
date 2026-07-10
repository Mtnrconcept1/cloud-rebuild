-- Audit 10/10 hardening: append-only financial ledger and developer revenue statements.
-- This migration adds the internal source of truth required to reconcile Stripe,
-- restaurant billing, refunds, chargebacks and developer revenue-share without
-- mutating historical accounting rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_ledger (
  entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id text NOT NULL,
  stripe_event_id text REFERENCES public.stripe_webhook_events(event_id) ON DELETE RESTRICT,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  account_code text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'CHF' CHECK (currency = upper(currency) AND char_length(currency) = 3),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  reversal_of uuid REFERENCES public.financial_ledger(entry_id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT financial_ledger_source_not_blank CHECK (btrim(source_type) <> '' AND btrim(source_id) <> ''),
  CONSTRAINT financial_ledger_account_code_not_blank CHECK (btrim(account_code) <> ''),
  CONSTRAINT financial_ledger_no_self_reversal CHECK (reversal_of IS NULL OR reversal_of <> entry_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_ledger_source_account_direction
  ON public.financial_ledger (source_type, source_id, account_code, direction)
  WHERE reversal_of IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_ledger_restaurant_effective
  ON public.financial_ledger (restaurant_id, effective_at DESC)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_ledger_stripe_event
  ON public.financial_ledger (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_ledger_account_effective
  ON public.financial_ledger (account_code, effective_at DESC);

CREATE TABLE IF NOT EXISTS public.developer_statements (
  statement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'CHF' CHECK (currency = upper(currency) AND char_length(currency) = 3),
  reservation_revenue_cents integer NOT NULL DEFAULT 0 CHECK (reservation_revenue_cents >= 0),
  paid_services_revenue_cents integer NOT NULL DEFAULT 0 CHECK (paid_services_revenue_cents >= 0),
  subscription_revenue_cents integer NOT NULL DEFAULT 0 CHECK (subscription_revenue_cents >= 0),
  adjustments_cents integer NOT NULL DEFAULT 0,
  revenue_base_cents integer GENERATED ALWAYS AS (
    reservation_revenue_cents + paid_services_revenue_cents + subscription_revenue_cents + adjustments_cents
  ) STORED,
  developer_share_bps integer NOT NULL DEFAULT 1000 CHECK (developer_share_bps BETWEEN 0 AND 10000),
  developer_amount_cents integer GENERATED ALWAYS AS (
    greatest(0, ((reservation_revenue_cents + paid_services_revenue_cents + subscription_revenue_cents + adjustments_cents) * developer_share_bps) / 10000)
  ) STORED,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'paid', 'voided')),
  validated_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT developer_statements_period_order CHECK (period_start <= period_end),
  CONSTRAINT developer_statements_validated_at_required CHECK (status NOT IN ('validated', 'paid') OR validated_at IS NOT NULL),
  CONSTRAINT developer_statements_paid_at_required CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_developer_statements_period_currency_active
  ON public.developer_statements (period_start, period_end, currency)
  WHERE status <> 'voided';

CREATE INDEX IF NOT EXISTS idx_developer_statements_status_period
  ON public.developer_statements (status, period_start DESC, period_end DESC);

CREATE OR REPLACE FUNCTION public.prevent_financial_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'financial_ledger is append-only; create a reversal or adjustment entry instead';
END;
$$;

DROP TRIGGER IF EXISTS prevent_financial_ledger_update_delete ON public.financial_ledger;
CREATE TRIGGER prevent_financial_ledger_update_delete
BEFORE UPDATE OR DELETE ON public.financial_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_ledger_mutation();

CREATE OR REPLACE FUNCTION public.prevent_locked_developer_statement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('validated', 'paid') THEN
    RAISE EXCEPTION 'validated or paid developer statements are immutable; create an adjustment statement instead';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_developer_statement_update ON public.developer_statements;
CREATE TRIGGER prevent_locked_developer_statement_update
BEFORE UPDATE OR DELETE ON public.developer_statements
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_developer_statement_mutation();

ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_ledger_admin_select ON public.financial_ledger;
CREATE POLICY financial_ledger_admin_select
  ON public.financial_ledger
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS developer_statements_admin_select ON public.developer_statements;
CREATE POLICY developer_statements_admin_select
  ON public.developer_statements
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

REVOKE ALL ON public.financial_ledger FROM anon, authenticated;
REVOKE ALL ON public.developer_statements FROM anon, authenticated;
GRANT SELECT ON public.financial_ledger TO authenticated;
GRANT SELECT ON public.developer_statements TO authenticated;
GRANT SELECT, INSERT ON public.financial_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.developer_statements TO service_role;

REVOKE ALL ON FUNCTION public.prevent_financial_ledger_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_locked_developer_statement_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_financial_ledger_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_locked_developer_statement_mutation() TO service_role;

COMMENT ON TABLE public.financial_ledger IS
  'Append-only internal accounting ledger for Stripe, reservation fees, commissions, subscriptions, refunds, chargebacks and adjustments. Historical entries must be reversed, never mutated.';
COMMENT ON COLUMN public.financial_ledger.amount_cents IS
  'Authoritative integer amount in minor currency units; never store floating money values.';
COMMENT ON TABLE public.developer_statements IS
  'Monthly developer revenue-share statements calculated from Tok-owned revenue only: reservation fees, platform commissions, subscriptions and explicit adjustments.';
COMMENT ON COLUMN public.developer_statements.developer_share_bps IS
  '10% is stored as 1000 basis points. The base excludes restaurant-owned funds, tips, VAT, refunds and chargebacks unless represented as explicit adjustments.';

COMMIT;

NOTIFY pgrst, 'reload schema';
