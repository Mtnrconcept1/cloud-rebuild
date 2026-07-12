-- Production finance completion: Stripe Connect routing configuration, balanced
-- ledger writes, proportional refund reversals and developer statements.

BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_runtime_config (
  config_key text PRIMARY KEY DEFAULT 'default' CHECK (config_key = 'default'),
  connect_routing_enabled boolean NOT NULL DEFAULT false,
  platform_fee_bps integer NOT NULL DEFAULT 1000 CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  developer_share_bps integer NOT NULL DEFAULT 1000 CHECK (developer_share_bps BETWEEN 0 AND 10000),
  reservation_fee_cents integer NOT NULL DEFAULT 500 CHECK (reservation_fee_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.finance_runtime_config (config_key)
VALUES ('default')
ON CONFLICT (config_key) DO NOTHING;

ALTER TABLE public.finance_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_runtime_config_admin_select ON public.finance_runtime_config;
CREATE POLICY finance_runtime_config_admin_select
  ON public.finance_runtime_config
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

REVOKE ALL ON public.finance_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_runtime_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.finance_runtime_config TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_revenue_entries_checkout_source
  ON public.platform_revenue_entries (stripe_checkout_session_id, revenue_source)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE public.platform_revenue_entries
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_revenue_entries_stripe_invoice_source
  ON public.platform_revenue_entries (stripe_invoice_id, revenue_source)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_cost_entries_stripe_refund
  ON public.platform_cost_entries (invoice_reference, vendor)
  WHERE vendor = 'Stripe refund' AND invoice_reference IS NOT NULL;

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

  v_platform_fee_bps := COALESCE(v_platform_fee_bps, 1000);
  v_developer_share_bps := COALESCE(v_developer_share_bps, 1000);
  v_is_marketplace := v_kind IN ('order', 'zero-attente', 'chefs-table');

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

CREATE OR REPLACE FUNCTION public.record_marketplace_refund_ledger(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_refund_source_id text,
  p_refund_amount_cents integer,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_original_source_id text;
  v_restaurant_id uuid;
  v_gross_cents integer;
  v_platform_revenue_cents integer;
  v_restaurant_share_cents integer;
  v_revenue_account text;
  v_developer_share_bps integer;
  v_prior_refund_cents integer;
  v_prior_platform_refund_cents integer;
  v_prior_developer_refund_cents integer;
  v_platform_refund_cents integer;
  v_restaurant_refund_cents integer;
  v_developer_refund_cents integer;
  v_target_platform_refund_cents integer;
  v_target_developer_refund_cents integer;
  v_metadata jsonb;
BEGIN
  IF p_stripe_event_id IS NULL OR btrim(p_stripe_event_id) = '' THEN
    RAISE EXCEPTION 'stripe_event_id_required';
  END IF;
  IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
    RAISE EXCEPTION 'payment_intent_id_required';
  END IF;
  IF p_refund_source_id IS NULL OR btrim(p_refund_source_id) = '' THEN
    RAISE EXCEPTION 'refund_source_id_required';
  END IF;
  IF p_refund_amount_cents IS NULL OR p_refund_amount_cents <= 0 THEN
    RAISE EXCEPTION 'refund_amount_must_be_positive';
  END IF;

  SELECT l.source_id, l.restaurant_id, l.amount_cents
  INTO v_original_source_id, v_restaurant_id, v_gross_cents
  FROM public.financial_ledger l
  WHERE l.source_type = 'stripe_checkout'
    AND l.account_code = 'payment_asset'
    AND l.direction = 'debit'
    AND l.metadata ->> 'payment_intent_id' = p_payment_intent_id
  ORDER BY l.created_at
  LIMIT 1;

  IF v_original_source_id IS NULL THEN
    v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'payment_intent_id', p_payment_intent_id,
      'refund_amount_cents', p_refund_amount_cents,
      'reconciliation_status', 'original_payment_ledger_missing'
    );

    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, account_code,
      direction, amount_cents, currency, metadata
    ) VALUES
      ('stripe_refund', p_refund_source_id, p_stripe_event_id,
       'payment_asset', 'credit', p_refund_amount_cents, v_currency, v_metadata),
      ('stripe_refund', p_refund_source_id, p_stripe_event_id,
       'finance_reconciliation_suspense', 'debit', p_refund_amount_cents, v_currency, v_metadata)
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  SELECT l.account_code, l.amount_cents
  INTO v_revenue_account, v_platform_revenue_cents
  FROM public.financial_ledger l
  WHERE l.source_type = 'stripe_checkout'
    AND l.source_id = v_original_source_id
    AND l.direction = 'credit'
    AND l.account_code LIKE 'tok\_%\_revenue' ESCAPE '\'
  ORDER BY l.created_at
  LIMIT 1;

  SELECT COALESCE(sum(l.amount_cents), 0)::integer
  INTO v_restaurant_share_cents
  FROM public.financial_ledger l
  WHERE l.source_type = 'stripe_checkout'
    AND l.source_id = v_original_source_id
    AND l.account_code = 'restaurant_payable'
    AND l.direction = 'credit';

  SELECT developer_share_bps
  INTO v_developer_share_bps
  FROM public.finance_runtime_config
  WHERE config_key = 'default';
  v_developer_share_bps := COALESCE(v_developer_share_bps, 1000);

  SELECT COALESCE(sum(l.amount_cents), 0)::integer
  INTO v_prior_refund_cents
  FROM public.financial_ledger l
  WHERE l.source_type = 'stripe_refund'
    AND l.account_code = 'payment_asset'
    AND l.direction = 'credit'
    AND l.metadata ->> 'payment_intent_id' = p_payment_intent_id;

  IF v_prior_refund_cents + p_refund_amount_cents > v_gross_cents THEN
    RAISE EXCEPTION 'refund_exceeds_original_payment';
  END IF;

  SELECT COALESCE(sum(l.amount_cents), 0)::integer
  INTO v_prior_platform_refund_cents
  FROM public.financial_ledger l
  WHERE l.source_type = 'stripe_refund'
    AND l.direction = 'debit'
    AND l.account_code = v_revenue_account
    AND l.metadata ->> 'payment_intent_id' = p_payment_intent_id;

  SELECT COALESCE(sum(l.amount_cents), 0)::integer
  INTO v_prior_developer_refund_cents
  FROM public.financial_ledger l
  WHERE l.source_type = 'stripe_refund'
    AND l.direction = 'credit'
    AND l.account_code = 'developer_revenue_share_expense'
    AND l.metadata ->> 'payment_intent_id' = p_payment_intent_id;

  v_target_platform_refund_cents := CASE
    WHEN v_prior_refund_cents + p_refund_amount_cents = v_gross_cents THEN v_platform_revenue_cents
    ELSE round(((v_prior_refund_cents + p_refund_amount_cents)::numeric * v_platform_revenue_cents) / v_gross_cents)::integer
  END;
  v_platform_refund_cents := greatest(0, v_target_platform_refund_cents - v_prior_platform_refund_cents);
  v_restaurant_refund_cents := p_refund_amount_cents - v_platform_refund_cents;
  v_target_developer_refund_cents := round((v_target_platform_refund_cents::numeric * v_developer_share_bps) / 10000)::integer;
  v_developer_refund_cents := greatest(0, v_target_developer_refund_cents - v_prior_developer_refund_cents);

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'original_checkout_session_id', v_original_source_id,
    'refund_amount_cents', p_refund_amount_cents,
    'platform_refund_cents', v_platform_refund_cents,
    'restaurant_refund_cents', v_restaurant_refund_cents,
    'developer_refund_cents', v_developer_refund_cents
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id, account_code,
    direction, amount_cents, currency, metadata
  ) VALUES (
    'stripe_refund', p_refund_source_id, p_stripe_event_id, v_restaurant_id,
    'payment_asset', 'credit', p_refund_amount_cents, v_currency, v_metadata
  ) ON CONFLICT DO NOTHING;

  IF v_restaurant_refund_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, metadata
    ) VALUES (
      'stripe_refund', p_refund_source_id, p_stripe_event_id, v_restaurant_id,
      'restaurant_payable', 'debit', v_restaurant_refund_cents, v_currency, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_platform_refund_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, metadata
    ) VALUES (
      'stripe_refund', p_refund_source_id, p_stripe_event_id, v_restaurant_id,
      v_revenue_account, 'debit', v_platform_refund_cents, v_currency, v_metadata
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.platform_cost_entries (
      cost_source, restaurant_id, amount_chf, currency, incurred_at, vendor,
      invoice_reference, metadata
    ) VALUES (
      'other', v_restaurant_id, v_platform_refund_cents::numeric / 100,
      v_currency, now(), 'Stripe refund', p_refund_source_id, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_developer_refund_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, metadata
    ) VALUES
      ('stripe_refund', p_refund_source_id, p_stripe_event_id, v_restaurant_id,
       'developer_revenue_share_expense', 'credit', v_developer_refund_cents, v_currency, v_metadata),
      ('stripe_refund', p_refund_source_id, p_stripe_event_id, v_restaurant_id,
       'developer_payable', 'debit', v_developer_refund_cents, v_currency, v_metadata)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS private_finance;
REVOKE ALL ON SCHEMA private_finance FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private_finance.record_paid_restaurant_invoice(
  p_invoice_id uuid,
  p_allow_stripe_generated boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance
AS $$
DECLARE
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_total_cents integer;
  v_reservation_cents integer;
  v_platform_commission_cents integer;
  v_subscription_cents integer;
  v_campaign_cents integer;
  v_credit_pack_cents integer;
  v_other_cents integer;
  v_developer_share_bps integer;
  v_developer_share_cents integer;
  v_metadata jsonb;
BEGIN
  SELECT * INTO v_invoice
  FROM public.restaurant_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND OR v_invoice.invoice_type <> 'payable' OR v_invoice.status <> 'paid' THEN
    RETURN;
  END IF;
  IF NOT p_allow_stripe_generated AND COALESCE(v_invoice.invoice_number, '') LIKE 'TOK-PAID-%' THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(sum(round(li.amount_ht * 100)) FILTER (WHERE li.item_kind = 'reservation_fee'), 0)::integer,
    COALESCE(sum(round(li.amount_ht * 100)) FILTER (WHERE li.item_kind IN ('order_commission', 'reservation_commission')), 0)::integer,
    COALESCE(sum(round(li.amount_ht * 100)) FILTER (WHERE li.item_kind = 'restaurant_subscription'), 0)::integer,
    COALESCE(sum(round(li.amount_ht * 100)) FILTER (WHERE li.item_kind = 'campaign_payment'), 0)::integer,
    COALESCE(sum(round(li.amount_ht * 100)) FILTER (WHERE li.item_kind = 'credit_pack'), 0)::integer,
    COALESCE(sum(round(li.amount_ht * 100)) FILTER (
      WHERE li.item_kind NOT IN (
        'reservation_fee', 'order_commission', 'reservation_commission',
        'restaurant_subscription', 'campaign_payment', 'credit_pack'
      )
    ), 0)::integer
  INTO
    v_reservation_cents,
    v_platform_commission_cents,
    v_subscription_cents,
    v_campaign_cents,
    v_credit_pack_cents,
    v_other_cents
  FROM public.restaurant_invoice_line_items li
  WHERE li.invoice_id = v_invoice.id;

  v_total_cents := v_reservation_cents + v_platform_commission_cents
    + v_subscription_cents + v_campaign_cents + v_credit_pack_cents + v_other_cents;
  IF v_total_cents <= 0 THEN
    v_total_cents := greatest(0, round(COALESCE(v_invoice.amount_ht, 0) * 100)::integer);
    v_other_cents := v_total_cents;
  END IF;
  IF v_total_cents <= 0 THEN RETURN; END IF;

  SELECT developer_share_bps INTO v_developer_share_bps
  FROM public.finance_runtime_config WHERE config_key = 'default';
  v_developer_share_bps := COALESCE(v_developer_share_bps, 1000);
  v_developer_share_cents := round((v_total_cents::numeric * v_developer_share_bps) / 10000)::integer;
  v_metadata := jsonb_build_object(
    'restaurant_invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_type', v_invoice.invoice_type,
    'recognized_excluding_vat', true,
    'developer_share_bps', v_developer_share_bps
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, restaurant_id, account_code, direction,
    amount_cents, currency, effective_at, metadata
  ) VALUES (
    'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
    'payment_asset', 'debit', v_total_cents, 'CHF',
    COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
  ) ON CONFLICT DO NOTHING;

  IF v_reservation_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_reservation_revenue', 'credit', v_reservation_cents, 'CHF',
      COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_platform_commission_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_platform_commission_revenue', 'credit', v_platform_commission_cents, 'CHF',
      COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_subscription_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_subscription_revenue', 'credit', v_subscription_cents, 'CHF',
      COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_campaign_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_campaign_revenue', 'credit', v_campaign_cents, 'CHF',
      COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_credit_pack_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_credit_pack_revenue', 'credit', v_credit_pack_cents, 'CHF',
      COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_other_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_other_revenue', 'credit', v_other_cents, 'CHF',
      COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_developer_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES
      ('restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
       'developer_revenue_share_expense', 'debit', v_developer_share_cents, 'CHF',
       COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata),
      ('restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
       'developer_payable', 'credit', v_developer_share_cents, 'CHF',
       COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.platform_revenue_entries (
    revenue_source, restaurant_id, amount_chf, currency, occurred_at, metadata
  )
  SELECT
    'other', v_invoice.restaurant_id, v_total_cents::numeric / 100, 'CHF',
    COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now()), v_metadata
  WHERE NOT EXISTS (
    SELECT 1 FROM public.platform_revenue_entries pre
    WHERE pre.metadata ->> 'restaurant_invoice_id' = v_invoice.id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.record_paid_restaurant_invoice_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance
AS $$
BEGIN
  IF NEW.invoice_type = 'payable'
     AND NEW.status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM private_finance.record_paid_restaurant_invoice(NEW.id, false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_paid_restaurant_invoice_finance ON public.restaurant_invoices;
CREATE TRIGGER record_paid_restaurant_invoice_finance
AFTER INSERT OR UPDATE OF status ON public.restaurant_invoices
FOR EACH ROW EXECUTE FUNCTION private_finance.record_paid_restaurant_invoice_trigger();

-- Historical backfill is idempotent. Stripe-generated paid invoices are included
-- once because no checkout ledger existed before this migration.
DO $$
DECLARE
  v_invoice_id uuid;
BEGIN
  FOR v_invoice_id IN
    SELECT id FROM public.restaurant_invoices
    WHERE invoice_type = 'payable' AND status = 'paid'
  LOOP
    PERFORM private_finance.record_paid_restaurant_invoice(v_invoice_id, true);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_developer_statement(
  p_period_start date,
  p_period_end date,
  p_currency text DEFAULT 'CHF'
)
RETURNS public.developer_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text := upper(btrim(COALESCE(p_currency, 'CHF')));
  v_reservation integer;
  v_paid_services integer;
  v_subscription integer;
  v_share_bps integer;
  v_statement public.developer_statements%ROWTYPE;
BEGIN
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'invalid_statement_period';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.developer_statements d
    WHERE d.period_start = p_period_start
      AND d.period_end = p_period_end
      AND d.currency = v_currency
      AND d.status IN ('validated', 'paid')
  ) THEN
    RAISE EXCEPTION 'developer_statement_locked';
  END IF;

  SELECT COALESCE(sum(CASE WHEN direction = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer
  INTO v_reservation
  FROM public.financial_ledger
  WHERE account_code = 'tok_reservation_revenue'
    AND currency = v_currency
    AND effective_at::date BETWEEN p_period_start AND p_period_end;

  SELECT COALESCE(sum(CASE WHEN direction = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer
  INTO v_paid_services
  FROM public.financial_ledger
  WHERE account_code IN (
      'tok_platform_commission_revenue', 'tok_campaign_revenue',
      'tok_credit_pack_revenue', 'tok_other_revenue'
    )
    AND currency = v_currency
    AND effective_at::date BETWEEN p_period_start AND p_period_end;

  SELECT COALESCE(sum(CASE WHEN direction = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::integer
  INTO v_subscription
  FROM public.financial_ledger
  WHERE account_code IN ('tok_subscription_revenue', 'tok_one_revenue')
    AND currency = v_currency
    AND effective_at::date BETWEEN p_period_start AND p_period_end;

  SELECT developer_share_bps INTO v_share_bps
  FROM public.finance_runtime_config WHERE config_key = 'default';

  INSERT INTO public.developer_statements (
    period_start, period_end, currency, reservation_revenue_cents,
    paid_services_revenue_cents, subscription_revenue_cents,
    developer_share_bps, status, metadata
  ) VALUES (
    p_period_start, p_period_end, v_currency,
    greatest(0, v_reservation), greatest(0, v_paid_services), greatest(0, v_subscription),
    COALESCE(v_share_bps, 1000), 'draft',
    jsonb_build_object('source', 'financial_ledger', 'refreshed_at', now())
  )
  ON CONFLICT (period_start, period_end, currency) WHERE status <> 'voided'
  DO UPDATE SET
    reservation_revenue_cents = EXCLUDED.reservation_revenue_cents,
    paid_services_revenue_cents = EXCLUDED.paid_services_revenue_cents,
    subscription_revenue_cents = EXCLUDED.subscription_revenue_cents,
    developer_share_bps = EXCLUDED.developer_share_bps,
    metadata = EXCLUDED.metadata
  RETURNING * INTO v_statement;

  RETURN v_statement;
END;
$$;

REVOKE ALL ON FUNCTION public.record_marketplace_checkout_ledger(text, text, text, text, uuid, integer, text, boolean, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_marketplace_refund_ledger(text, text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_developer_statement(date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketplace_checkout_ledger(text, text, text, text, uuid, integer, text, boolean, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_marketplace_refund_ledger(text, text, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_developer_statement(date, date, text) TO service_role;
REVOKE ALL ON FUNCTION private_finance.record_paid_restaurant_invoice(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_finance.record_paid_restaurant_invoice_trigger() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.finance_runtime_config IS
  'Server-authoritative TOK finance rules. Connect routing remains disabled until restaurant onboarding and a controlled cutover are complete.';
COMMENT ON COLUMN public.finance_runtime_config.platform_fee_bps IS
  'TOK share of marketplace client payments: 1000 basis points equals 10 percent.';
COMMENT ON COLUMN public.finance_runtime_config.developer_share_bps IS
  'Developer share of TOK-owned revenue only: 1000 basis points equals 10 percent.';
COMMENT ON COLUMN public.finance_runtime_config.reservation_fee_cents IS
  'Flat restaurant fee per billable reservation: 500 cents equals CHF 5.00.';

COMMIT;

NOTIFY pgrst, 'reload schema';
