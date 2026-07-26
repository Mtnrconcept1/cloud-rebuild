BEGIN;

-- Match Group is a marketplace payment: restaurant 90%, TOK 9%, developer 1%.
-- Use the split snapshot sealed on the Stripe authorization, never a later
-- mutable runtime value, when the partial capture is entered in the ledger.
CREATE OR REPLACE FUNCTION public.record_marketplace_checkout_ledger(
  p_stripe_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_checkout_kind text,
  p_restaurant_id uuid,
  p_gross_cents integer,
  p_currency text DEFAULT 'CHF',
  p_livemode boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_type text DEFAULT 'stripe_checkout'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(btrim(COALESCE(p_checkout_kind, '')));
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_platform_fee_bps integer;
  v_developer_share_bps integer;
  v_platform_revenue_cents integer;
  v_restaurant_share_cents integer;
  v_developer_share_cents integer;
  v_revenue_account text;
  v_revenue_source text;
  v_is_marketplace boolean;
  v_metadata jsonb;
  v_source_type text := lower(btrim(COALESCE(p_source_type, 'stripe_checkout')));
BEGIN
  IF p_stripe_event_id IS NULL OR btrim(p_stripe_event_id) = '' THEN
    RAISE EXCEPTION 'stripe_event_id_required';
  END IF;
  IF p_checkout_session_id IS NULL OR btrim(p_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'checkout_session_id_required';
  END IF;
  IF p_gross_cents IS NULL OR p_gross_cents <= 0 THEN
    RAISE EXCEPTION 'gross_cents_must_be_positive';
  END IF;
  IF v_currency <> 'CHF' THEN
    RAISE EXCEPTION 'unsupported_currency';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_webhook_events e WHERE e.event_id = p_stripe_event_id
  ) THEN
    RAISE EXCEPTION 'stripe_event_not_claimed';
  END IF;
  IF v_source_type NOT IN ('stripe_checkout', 'stripe_invoice') THEN
    RAISE EXCEPTION 'invalid_finance_source_type';
  END IF;

  SELECT platform_fee_bps, developer_share_bps
  INTO v_platform_fee_bps, v_developer_share_bps
  FROM public.finance_runtime_config
  WHERE config_key = 'default';

  -- The Stripe authorization seals the applicable split in metadata. Use that
  -- immutable snapshot for later partial capture and ledger reconciliation.
  v_platform_fee_bps := CASE
    WHEN COALESCE(p_metadata ->> 'platform_fee_bps', '') ~ '^[0-9]{1,5}$'
      THEN (p_metadata ->> 'platform_fee_bps')::integer
    ELSE COALESCE(v_platform_fee_bps, 1000)
  END;
  v_developer_share_bps := CASE
    WHEN COALESCE(p_metadata ->> 'developer_share_bps', '') ~ '^[0-9]{1,5}$'
      THEN (p_metadata ->> 'developer_share_bps')::integer
    ELSE COALESCE(v_developer_share_bps, 1000)
  END;
  IF v_platform_fee_bps NOT BETWEEN 0 AND 10000
    OR v_developer_share_bps NOT BETWEEN 0 AND 10000
  THEN
    RAISE EXCEPTION 'invalid_finance_split_snapshot';
  END IF;
  v_is_marketplace := v_kind IN ('order', 'zero-attente', 'chefs-table', 'match-group');

  IF v_is_marketplace AND p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_required_for_marketplace_payment';
  END IF;

  v_platform_revenue_cents := CASE
    WHEN v_is_marketplace THEN round((p_gross_cents::numeric * v_platform_fee_bps) / 10000)::integer
    ELSE p_gross_cents
  END;
  v_platform_revenue_cents := greatest(0, least(p_gross_cents, v_platform_revenue_cents));
  v_restaurant_share_cents := p_gross_cents - v_platform_revenue_cents;
  v_developer_share_cents := round((v_platform_revenue_cents::numeric * v_developer_share_bps) / 10000)::integer;

  v_revenue_account := CASE
    WHEN v_is_marketplace THEN 'tok_platform_commission_revenue'
    WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'tok_subscription_revenue'
    WHEN v_kind = 'tok-one' THEN 'tok_one_revenue'
    WHEN v_kind = 'restaurant-credit-pack' THEN 'tok_credit_pack_revenue'
    WHEN v_kind = 'campaign' THEN 'tok_campaign_revenue'
    ELSE 'tok_other_revenue'
  END;

  v_revenue_source := CASE
    WHEN v_is_marketplace THEN 'other'
    WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'subscription'
    WHEN v_kind = 'tok-one' THEN 'tok_one'
    WHEN v_kind = 'restaurant-credit-pack' THEN 'pack'
    WHEN v_kind = 'campaign' THEN 'sponsorship'
    ELSE 'other'
  END;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'checkout_kind', v_kind,
    'checkout_session_id', p_checkout_session_id,
    'payment_intent_id', p_payment_intent_id,
    'gross_cents', p_gross_cents,
    'platform_revenue_cents', v_platform_revenue_cents,
    'restaurant_share_cents', v_restaurant_share_cents,
    'platform_fee_bps', v_platform_fee_bps,
    'developer_share_bps', v_developer_share_bps,
    'livemode', p_livemode
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id, account_code,
    direction, amount_cents, currency, metadata
  ) VALUES (
    v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
    'payment_asset', 'debit', p_gross_cents, v_currency, v_metadata
  ) ON CONFLICT DO NOTHING;

  IF v_restaurant_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'restaurant_payable', 'credit', v_restaurant_share_cents, v_currency, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id, account_code,
    direction, amount_cents, currency, metadata
  ) VALUES (
    v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
    v_revenue_account, 'credit', v_platform_revenue_cents, v_currency, v_metadata
  ) ON CONFLICT DO NOTHING;

  IF v_developer_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, metadata
    ) VALUES
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_revenue_share_expense', 'debit', v_developer_share_cents, v_currency, v_metadata),
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_payable', 'credit', v_developer_share_cents, v_currency, v_metadata)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.platform_revenue_entries (
    revenue_source, restaurant_id, amount_chf, currency, occurred_at,
    stripe_payment_intent_id, stripe_checkout_session_id, stripe_invoice_id, metadata
  ) VALUES (
    v_revenue_source, p_restaurant_id, v_platform_revenue_cents::numeric / 100,
    v_currency, now(), p_payment_intent_id,
    CASE WHEN v_source_type = 'stripe_checkout' THEN p_checkout_session_id ELSE NULL END,
    CASE WHEN v_source_type = 'stripe_invoice' THEN p_checkout_session_id ELSE NULL END,
    v_metadata
  ) ON CONFLICT DO NOTHING;
