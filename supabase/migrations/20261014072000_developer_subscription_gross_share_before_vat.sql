BEGIN;

-- TOK subscription developer 10% is calculated from the paid GROSS subscription
-- invoice before VAT. VAT remains a TOK liability; the developer's share is not
-- reduced by VAT or platform Stripe payment processing fees.
-- Marketplace, reservation, campaigns, and credit packs retain their own rules.
CREATE OR REPLACE FUNCTION public.record_marketplace_checkout_ledger(p_stripe_event_id text, p_checkout_session_id text, p_payment_intent_id text, p_checkout_kind text, p_restaurant_id uuid, p_gross_cents integer, p_currency text DEFAULT 'CHF'::text, p_livemode boolean DEFAULT false, p_metadata jsonb DEFAULT '{}'::jsonb, p_source_type text DEFAULT 'stripe_checkout'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_kind text := lower(trim(COALESCE(p_checkout_kind, '')));
  v_currency text := upper(trim(COALESCE(p_currency, 'CHF')));
  v_source_type text := lower(trim(COALESCE(p_source_type, 'stripe_checkout')));
  v_is_marketplace boolean;
  v_attempt_id uuid;
  v_attempt public.payment_attempts%ROWTYPE;
  v_sealed_metadata jsonb;
  v_sealed_finance_snapshot jsonb;
  v_supplied_finance_snapshot jsonb;
  v_pricing_snapshot_hash text;
  v_legacy_attempt_cutover timestamptz;
  v_legacy_pre_fair_growth boolean := false;
  v_platform_fee_bps integer;
  v_developer_share_bps integer := 1000;
  v_developer_order_bps integer := 100;
  v_commissionable_cents integer := 0;
  v_tip_cents integer := 0;
  v_delivery_cents integer := 0;
  v_other_noncommissionable_cents integer := 0;
  v_platform_commission_gross_cents integer := 0;
  v_platform_vat_cents integer := 0;
  v_platform_revenue_cents integer := 0;
  v_restaurant_share_cents integer := 0;
  v_delivery_payable_cents integer := 0;
  v_developer_share_cents integer := 0;
  v_revenue_account text;
  v_revenue_source text;
  v_metadata jsonb;
  v_input_hash text;
  v_economic_hash text;
  v_event_livemode boolean;
  v_existing public.financial_ledger%ROWTYPE;
BEGIN
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stripe_event_id_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_checkout_session_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'checkout_session_id_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_payment_intent_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_intent_id_required';
  END IF;
  IF p_gross_cents IS NULL OR p_gross_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'gross_cents_must_be_positive';
  END IF;
  IF v_currency <> 'CHF' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_currency';
  END IF;
  IF v_source_type NOT IN ('stripe_checkout', 'stripe_invoice') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_finance_source_type';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'finance_metadata_object_required';
  END IF;
  IF v_kind NOT IN (
    'order', 'zero-attente', 'chefs-table', 'match-group', 'direct-order',
    'restaurant-onboarding', 'restaurant-subscription-upgrade',
    'restaurant-module', 'campaign', 'tok-one', 'restaurant-credit-pack'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_checkout_kind';
  END IF;
  SELECT event.livemode INTO v_event_livemode
  FROM public.stripe_webhook_events event
  WHERE event.event_id = p_stripe_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'stripe_event_not_claimed';
  END IF;
  IF p_livemode IS DISTINCT FROM v_event_livemode THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_event_livemode_mismatch';
  END IF;

  v_input_hash := md5(jsonb_build_object(
    'checkout_session_id', p_checkout_session_id,
    'payment_intent_id', p_payment_intent_id,
    'checkout_kind', v_kind,
    'restaurant_id', p_restaurant_id,
    'gross_cents', p_gross_cents,
    'currency', v_currency,
    'livemode', p_livemode,
    'source_type', v_source_type,
    'metadata', COALESCE(p_metadata, '{}'::jsonb)
  )::text);
  v_economic_hash := md5(jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'checkout_kind', v_kind,
    'restaurant_id', p_restaurant_id,
    'gross_cents', p_gross_cents,
    'currency', v_currency,
    'livemode', v_event_livemode,
    'payment_attempt_id', p_metadata ->> 'payment_attempt_id',
    'finance_snapshot_version', p_metadata ->> 'finance_snapshot_version',
    'pricing_version', p_metadata ->> 'pricing_version',
    'pricing_rate_source', p_metadata ->> 'pricing_rate_source',
    'pricing_plan_id', p_metadata ->> 'pricing_plan_id',
    'pricing_plan_slug', p_metadata ->> 'pricing_plan_slug',
    'pricing_module_id', p_metadata ->> 'pricing_module_id',
    'pricing_module_slug', p_metadata ->> 'pricing_module_slug',
    'platform_fee_bps', p_metadata ->> 'platform_fee_bps',
    'developer_order_bps', p_metadata ->> 'developer_order_bps',
    'platform_fee_amount_cents', p_metadata ->> 'platform_fee_amount_cents',
    'restaurant_share_amount_cents', p_metadata ->> 'restaurant_share_amount_cents',
    'developer_share_bps', p_metadata ->> 'developer_share_bps',
    'developer_share_amount_cents', p_metadata ->> 'developer_share_amount_cents',
    'tok_net_amount_cents', p_metadata ->> 'tok_net_amount_cents',
    'commissionable_cents', p_metadata ->> 'commissionable_cents',
    'tip_cents', p_metadata ->> 'tip_cents',
    'delivery_pass_through_cents', p_metadata ->> 'delivery_pass_through_cents',
    'other_noncommissionable_cents', p_metadata ->> 'other_noncommissionable_cents'
  )::text);

  PERFORM pg_advisory_xact_lock(
    hashtext('marketplace_payment_intent_ledger'),
    hashtext(CASE WHEN v_event_livemode THEN 'live:' ELSE 'test:' END || p_payment_intent_id)
  );
  SELECT ledger.* INTO v_existing
  FROM public.financial_ledger ledger
  WHERE ledger.source_type IN ('stripe_checkout', 'stripe_invoice')
    AND ledger.account_code = 'payment_asset'
    AND ledger.direction = 'debit'
    AND ledger.reversal_of IS NULL
    AND ledger.stripe_mode = CASE WHEN v_event_livemode THEN 'live' ELSE 'test' END
    AND ledger.metadata ->> 'payment_intent_id' = p_payment_intent_id
  ORDER BY ledger.created_at
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.amount_cents <> p_gross_cents
      OR v_existing.currency <> v_currency
      OR v_existing.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR COALESCE(v_existing.metadata ->> 'payment_intent_id', '') <> p_payment_intent_id
      OR COALESCE(v_existing.metadata ->> 'checkout_kind', '') <> v_kind
      OR COALESCE(v_existing.metadata ->> 'finance_economic_hash', '') <> v_economic_hash
      OR (
        v_existing.source_type = v_source_type
        AND v_existing.source_id = p_checkout_session_id
        AND COALESCE(v_existing.metadata ->> 'finance_input_hash', '') <> v_input_hash
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'payment_intent_ledger_idempotency_conflict';
    END IF;
    RETURN;
  END IF;

  v_is_marketplace := v_kind IN (
    'order', 'zero-attente', 'chefs-table', 'match-group', 'direct-order'
  );
  IF v_is_marketplace THEN
    IF p_restaurant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_required_for_marketplace_payment';
    END IF;
    IF COALESCE(p_metadata ->> 'payment_attempt_id', '') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_attempt_id_required_for_marketplace_finance';
    END IF;

    v_attempt_id := (p_metadata ->> 'payment_attempt_id')::uuid;
    SELECT attempt.* INTO v_attempt
    FROM public.payment_attempts attempt
    WHERE attempt.id = v_attempt_id
    FOR SHARE;
    IF NOT FOUND
      OR v_attempt.request_generation IS DISTINCT FROM v_attempt.generation
      OR v_attempt.request_snapshot IS NULL
      OR jsonb_typeof(v_attempt.request_snapshot) IS DISTINCT FROM 'object'
      OR COALESCE(v_attempt.request_snapshot ->> 'version', '') <> '1'
      OR NULLIF(trim(COALESCE(v_attempt.request_fingerprint, '')), '') IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sealed_payment_attempt_snapshot_required';
    END IF;

    v_sealed_metadata := v_attempt.request_snapshot #> '{session_params,metadata}';
    IF jsonb_typeof(v_sealed_metadata) IS DISTINCT FROM 'object'
      OR v_attempt.mode <> (CASE WHEN v_event_livemode THEN 'live' ELSE 'test' END)
      OR lower(trim(v_attempt.kind)) <> v_kind
      OR v_attempt.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR v_attempt.amount_cents IS DISTINCT FROM p_gross_cents
      OR upper(trim(v_attempt.currency)) <> v_currency
      OR v_attempt.stripe_checkout_session_id IS DISTINCT FROM p_checkout_session_id
      OR (
        v_attempt.stripe_payment_intent_id IS NOT NULL
        AND v_attempt.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id
      )
      OR COALESCE(v_sealed_metadata ->> 'payment_attempt_version', '') <> '2'
      OR COALESCE(v_sealed_metadata ->> 'payment_attempt_id', '') <> v_attempt.id::text
      OR COALESCE(v_sealed_metadata ->> 'operation_key', '') <> v_attempt.operation_key
      OR lower(COALESCE(v_sealed_metadata ->> 'checkout_kind', '')) <> v_kind
      OR lower(COALESCE(v_sealed_metadata ->> 'stripe_mode', '')) <> v_attempt.mode
      OR COALESCE(v_sealed_metadata ->> 'restaurant_id', '') <> p_restaurant_id::text
      OR COALESCE(v_sealed_metadata ->> 'authoritative_total_cents', '') <> p_gross_cents::text
      OR upper(COALESCE(v_sealed_metadata ->> 'authoritative_currency', '')) <> v_currency
      OR COALESCE(p_metadata ->> 'operation_key', '') <> v_attempt.operation_key
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sealed_payment_attempt_identity_mismatch';
    END IF;

    SELECT cutover.legacy_attempt_created_before
    INTO v_legacy_attempt_cutover
    FROM private_finance.fair_growth_rollout_cutovers cutover
    WHERE cutover.cutover_key = 'marketplace_checkout_v1';

    IF COALESCE(v_sealed_metadata ->> 'finance_snapshot_version', '') = 'fair_growth_v1' THEN
      IF COALESCE(v_sealed_metadata ->> 'pricing_version', '') NOT IN ('fair_growth_2026_07', 'flat_marketplace_2026_08')
        OR COALESCE(v_sealed_metadata ->> 'platform_fee_bps', '') !~ '^[0-9]{1,4}$'
        OR COALESCE(v_sealed_metadata ->> 'developer_order_bps', '') !~ '^[0-9]{1,4}$'
        OR COALESCE(v_sealed_metadata ->> 'developer_share_bps', '') !~ '^[0-9]{1,4}$'
        OR COALESCE(v_sealed_metadata ->> 'commissionable_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'tip_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'delivery_pass_through_cents', '') !~ '^[0-9]+$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'complete_fair_growth_finance_snapshot_required';
      END IF;

      v_sealed_finance_snapshot := jsonb_build_object(
        'finance_snapshot_version', v_sealed_metadata -> 'finance_snapshot_version',
        'pricing_version', v_sealed_metadata -> 'pricing_version',
        'pricing_rate_source', v_sealed_metadata -> 'pricing_rate_source',
        'pricing_plan_id', v_sealed_metadata -> 'pricing_plan_id',
        'pricing_plan_slug', v_sealed_metadata -> 'pricing_plan_slug',
        'pricing_module_id', v_sealed_metadata -> 'pricing_module_id',
        'pricing_module_slug', v_sealed_metadata -> 'pricing_module_slug',
        'platform_fee_bps', v_sealed_metadata -> 'platform_fee_bps',
        'developer_order_bps', v_sealed_metadata -> 'developer_order_bps',
        'developer_share_bps', v_sealed_metadata -> 'developer_share_bps',
        'commissionable_cents', v_sealed_metadata -> 'commissionable_cents',
        'tip_cents', v_sealed_metadata -> 'tip_cents',
        'delivery_pass_through_cents', v_sealed_metadata -> 'delivery_pass_through_cents'
      );
      v_supplied_finance_snapshot := jsonb_build_object(
        'finance_snapshot_version', p_metadata -> 'finance_snapshot_version',
        'pricing_version', p_metadata -> 'pricing_version',
        'pricing_rate_source', p_metadata -> 'pricing_rate_source',
        'pricing_plan_id', p_metadata -> 'pricing_plan_id',
        'pricing_plan_slug', p_metadata -> 'pricing_plan_slug',
        'pricing_module_id', p_metadata -> 'pricing_module_id',
        'pricing_module_slug', p_metadata -> 'pricing_module_slug',
        'platform_fee_bps', p_metadata -> 'platform_fee_bps',
        'developer_order_bps', p_metadata -> 'developer_order_bps',
        'developer_share_bps', p_metadata -> 'developer_share_bps',
        'commissionable_cents', p_metadata -> 'commissionable_cents',
        'tip_cents', p_metadata -> 'tip_cents',
        'delivery_pass_through_cents', p_metadata -> 'delivery_pass_through_cents'
      );
      IF v_supplied_finance_snapshot IS DISTINCT FROM v_sealed_finance_snapshot THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_finance_snapshot_differs_from_sealed_attempt';
      END IF;

      v_platform_fee_bps := (v_sealed_metadata ->> 'platform_fee_bps')::integer;
      v_developer_order_bps := (v_sealed_metadata ->> 'developer_order_bps')::integer;
      v_developer_share_bps := (v_sealed_metadata ->> 'developer_share_bps')::integer;
      v_commissionable_cents := (v_sealed_metadata ->> 'commissionable_cents')::integer;
      v_tip_cents := (v_sealed_metadata ->> 'tip_cents')::integer;
      v_delivery_cents := (v_sealed_metadata ->> 'delivery_pass_through_cents')::integer;
      IF v_developer_share_bps <> v_developer_order_bps THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_rate_snapshot_mismatch';
      END IF;

      IF v_kind = 'direct-order' THEN
        IF COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') <> 'paid_module_snapshot'
          OR COALESCE(v_sealed_metadata ->> 'pricing_module_id', '') !~
               '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          OR COALESCE(v_sealed_metadata ->> 'pricing_module_slug', '') <> 'direct-order-saver'
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')), '') IS NOT NULL
          OR v_platform_fee_bps <> 150
          OR v_developer_order_bps <> 100
        THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_sealed_direct_order_module_snapshot';
        END IF;
      ELSE
        IF COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') NOT IN (
            'subscription_snapshot', 'subscription_plan', 'starter_fallback', 'runtime_default'
          )
          OR COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '') NOT IN (
            'starter', 'business', 'pro', 'premium', 'elite', ''
          )
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_id', '')), '') IS NOT NULL
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_slug', '')), '') IS NOT NULL
          OR v_developer_order_bps <> 100
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'flat_marketplace_2026_08'
            AND v_platform_fee_bps <> 1000
          )
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'fair_growth_2026_07'
            AND v_platform_fee_bps <> (CASE COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')
              WHEN 'starter' THEN 990
              WHEN 'business' THEN 890
              WHEN 'pro' THEN 890
              WHEN 'premium' THEN 790
              WHEN 'elite' THEN 690
              WHEN '' THEN 990
              ELSE -1
            END)
          )
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') = 'starter_fallback'
            AND (
              NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
              OR COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '') <> 'starter'
            )
          )
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') = 'runtime_default'
            AND (
              NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
              OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')), '') IS NOT NULL
              OR (
                COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'flat_marketplace_2026_08'
                AND v_platform_fee_bps <> 1000
              )
              OR (
                COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'fair_growth_2026_07'
                AND v_platform_fee_bps <> 990
              )
            )
          )
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') IN (
              'subscription_snapshot', 'subscription_plan'
            )
            AND (
              COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '') !~
                '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
              OR COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '') NOT IN (
                'starter', 'business', 'pro', 'premium', 'elite'
              )
            )
          )
        THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_sealed_fair_growth_plan_snapshot';
        END IF;
      END IF;

      IF v_commissionable_cents + v_tip_cents + v_delivery_cents > p_gross_cents THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_marketplace_finance_basis';
      END IF;
      v_other_noncommissionable_cents := p_gross_cents
        - v_commissionable_cents - v_tip_cents - v_delivery_cents;
      IF COALESCE(p_metadata ->> 'other_noncommissionable_cents', '') <> '' THEN
        IF (p_metadata ->> 'other_noncommissionable_cents') !~ '^[0-9]+$'
          OR (p_metadata ->> 'other_noncommissionable_cents')::integer
             <> v_other_noncommissionable_cents
        THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'other_noncommissionable_snapshot_mismatch';
        END IF;
      END IF;

      v_platform_commission_gross_cents := round(
        v_commissionable_cents::numeric * v_platform_fee_bps / 10000
      )::integer;
      v_platform_vat_cents := public.swiss_vat_from_tax_inclusive_cents(
        v_platform_commission_gross_cents, 810
      );
      v_platform_revenue_cents := v_platform_commission_gross_cents - v_platform_vat_cents;
      v_developer_share_cents := round(
        v_commissionable_cents::numeric * v_developer_order_bps / 10000
      )::integer;
      IF v_developer_share_cents > v_platform_revenue_cents THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_share_exceeds_tok_net_commission';
      END IF;
      v_restaurant_share_cents := v_commissionable_cents
        - v_platform_commission_gross_cents + v_tip_cents + v_other_noncommissionable_cents;
      v_delivery_payable_cents := v_delivery_cents;
    ELSIF v_kind IN ('order', 'zero-attente', 'chefs-table', 'match-group')
      AND v_legacy_attempt_cutover IS NOT NULL
      AND v_attempt.created_at < v_legacy_attempt_cutover
    THEN
      v_legacy_pre_fair_growth := true;
      IF NULLIF(trim(COALESCE(v_sealed_metadata ->> 'finance_snapshot_version', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_version', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_id', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_slug', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'developer_order_bps', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'commissionable_cents', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'tip_cents', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'delivery_pass_through_cents', '')), '') IS NOT NULL
        OR COALESCE(v_sealed_metadata ->> 'platform_fee_bps', '') <> '1000'
        OR COALESCE(v_sealed_metadata ->> 'platform_fee_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'restaurant_share_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'developer_share_bps', '') <> '1000'
        OR COALESCE(v_sealed_metadata ->> 'developer_share_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'tok_net_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'finance_routing_mode', '') NOT IN (
          'stripe_connect_destination', 'legacy_manual'
        )
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_legacy_sealed_marketplace_snapshot';
      END IF;

      v_sealed_finance_snapshot := jsonb_build_object(
        'finance_routing_mode', v_sealed_metadata -> 'finance_routing_mode',
        'platform_fee_bps', v_sealed_metadata -> 'platform_fee_bps',
        'platform_fee_amount_cents', v_sealed_metadata -> 'platform_fee_amount_cents',
        'restaurant_share_amount_cents', v_sealed_metadata -> 'restaurant_share_amount_cents',
        'developer_share_bps', v_sealed_metadata -> 'developer_share_bps',
        'developer_share_amount_cents', v_sealed_metadata -> 'developer_share_amount_cents',
        'tok_net_amount_cents', v_sealed_metadata -> 'tok_net_amount_cents'
      );
      v_supplied_finance_snapshot := jsonb_build_object(
        'finance_routing_mode', p_metadata -> 'finance_routing_mode',
        'platform_fee_bps', p_metadata -> 'platform_fee_bps',
        'platform_fee_amount_cents', p_metadata -> 'platform_fee_amount_cents',
        'restaurant_share_amount_cents', p_metadata -> 'restaurant_share_amount_cents',
        'developer_share_bps', p_metadata -> 'developer_share_bps',
        'developer_share_amount_cents', p_metadata -> 'developer_share_amount_cents',
        'tok_net_amount_cents', p_metadata -> 'tok_net_amount_cents'
      );
      IF v_supplied_finance_snapshot IS DISTINCT FROM v_sealed_finance_snapshot THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'legacy_stripe_snapshot_differs_from_sealed_attempt';
      END IF;

      v_platform_fee_bps := (v_sealed_metadata ->> 'platform_fee_bps')::integer;
      v_developer_order_bps := 0;
      v_developer_share_bps := 1000;
      v_platform_commission_gross_cents := (v_sealed_metadata ->> 'platform_fee_amount_cents')::integer;
      v_restaurant_share_cents := (v_sealed_metadata ->> 'restaurant_share_amount_cents')::integer;
      v_developer_share_cents := (v_sealed_metadata ->> 'developer_share_amount_cents')::integer;
      v_platform_vat_cents := public.swiss_vat_from_tax_inclusive_cents(
        v_platform_commission_gross_cents, 810
      );
      v_platform_revenue_cents := v_platform_commission_gross_cents - v_platform_vat_cents;
      v_commissionable_cents := p_gross_cents;
      v_tip_cents := 0;
      v_delivery_cents := 0;
      v_delivery_payable_cents := 0;
      v_other_noncommissionable_cents := 0;
      IF v_platform_vat_cents
           <> public.swiss_vat_from_tax_inclusive_cents(v_platform_commission_gross_cents, 810)
        OR v_platform_revenue_cents
           <> v_platform_commission_gross_cents - v_platform_vat_cents
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'legacy_marketplace_vat_snapshot_mismatch';
      END IF;
      IF v_platform_commission_gross_cents
           <> round(p_gross_cents::numeric * v_platform_fee_bps / 10000)::integer
        OR v_restaurant_share_cents <> p_gross_cents - v_platform_commission_gross_cents
        OR v_developer_share_cents
           <> round(v_platform_commission_gross_cents::numeric * 1000 / 10000)::integer
        OR v_developer_share_cents > v_platform_revenue_cents
        OR (v_sealed_metadata ->> 'tok_net_amount_cents')::integer
           <> v_platform_commission_gross_cents - v_developer_share_cents
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'legacy_marketplace_split_snapshot_mismatch';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'fair_growth_sealed_finance_snapshot_required';
    END IF;

    v_pricing_snapshot_hash := md5(jsonb_build_object(
      'payment_attempt_id', v_attempt.id,
      'generation', v_attempt.generation,
      'request_fingerprint', v_attempt.request_fingerprint,
      'finance_snapshot', v_sealed_finance_snapshot,
      'legacy_pre_fair_growth', v_legacy_pre_fair_growth
    )::text);
    v_revenue_account := 'tok_platform_commission_revenue';
    v_revenue_source := 'other';
  ELSE
    IF p_metadata ? 'developer_share_bps' THEN
      IF COALESCE(p_metadata ->> 'developer_share_bps', '') !~ '^[0-9]{1,4}$' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_tok_revenue_share_must_equal_1000_bps';
      END IF;
      IF (p_metadata ->> 'developer_share_bps')::integer <> 1000 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_tok_revenue_share_must_equal_1000_bps';
      END IF;
    END IF;
    v_platform_fee_bps := 10000;
    v_platform_commission_gross_cents := p_gross_cents;
    v_platform_vat_cents := public.swiss_vat_from_tax_inclusive_cents(p_gross_cents, 810);
    v_platform_revenue_cents := p_gross_cents - v_platform_vat_cents;
    -- Subscription contracts allocate 10% of the amount collected INCLUDING VAT.
    -- VAT and Stripe fees are borne by TOK; the developer's share does not shrink.
    IF v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade', 'tok-one') THEN
      v_developer_share_cents := round(
        p_gross_cents::numeric * v_developer_share_bps / 10000
      )::integer;
    ELSE
      v_developer_share_cents := round(
        v_platform_revenue_cents::numeric * v_developer_share_bps / 10000
      )::integer;
    END IF;
    v_commissionable_cents := p_gross_cents;
    v_revenue_account := CASE
      WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'tok_subscription_revenue'
      WHEN v_kind = 'restaurant-module' THEN 'tok_module_revenue'
      WHEN v_kind = 'campaign' THEN 'tok_campaign_revenue'
      WHEN v_kind = 'tok-one' THEN 'tok_one_revenue'
      WHEN v_kind = 'restaurant-credit-pack' THEN 'tok_credit_pack_revenue'
    END;
    v_revenue_source := CASE
      WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'subscription'
      WHEN v_kind = 'campaign' THEN 'sponsorship'
      WHEN v_kind = 'tok-one' THEN 'tok_one'
      WHEN v_kind = 'restaurant-credit-pack' THEN 'pack'
      ELSE 'other'
    END;
  END IF;

  IF v_restaurant_share_cents + v_delivery_payable_cents
      + v_platform_revenue_cents + v_platform_vat_cents <> p_gross_cents
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unbalanced_checkout_journal';
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'checkout_kind', v_kind,
    'checkout_session_id', p_checkout_session_id,
    'payment_intent_id', p_payment_intent_id,
    'gross_cents', p_gross_cents,
    'commissionable_cents', v_commissionable_cents,
    'tip_cents', v_tip_cents,
    'delivery_pass_through_cents', v_delivery_cents,
    'other_noncommissionable_cents', v_other_noncommissionable_cents,
    'platform_commission_gross_cents', v_platform_commission_gross_cents,
    'platform_revenue_cents', v_platform_revenue_cents,
    'platform_vat_cents', v_platform_vat_cents,
    'restaurant_share_cents', v_restaurant_share_cents,
    'delivery_payable_cents', v_delivery_payable_cents,
    'platform_fee_bps', v_platform_fee_bps,
    'developer_order_bps', v_developer_order_bps,
    'developer_share_bps', v_developer_share_bps,
    'developer_share_cents', v_developer_share_cents,
    'platform_revenue_account', v_revenue_account,
    'pricing_rate_source_normalized', CASE
      WHEN v_legacy_pre_fair_growth THEN 'starter_legacy_pre_fair_growth'
      WHEN COALESCE(p_metadata ->> 'pricing_rate_source', '') = 'runtime_default'
        THEN 'starter_legacy_fallback'
      ELSE COALESCE(p_metadata ->> 'pricing_rate_source', '')
    END,
    'legacy_pre_fair_growth', v_legacy_pre_fair_growth,
    'legacy_attempt_cutover', CASE
      WHEN v_legacy_pre_fair_growth THEN v_legacy_attempt_cutover
      ELSE NULL
    END,
    'pricing_snapshot_hash', v_pricing_snapshot_hash,
    'finance_input_hash', v_input_hash,
    'finance_economic_hash', v_economic_hash,
    'vat_rate_bps', 810,
    'pricing_version', CASE
      WHEN v_legacy_pre_fair_growth THEN 'legacy_pre_fair_growth'
      ELSE COALESCE(p_metadata ->> 'pricing_version', 'flat_marketplace_2026_08')
    END,
    'livemode', p_livemode
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id,
    account_code, direction, amount_cents, currency, metadata
  ) VALUES (
    v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
    'payment_asset', 'debit', p_gross_cents, v_currency, v_metadata
  );
  IF v_restaurant_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'restaurant_payable', 'credit', v_restaurant_share_cents, v_currency, v_metadata
    );
  END IF;
  IF v_delivery_payable_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'delivery_pass_through_payable', 'credit', v_delivery_payable_cents, v_currency, v_metadata
    );
  END IF;
  IF v_platform_revenue_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      v_revenue_account, 'credit', v_platform_revenue_cents, v_currency, v_metadata
    );
  END IF;
  IF v_platform_vat_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'tax_payable', 'credit', v_platform_vat_cents, v_currency, v_metadata
    );
  END IF;
  IF v_developer_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_revenue_share_expense', 'debit', v_developer_share_cents, v_currency, v_metadata),
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_payable', 'credit', v_developer_share_cents, v_currency, v_metadata);
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
$function$

