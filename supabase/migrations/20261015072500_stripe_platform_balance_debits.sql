-- Separate Stripe Climate and Billing balance debits from processing fees.
-- Only an authenticated service-role worker can post these verified Stripe amounts.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_cost_entries_stripe_balance_transaction
ON public.platform_cost_entries (invoice_reference)
WHERE cost_source = 'stripe'
  AND vendor = 'Stripe balance'
  AND invoice_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_stripe_platform_balance_debit(
  p_stripe_balance_transaction_id text,
  p_stripe_account_id text,
  p_balance_type text,
  p_reporting_category text,
  p_amount_cents integer,
  p_fee_cents integer,
  p_net_cents integer,
  p_currency text,
  p_effective_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expense_account text;
  v_expense_cents integer;
  v_metadata jsonb;
  v_ledger_count integer;
  v_matching_ledger_count integer;
  v_cost_count integer;
  v_matching_cost_count integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role required';
  END IF;
  IF p_stripe_account_id IS DISTINCT FROM 'acct_1SHGJ2GTQigE34su'
    OR COALESCE(p_stripe_balance_transaction_id, '') !~ '^txn_[A-Za-z0-9]+$'
    OR p_currency IS DISTINCT FROM 'CHF'
    OR p_effective_at IS NULL OR p_effective_at > now() + interval '1 hour'
    OR p_effective_at < '2020-01-01'::timestamptz
    OR p_amount_cents IS NULL OR p_amount_cents > 0
    OR p_fee_cents IS NULL OR p_fee_cents < 0
    OR p_net_cents IS NULL OR p_net_cents >= 0
    OR p_net_cents < -1000000000
    OR p_net_cents <> p_amount_cents - p_fee_cents
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Stripe balance debit';
  END IF;
  IF p_balance_type = 'stripe_fee' AND p_reporting_category = 'fee' THEN
    v_expense_account := 'stripe_platform_fee_expense';
  ELSIF p_balance_type = 'contribution' AND p_reporting_category = 'contribution' THEN
    v_expense_account := 'stripe_climate_contribution_expense';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported Stripe debit category';
  END IF;
  v_expense_cents := -p_net_cents;
  v_metadata := jsonb_build_object(
    'stripe_balance_transaction_id', p_stripe_balance_transaction_id,
    'stripe_account_id', p_stripe_account_id,
    'balance_transaction_type', p_balance_type,
    'reporting_category', p_reporting_category,
    'balance_amount_cents', p_amount_cents,
    'balance_fee_cents', p_fee_cents,
    'balance_net_cents', p_net_cents,
    'stripe_mode', 'live'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tok:stripe_balance_debit:' || p_stripe_balance_transaction_id, 0)
  );
  SELECT count(*)::integer,
    count(*) FILTER (
      WHERE ledger.amount_cents = v_expense_cents
        AND ledger.currency = 'CHF'
        AND ledger.stripe_mode = 'live'
        AND ledger.livemode IS TRUE
        AND ledger.effective_at = p_effective_at
        AND ledger.metadata ->> 'stripe_account_id' = p_stripe_account_id
        AND ledger.metadata ->> 'balance_transaction_type' = p_balance_type
        AND (
          (ledger.account_code = v_expense_account AND ledger.direction = 'debit')
          OR (ledger.account_code = 'payment_asset' AND ledger.direction = 'credit')
        )
    )::integer
  INTO v_ledger_count, v_matching_ledger_count
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = 'stripe_balance_debit'
    AND ledger.source_id = p_stripe_balance_transaction_id;
  SELECT count(*)::integer,
    count(*) FILTER (
      WHERE cost.amount_chf = v_expense_cents::numeric / 100
        AND cost.currency = 'CHF'
        AND cost.incurred_at = p_effective_at
        AND cost.metadata ->> 'stripe_account_id' = p_stripe_account_id
        AND cost.metadata ->> 'balance_transaction_type' = p_balance_type
    )::integer
  INTO v_cost_count, v_matching_cost_count
  FROM public.platform_cost_entries cost
  WHERE cost.cost_source = 'stripe'
    AND cost.vendor = 'Stripe balance'
    AND cost.invoice_reference = p_stripe_balance_transaction_id;
  IF v_ledger_count > 0 OR v_cost_count > 0 THEN
    IF v_ledger_count <> 2 OR v_matching_ledger_count <> 2
      OR v_cost_count <> 1 OR v_matching_cost_count <> 1
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'stripe_platform_balance_idempotency_conflict';
    END IF;
    RETURN false;
  END IF;
  INSERT INTO public.financial_ledger (
    source_type, source_id, restaurant_id, stripe_event_id,
    account_code, direction, amount_cents, currency, effective_at,
    stripe_mode, livemode, metadata
  ) VALUES
    ('stripe_balance_debit', p_stripe_balance_transaction_id, NULL, NULL,
      v_expense_account, 'debit', v_expense_cents, 'CHF', p_effective_at,
      'live', true, v_metadata),
    ('stripe_balance_debit', p_stripe_balance_transaction_id, NULL, NULL,
      'payment_asset', 'credit', v_expense_cents, 'CHF', p_effective_at,
      'live', true, v_metadata);
  INSERT INTO public.platform_cost_entries (
    cost_source, restaurant_id, amount_chf, currency, incurred_at, period_month,
    vendor, invoice_reference, metadata
  ) VALUES (
    'stripe', NULL, v_expense_cents::numeric / 100, 'CHF', p_effective_at,
    pg_catalog.date_trunc('month', p_effective_at)::date,
    'Stripe balance', p_stripe_balance_transaction_id, v_metadata
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_stripe_platform_balance_debit(
  text,text,text,text,integer,integer,integer,text,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_platform_balance_debit(
  text,text,text,text,integer,integer,integer,text,timestamptz
) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