END;
$$;

-- Global platform totals are reachable only through admin-guarded wrappers.
REVOKE EXECUTE ON FUNCTION public.build_accounting_month_official_totals(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_accounting_month_official_totals(date)
  TO service_role;

-- A draft cannot be approved unless it has been freshly rebuilt from the live
-- developer_payable ledger and its amount matches a transactionally locked
-- checksum of the underlying entries.
CREATE OR REPLACE FUNCTION public.admin_validate_developer_statement(
  p_statement_id uuid,
  p_expected_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_statement public.developer_statements%ROWTYPE;
  v_ledger_amount_cents integer := 0;
  v_ledger_checksum text;
  v_ledger_cutoff timestamptz := clock_timestamp();
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;

  SELECT *
  INTO v_statement
  FROM public.developer_statements
  WHERE statement_id = p_statement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'developer_statement_not_found';
  END IF;
  IF v_statement.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_not_draft';
  END IF;
  IF v_statement.developer_share_bps <> 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_share_contract_must_equal_1000_bps';
  END IF;
  IF COALESCE(v_statement.metadata ->> 'source', '') <> 'financial_ledger.developer_payable' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_stale_refresh_required';
  END IF;

  -- Freeze ledger writes for the short validation transaction, then bind the
  -- approved amount to an immutable checksum of the exact payable entries.
  LOCK TABLE public.financial_ledger IN SHARE MODE;
  SELECT
    COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount_cents ELSE -l.amount_cents END), 0)::integer,
    md5(COALESCE(string_agg(
      concat_ws(':', l.entry_id::text, l.direction, l.amount_cents::text, l.currency),
      ',' ORDER BY l.entry_id::text
    ), ''))
  INTO v_ledger_amount_cents, v_ledger_checksum
  FROM public.financial_ledger l
  WHERE l.account_code = 'developer_payable'
    AND l.currency = v_statement.currency
    AND l.effective_at >= v_statement.period_start::timestamptz
    AND l.effective_at < (v_statement.period_end + 1)::timestamptz
    AND (
      l.source_type NOT LIKE 'stripe\_%' ESCAPE '\'
      OR l.stripe_mode = 'live'
    );

  IF v_statement.developer_amount_cents IS DISTINCT FROM v_ledger_amount_cents THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_stale_refresh_required';
  END IF;
  IF v_ledger_amount_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_has_no_positive_payable';
  END IF;
  IF p_expected_amount_cents IS NULL OR p_expected_amount_cents <> v_ledger_amount_cents THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_amount_confirmation_mismatch';
  END IF;

  UPDATE public.developer_statements
  SET status = 'validated',
      validated_at = v_ledger_cutoff,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'validated_ledger_amount_cents', v_ledger_amount_cents,
        'validated_ledger_checksum', v_ledger_checksum,
        'validated_ledger_cutoff', v_ledger_cutoff,
        'validated_by', v_actor
      )
  WHERE statement_id = p_statement_id
  RETURNING * INTO v_statement;

  RETURN jsonb_build_object(
    'ok', true,
    'statement_id', v_statement.statement_id,
    'status', v_statement.status,
    'amount_cents', v_statement.developer_amount_cents,
    'currency', v_statement.currency,
    'ledger_checksum', v_ledger_checksum,
    'ledger_cutoff', v_ledger_cutoff
  );
