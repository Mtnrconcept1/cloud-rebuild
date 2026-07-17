-- Contractual developer revenue share across every TOK-owned revenue source.
--
-- Rules:
--   * subscriptions (restaurant and TOK One): 10% developer;
--   * advertising campaigns: 10% developer;
--   * credit packs and every other paid TOK feature: 10% developer;
--   * marketplace orders: 10% of TOK's 10% platform revenue, i.e. 1% gross.
--
-- The rate is intentionally fixed in the database. Changing the commercial
-- agreement must require an explicit audited migration rather than a runtime
-- configuration edit.

BEGIN;

UPDATE public.finance_runtime_config
SET developer_share_bps = 1000,
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'developer_share_contract_scope',
      'all_tok_owned_revenue',
      'developer_share_contract_bps',
      1000,
      'developer_share_contract_locked_at',
      now()
    )
WHERE developer_share_bps IS DISTINCT FROM 1000;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'finance_runtime_config_developer_share_fixed_check'
      AND conrelid = 'public.finance_runtime_config'::regclass
  ) THEN
    ALTER TABLE public.finance_runtime_config
      ADD CONSTRAINT finance_runtime_config_developer_share_fixed_check
      CHECK (developer_share_bps = 1000);
  END IF;
END
$constraint$;

COMMENT ON COLUMN public.finance_runtime_config.developer_share_bps IS
  'Contractual developer share fixed at 1000 bps (10%) of every TOK-owned revenue source: reservations, subscriptions, advertising, credit packs, paid features and TOK marketplace commission.';

-- Statements keep the human-readable revenue families, while the paid-services
-- family deliberately uses a wildcard minus the reserved families. Therefore a
-- future tok_<feature>_revenue account is included automatically rather than
-- silently disappearing from the statement.
CREATE OR REPLACE FUNCTION public.refresh_developer_statement(
  p_period_start date,
  p_period_end date,
  p_currency text DEFAULT 'CHF'
)
RETURNS public.developer_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_reservation integer := 0;
  v_paid_services integer := 0;
  v_subscription integer := 0;
  v_developer_payable integer := 0;
  v_share_bps integer := 1000;
  v_statement public.developer_statements%ROWTYPE;
BEGIN
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_statement_period';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_currency';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'developer-statement:' || p_period_start::text || ':' || p_period_end::text || ':' || v_currency,
    0
  ));

  IF EXISTS (
    SELECT 1
    FROM public.developer_statements d
    WHERE d.period_start = p_period_start
      AND d.period_end = p_period_end
      AND d.currency = v_currency
      AND d.status IN ('validated', 'paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_locked';
  END IF;

  SELECT
    COALESCE(sum(
      CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END
    ) FILTER (
      WHERE l.account_code = 'tok_reservation_revenue'
    ), 0)::integer,
    COALESCE(sum(
      CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END
    ) FILTER (
      WHERE l.account_code LIKE 'tok\_%\_revenue' ESCAPE '\'
        AND l.account_code NOT IN (
          'tok_reservation_revenue',
          'tok_subscription_revenue',
          'tok_one_revenue'
        )
    ), 0)::integer,
    COALESCE(sum(
      CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END
    ) FILTER (
      WHERE l.account_code IN ('tok_subscription_revenue', 'tok_one_revenue')
    ), 0)::integer,
    COALESCE(sum(
      CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END
    ) FILTER (
      WHERE l.account_code = 'developer_payable'
    ), 0)::integer
  INTO v_reservation, v_paid_services, v_subscription, v_developer_payable
  FROM public.financial_ledger l
  WHERE l.currency = v_currency
    AND l.effective_at >= p_period_start::timestamptz
    AND l.effective_at < (p_period_end + 1)::timestamptz
    AND (
      l.source_type NOT LIKE 'stripe\_%' ESCAPE '\'
      OR l.stripe_mode = 'live'
    );

  SELECT frc.developer_share_bps
  INTO v_share_bps
  FROM public.finance_runtime_config frc
  WHERE frc.config_key = 'default';

  IF v_share_bps IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'developer_share_contract_must_equal_1000_bps';
  END IF;

  INSERT INTO public.developer_statements (
    period_start,
    period_end,
    currency,
    reservation_revenue_cents,
    paid_services_revenue_cents,
    subscription_revenue_cents,
    developer_share_bps,
    developer_amount_cents,
    status,
    metadata
  ) VALUES (
    p_period_start,
    p_period_end,
    v_currency,
    v_reservation,
    v_paid_services,
    v_subscription,
    1000,
    v_developer_payable,
    'draft',
    jsonb_build_object(
      'source', 'financial_ledger.developer_payable',
      'calculation', 'exact_net_payable_entries',
      'developer_share_contract_bps', 1000,
      'developer_share_scope', 'all_tok_owned_revenue',
      'future_tok_revenue_accounts_included', true,
      'test_mode_excluded', true,
      'refreshed_at', clock_timestamp()
    )
  )
  ON CONFLICT (period_start, period_end, currency) WHERE status <> 'voided'
  DO UPDATE SET
    reservation_revenue_cents = EXCLUDED.reservation_revenue_cents,
    paid_services_revenue_cents = EXCLUDED.paid_services_revenue_cents,
    subscription_revenue_cents = EXCLUDED.subscription_revenue_cents,
    developer_share_bps = EXCLUDED.developer_share_bps,
    developer_amount_cents = EXCLUDED.developer_amount_cents,
    metadata = EXCLUDED.metadata
  RETURNING * INTO v_statement;

  RETURN v_statement;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_developer_statement(date, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_developer_statement(date, date, text)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