-- One-time, append-only and idempotent reconciliation for the already settled
-- TOK Starter invoice: CHF 69 TTC -> CHF 6.90 (690 cents), previously 638.
-- No new charge, payment, payout, or reversal of the historical journal.
DO $tok_subscription_gross_share_fix$
DECLARE
  v_original public.financial_ledger%ROWTYPE;
  v_existing_count integer;
  v_existing_valid_count integer;
  v_recorded_count integer;
  v_metadata jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('tok_subscription_gross_share_adjustment'),
    hashtext('in_1UQDzJGTQigE34sur1rEYCWx')
  );

  SELECT ledger.* INTO v_original
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = 'stripe_invoice'
    AND ledger.source_id = 'in_1UQDzJGTQigE34sur1rEYCWx'
    AND ledger.account_code = 'developer_payable'
    AND ledger.direction = 'credit'
    AND ledger.amount_cents = 638
    AND ledger.stripe_mode = 'live'
    AND ledger.livemode = true
    AND ledger.reversal_of IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'tok_subscription_original_live_payable_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.financial_ledger ledger
    WHERE ledger.source_type = 'stripe_invoice'
      AND ledger.source_id = 'in_1UQDzJGTQigE34sur1rEYCWx'
      AND ledger.account_code = 'payment_asset'
      AND ledger.direction = 'debit'
      AND ledger.amount_cents = 6900
      AND ledger.metadata ->> 'payment_intent_id' = 'pi_3UQDzKGTQigE34su2TRN9D5c'
      AND ledger.stripe_mode = 'live'
      AND ledger.reversal_of IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.restaurant_invoices invoice
    WHERE invoice.id = 'cd35d510-48bd-479a-a1e8-501dac1cbad1'
      AND invoice.status = 'paid'
      AND invoice.amount_ttc = 69.00
      AND invoice.amount_tva = 5.17
      AND invoice.metadata ->> 'stripe_latest_invoice_id'
        = 'in_1UQDzJGTQigE34sur1rEYCWx'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'tok_subscription_gross_share_verified_payment_missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financial_ledger ledger
    WHERE ledger.reversal_of = v_original.entry_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'tok_subscription_gross_share_payment_reversed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.developer_statements statement
    WHERE statement.period_start = '2026-10-01'
      AND statement.period_end = '2026-10-31'
      AND statement.currency = 'CHF'
      AND statement.status IN ('validated','paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'tok_subscription_gross_share_statement_locked';
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (
      WHERE ledger.amount_cents = 52
        AND ledger.currency = 'CHF'
        AND ledger.stripe_mode = 'live'
        AND ledger.reversal_of IS NULL
        AND (
          (ledger.account_code = 'developer_payable' AND ledger.direction = 'credit')
          OR
          (ledger.account_code = 'developer_revenue_share_expense' AND ledger.direction = 'debit')
        )
    )::integer
  INTO v_existing_count, v_existing_valid_count
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = 'tok_subscription_gross_share_adjustment'
    AND ledger.source_id = 'in_1UQDzJGTQigE34sur1rEYCWx';

  IF v_existing_count = 2 AND v_existing_valid_count = 2 THEN
    RETURN;
  ELSIF v_existing_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'tok_subscription_gross_share_adjustment_inconsistent';
  END IF;

  v_metadata := jsonb_build_object(
    'kind', 'subscription_gross_before_vat',
    'subscription_type', 'restaurant-onboarding',
    'original_ledger_entry_id', v_original.entry_id,
    'original_developer_share_cents', 638,
    'correct_developer_share_cents', 690,
    'additional_developer_share_cents', 52,
    'invoice_gross_cents', 6900,
    'invoice_id', 'in_1UQDzJGTQigE34sur1rEYCWx',
    'payment_intent_id', 'pi_3UQDzKGTQigE34su2TRN9D5c',
    'original_invoice_is_paid', true,
    'gross_share_rate_bps', 1000,
    'basis', 'gross_subscription_price_before_vat'
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, restaurant_id, account_code, direction,
    amount_cents, currency, livemode, stripe_mode, effective_at, metadata
  ) VALUES
    ('tok_subscription_gross_share_adjustment',
     'in_1UQDzJGTQigE34sur1rEYCWx',
     v_original.restaurant_id,
     'developer_revenue_share_expense', 'debit', 52, 'CHF', true,
     'live', v_original.effective_at, v_metadata),
    ('tok_subscription_gross_share_adjustment',
     'in_1UQDzJGTQigE34sur1rEYCWx',
     v_original.restaurant_id,
     'developer_payable', 'credit', 52, 'CHF', true,
     'live', v_original.effective_at, v_metadata);

  GET DIAGNOSTICS v_recorded_count = ROW_COUNT;
  IF v_recorded_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'tok_subscription_gross_share_adjustment_incomplete';
  END IF;
END
$tok_subscription_gross_share_fix$;

COMMIT;