END;
$$;

-- Historical data is clean, so enforce the demo isolation checks for all rows.
ALTER TABLE public.financial_ledger
  VALIDATE CONSTRAINT financial_ledger_reject_commercial_demo;
ALTER TABLE public.platform_revenue_entries
  VALIDATE CONSTRAINT platform_revenue_reject_commercial_demo;

-- Never persist the cron shared secret as plaintext inside cron.job.command.
DO $scheduler$
BEGIN
  IF private.tok_is_production_cluster() IS NOT TRUE THEN
    RAISE NOTICE
      'Production-targeting cron schedule skipped outside the Production cluster';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'internal_cron_secret'
      AND NULLIF(decrypted_secret, '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'internal_cron_secret_missing';
  END IF;

  PERFORM cron.unschedule(job.jobid)
  FROM cron.job job
  WHERE job.jobname = 'commercial-demo-ai-storage-cleanup';

  PERFORM cron.schedule(
    'commercial-demo-ai-storage-cleanup',
    '*/5 * * * *',
    $command$
      SELECT net.http_post(
        url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/commercial-demo-ai',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-cron-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'internal_cron_secret'
              AND NULLIF(decrypted_secret, '') IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT 1
          )
        ),
        body := '{"action":"maintenance_cleanup"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $command$
  );
END
$scheduler$;

REVOKE EXECUTE ON FUNCTION public.record_marketplace_checkout_ledger(
  text, text, text, text, uuid, integer, text, boolean, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketplace_checkout_ledger(
  text, text, text, text, uuid, integer, text, boolean, jsonb, text
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
