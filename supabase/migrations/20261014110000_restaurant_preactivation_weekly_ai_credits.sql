-- Restaurant AI before first paid activation: 15 non-cumulative credits each
-- Swiss civil week (Monday 00:00 Europe/Zurich). Paid packs remain usable
-- independently, for twelve months from their verified purchase timestamp.
-- Keep the original Fair Growth monthly/yearly allowance logic for active plans.
--
-- Migration intentionally changes no historical migrations, purchases or logs.

CREATE OR REPLACE FUNCTION private_finance.get_restaurant_preactivation_credit_usage(
  p_restaurant_id uuid,
  p_anchor timestamptz,
  p_trial_eligible boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week timestamp := date_trunc('week', p_anchor AT TIME ZONE 'Europe/Zurich');
  v_event_week timestamp;
  v_previous_week timestamp;
  v_free_limit numeric := CASE WHEN p_trial_eligible THEN 15 ELSE 0 END;
  v_free_remaining numeric := CASE WHEN p_trial_eligible THEN 15 ELSE 0 END;
  v_week_spent numeric := 0;
  v_event record;
  v_to_spend numeric;
  v_free_spend numeric;
  v_paid_lots numeric[] := ARRAY[]::numeric[];
  v_paid_expires timestamptz[] := ARRAY[]::timestamptz[];
  v_paid_total numeric := 0;
  v_paid_balance numeric := 0;
  v_debit numeric;
  v_index integer;
BEGIN
  IF p_restaurant_id IS NULL OR p_anchor IS NULL THEN
    RAISE EXCEPTION 'restaurant_id_and_anchor_required' USING ERRCODE = '22023';
  END IF;

  -- Replay the last twelve months in chronological order: weekly trial credits
  -- are consumed first for AI calls only, then the oldest unexpired paid pack.
  -- A campaign can consume purchased credits but never the free AI allowance.
  FOR v_event IN
    SELECT event_type, occurred_at, credit_units
    FROM (
      SELECT
        'purchase'::text AS event_type,
        COALESCE(paid_at, updated_at, created_at) AS occurred_at,
        GREATEST(
          COALESCE(campaign_credit_chf, 0) * 15
          + COALESCE(ai_tool_credits, 0)
          + COALESCE(ai_photo_credits, 0),
          0
        )::numeric AS credit_units,
        id::text AS event_id
      FROM public.restaurant_credit_purchases
      WHERE restaurant_id = p_restaurant_id
        AND status = 'paid'
        AND COALESCE(paid_at, updated_at, created_at) >= p_anchor - interval '12 months'
        AND COALESCE(paid_at, updated_at, created_at) < p_anchor

      UNION ALL

      SELECT
        'ai'::text,
        created_at,
        GREATEST(
          COALESCE(
            CASE WHEN metadata->>'credit_units' ~ '^[0-9]+(\.[0-9]+)?$'
              THEN (metadata->>'credit_units')::numeric END,
            CASE WHEN function_name IN (
              'ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor',
              'generate-campaign', 'floorplan-ai', 'ai-accounting-agent'
            ) THEN 5 END,
            CASE WHEN metadata->>'image_count' ~ '^[0-9]+$'
              THEN (metadata->>'image_count')::numeric END,
            CASE WHEN metadata->>'variant_count' ~ '^[0-9]+$'
              THEN (metadata->>'variant_count')::numeric END,
            1
          ),
          1
        )::numeric,
        id::text
      FROM public.ai_usage_logs
      WHERE restaurant_id = p_restaurant_id
        AND status = 'success'
        AND created_at >= p_anchor - interval '12 months'
        AND created_at < p_anchor

      UNION ALL

      SELECT
        'campaign'::text,
        COALESCE(activated_at, scheduled_at, starts_at, created_at, updated_at),
        (GREATEST(
          COALESCE(total_budget, 0),
          COALESCE(spent, 0),
          COALESCE(paid_amount, 0),
          0
        ) * 15)::numeric,
        id::text
      FROM public.ad_campaigns
      WHERE restaurant_id = p_restaurant_id
        AND lower(COALESCE(payment_method, '')) = 'credits'
        AND lower(COALESCE(payment_status, '')) = 'paid'
        AND COALESCE(activated_at, scheduled_at, starts_at, created_at, updated_at)
          >= p_anchor - interval '12 months'
        AND COALESCE(activated_at, scheduled_at, starts_at, created_at, updated_at) < p_anchor
    ) events
    ORDER BY occurred_at, CASE WHEN event_type = 'purchase' THEN 0 ELSE 1 END, event_id
  LOOP
    IF v_event.event_type = 'purchase' THEN
      v_paid_lots := array_append(v_paid_lots, v_event.credit_units);
      v_paid_expires := array_append(v_paid_expires, v_event.occurred_at + interval '12 months');
      CONTINUE;
    END IF;

    v_event_week := date_trunc('week', v_event.occurred_at AT TIME ZONE 'Europe/Zurich');
    IF v_previous_week IS DISTINCT FROM v_event_week THEN
      v_previous_week := v_event_week;
      v_free_remaining := v_free_limit;
    END IF;

    v_to_spend := v_event.credit_units;
    IF v_event_week = v_week THEN
      v_week_spent := v_week_spent + v_to_spend;
    END IF;

    IF v_event.event_type = 'ai' THEN
      v_free_spend := LEAST(v_to_spend, v_free_remaining);
      v_free_remaining := v_free_remaining - v_free_spend;
      v_to_spend := v_to_spend - v_free_spend;
    END IF;

    IF v_to_spend > 0 THEN
      FOR v_index IN 1..COALESCE(array_length(v_paid_lots, 1), 0) LOOP
        IF v_paid_expires[v_index] > v_event.occurred_at
          AND v_paid_lots[v_index] > 0
        THEN
          v_debit := LEAST(v_paid_lots[v_index], v_to_spend);
          v_paid_lots[v_index] := v_paid_lots[v_index] - v_debit;
          v_to_spend := v_to_spend - v_debit;
          EXIT WHEN v_to_spend <= 0;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF v_previous_week IS DISTINCT FROM v_week THEN
    v_free_remaining := v_free_limit;
  END IF;

  FOR v_index IN 1..COALESCE(array_length(v_paid_lots, 1), 0) LOOP
    IF v_paid_expires[v_index] > p_anchor THEN
      v_paid_total := v_paid_total + v_paid_lots[v_index];
      -- Total purchased for non-expired lots is computed separately below;
      -- the replay above retains only their unspent units.
    END IF;
  END LOOP;
  v_paid_balance := v_paid_total;

  SELECT COALESCE(sum(
    GREATEST(COALESCE(campaign_credit_chf, 0) * 15
      + COALESCE(ai_tool_credits, 0) + COALESCE(ai_photo_credits, 0), 0)
  ), 0)
  INTO v_paid_total
  FROM public.restaurant_credit_purchases
  WHERE restaurant_id = p_restaurant_id
    AND status = 'paid'
    AND COALESCE(paid_at, updated_at, created_at) >= p_anchor - interval '12 months'
    AND COALESCE(paid_at, updated_at, created_at) < p_anchor;

  RETURN jsonb_build_object(
    'trial_allowance', v_free_limit,
    'trial_spent', v_free_limit - v_free_remaining,
    'trial_balance', v_free_remaining,
    'topup_allowance', v_paid_total,
    'topup_spent', GREATEST(v_paid_total - v_paid_balance, 0),
    'topup_balance', v_paid_balance,
    'week_spent', v_week_spent
  );
END;
$$;

REVOKE ALL ON FUNCTION private_finance.get_restaurant_preactivation_credit_usage(uuid, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subscription record;
  -- A transaction can insert multiple usage rows: now() is transaction-fixed
  -- and would exclude those rows from the subsequent spend check.
  v_anchor timestamptz := COALESCE(p_since, p_until - interval '1 microsecond', clock_timestamp());
  v_civil_start timestamptz;
  v_civil_end timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_result jsonb;
  v_wallet jsonb;
  v_credit jsonb;
  v_active boolean;
  v_trial_eligible boolean;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_id_required';
  END IF;
  IF p_since IS NOT NULL AND p_until IS NOT NULL AND p_until <= p_since THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_entitlement_window';
  END IF;

  SELECT subscription.billing_period,
         subscription.current_period_start,
         subscription.current_period_end
  INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.restaurant_id = p_restaurant_id
  ORDER BY CASE WHEN subscription.status IN ('trialing', 'active') THEN 0 ELSE 1 END,
    subscription.current_period_end DESC NULLS LAST,
    subscription.created_at DESC
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_ai_subscriptions subscription
    WHERE subscription.restaurant_id = p_restaurant_id
      AND subscription.status = 'active'
      AND subscription.activated_at IS NOT NULL
      AND subscription.activated_at <= now()
      AND subscription.current_period_start <= now()
      AND subscription.current_period_end > now()
  ) INTO v_active;

  IF NOT v_active THEN
    -- The existing RPC performs the ownership/admin check before returning
    -- any private credit information. Never expose the private replay function.
    v_week_start := date_trunc('week', v_anchor AT TIME ZONE 'Europe/Zurich')
      AT TIME ZONE 'Europe/Zurich';
    v_week_end := (date_trunc('week', v_anchor AT TIME ZONE 'Europe/Zurich') + interval '1 week')
      AT TIME ZONE 'Europe/Zurich';
    v_result := public.get_restaurant_credit_usage_before_fair_growth(
      p_restaurant_id, v_week_start, v_week_end
    );
    SELECT NOT EXISTS (
      SELECT 1 FROM public.restaurant_ai_subscriptions subscription
      WHERE subscription.restaurant_id = p_restaurant_id
        AND subscription.activated_at IS NOT NULL
    ) INTO v_trial_eligible;
    v_wallet := private_finance.get_restaurant_preactivation_credit_usage(
      p_restaurant_id, v_anchor, v_trial_eligible
    );

    v_credit := COALESCE(v_result->'credits'->0, '{}'::jsonb) || jsonb_build_object(
      'kind', 'tok_credits',
      'label', 'Credits TOK',
      'unit', 'credit',
      'allowance', (v_wallet->>'trial_allowance')::numeric + (v_wallet->>'topup_allowance')::numeric,
      'included_allowance', (v_wallet->>'trial_allowance')::numeric,
      'topup_allowance', (v_wallet->>'topup_allowance')::numeric,
      'spent', (v_wallet->>'week_spent')::numeric,
      'subscription_spent', (v_wallet->>'trial_spent')::numeric,
      'topup_spent', (v_wallet->>'topup_spent')::numeric,
      'balance', (v_wallet->>'trial_balance')::numeric + (v_wallet->>'topup_balance')::numeric,
      'subscription_balance', (v_wallet->>'trial_balance')::numeric,
      'topup_balance', (v_wallet->>'topup_balance')::numeric,
      'metadata', COALESCE(v_result->'credits'->0->'metadata', '{}'::jsonb)
        || jsonb_build_object(
          'preactivation', true,
          'trial_eligible', v_trial_eligible,
          'trial_weekly_limit', (v_wallet->>'trial_allowance')::numeric,
          'trial_weekly_used', (v_wallet->>'trial_spent')::numeric,
          'trial_weekly_remaining', (v_wallet->>'trial_balance')::numeric,
          'campaign_spendable_balance', (v_wallet->>'topup_balance')::numeric,
          'topup_balance', (v_wallet->>'topup_balance')::numeric,
          'subscription_balance', (v_wallet->>'trial_balance')::numeric,
          'subscription_credits_locked', true,
          'topup_credits_expiry_months', 12,
          'trial_reset_at', v_week_end,
          'trial_reset_timezone', 'Europe/Zurich'
        )
    );
    v_result := jsonb_set(v_result, '{credits}', jsonb_build_array(v_credit), true);
    v_result := jsonb_set(v_result, '{period}', jsonb_build_object(
      'start', v_week_start, 'end', v_week_end,
      'generated_at', now(), 'entitlement_reset', 'swiss_civil_week'
    ), true);
    RETURN v_result;
  END IF;

  IF COALESCE(v_subscription.billing_period, 'monthly') <> 'yearly' THEN
    RETURN public.get_restaurant_credit_usage_before_fair_growth(
      p_restaurant_id, p_since, p_until
    );
  END IF;
  IF v_subscription.current_period_start IS NULL OR v_subscription.current_period_end IS NULL
    OR v_subscription.current_period_end <= v_subscription.current_period_start
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'annual_subscription_service_period_required';
  END IF;

  v_civil_start := date_trunc('month', v_anchor AT TIME ZONE 'Europe/Zurich')
    AT TIME ZONE 'Europe/Zurich';
  v_civil_end := (date_trunc('month', v_anchor AT TIME ZONE 'Europe/Zurich') + interval '1 month')
    AT TIME ZONE 'Europe/Zurich';
  v_period_start := greatest(v_civil_start, v_subscription.current_period_start);
  v_period_end := least(v_civil_end, v_subscription.current_period_end);
  IF v_period_end <= v_period_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'annual_entitlement_window_outside_service_period';
  END IF;

  v_result := public.get_restaurant_credit_usage_before_fair_growth(
    p_restaurant_id, v_period_start, v_period_end
  );
  RETURN jsonb_set(v_result, '{period,entitlement_reset}', to_jsonb('civil_month'::text), true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- The existing quota RPC blocks pre-activation photo use and applies
-- unrelated per-tool monthly limits. Before activation, the atomic TOK wallet
-- enforces the actual 15-credit weekly cap plus paid top-ups instead.
CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(
  p_restaurant_id uuid,
  p_feature text,
  p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text := 'starter';
  v_limit integer := 0;
  v_used integer := 0;
  v_allowed boolean := false;
  v_feature text := COALESCE(NULLIF(trim(p_feature), ''), 'ai_sales_insights');
  v_active boolean;
  v_wallet jsonb;
  v_balance numeric;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'feature', v_feature, 'plan', v_plan,
      'limit', 0, 'used', 0, 'remaining', 0, 'reason', 'restaurant_required'
    );
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.auth_owns_restaurant(p_restaurant_id)
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_feature_flag_active(v_feature) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'feature', v_feature, 'plan', v_plan,
      'limit', 0, 'used', 0, 'remaining', 0, 'reason', 'feature_disabled'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_ai_subscriptions
    WHERE restaurant_id = p_restaurant_id
      AND status = 'active'
      AND activated_at IS NOT NULL
      AND activated_at <= now()
      AND current_period_start <= now()
      AND current_period_end > now()
  ) INTO v_active;

  IF NOT v_active THEN
    v_wallet := public.get_restaurant_credit_usage(p_restaurant_id);
    v_balance := GREATEST(COALESCE((v_wallet->'credits'->0->>'balance')::numeric, 0), 0);
    v_allowed := v_balance >= GREATEST(COALESCE(p_units, 1), 1);
    RETURN jsonb_build_object(
      'allowed', v_allowed, 'feature', v_feature, 'plan', 'preactivation',
      'limit', COALESCE((v_wallet->'credits'->0->'metadata'->>'trial_weekly_limit')::integer, 0),
      'used', COALESCE((v_wallet->'credits'->0->'metadata'->>'trial_weekly_used')::integer, 0),
      'remaining', floor(v_balance)::integer,
      'reason', CASE WHEN v_allowed THEN NULL ELSE 'credits_exhausted' END
    );
  END IF;

  SELECT
    ras.plan,
    CASE
      WHEN v_feature = 'ai_support_chat' THEN ras.monthly_conversation_limit
      WHEN v_feature = 'ai_photo_enhancer' THEN ras.monthly_image_limit
      WHEN v_feature = 'ai_premium_image_generation' THEN ras.monthly_premium_image_limit
      WHEN v_feature IN (
        'ai_menu_optimizer', 'ai_marketing_campaigns', 'ai_sales_insights', 'ai_accounting_insights'
      ) THEN ras.monthly_text_tool_limit
      WHEN v_feature = 'ai_admin_monitoring' THEN GREATEST(ras.monthly_text_tool_limit, 100)
      ELSE ras.monthly_text_tool_limit
    END
  INTO v_plan, v_limit
  FROM public.restaurant_ai_subscriptions ras
  WHERE ras.restaurant_id = p_restaurant_id
    AND ras.status = 'active'
    AND ras.activated_at IS NOT NULL
    AND ras.activated_at <= now()
    AND ras.current_period_start <= now()
    AND ras.current_period_end > now()
  ORDER BY ras.created_at DESC
  LIMIT 1;

  IF v_limit IS NULL THEN
    -- Fail closed rather than silently applying a Starter plan to an active
    -- subscription whose billing snapshot is temporarily unavailable.
    RETURN jsonb_build_object(
      'allowed', false, 'feature', v_feature, 'plan', v_plan,
      'limit', 0, 'used', 0, 'remaining', 0, 'reason', 'subscription_unavailable'
    );
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.ai_usage_logs ul
  WHERE ul.restaurant_id = p_restaurant_id
    AND ul.status = 'success'
    AND ul.created_at >= date_trunc('month', now())
    AND COALESCE(ul.feature_name, ul.metadata->>'feature', ul.action) = v_feature;

  v_allowed := v_limit < 0 OR (v_used + GREATEST(COALESCE(p_units, 1), 1)) <= v_limit;
  RETURN jsonb_build_object(
    'allowed', v_allowed, 'feature', v_feature, 'plan', v_plan,
    'limit', v_limit, 'used', v_used,
    'remaining', CASE WHEN v_limit < 0 THEN -1 ELSE GREATEST(v_limit - v_used, 0) END,
    'reason', CASE WHEN v_allowed THEN NULL ELSE 'quota_exceeded' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
  TO authenticated, service_role;

-- Preserve the existing advisory lock and old-row delta for simultaneous
-- AI requests / campaign edits. Free trial AI credits cannot fund campaigns.
CREATE OR REPLACE FUNCTION public.guard_restaurant_tok_credit_spend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restaurant_id uuid;
  v_required_credits numeric(14, 2) := 0;
  v_old_required_credits numeric(14, 2) := 0;
  v_available_credits numeric(14, 2) := 0;
  v_usage jsonb := '{}'::jsonb;
  v_credit_text text;
BEGIN
  IF TG_TABLE_NAME = 'ai_usage_logs' THEN
    v_restaurant_id := NEW.restaurant_id;
    IF v_restaurant_id IS NULL OR lower(COALESCE(NEW.status, '')) <> 'success' THEN
      RETURN NEW;
    END IF;
    v_credit_text := COALESCE(NEW.metadata->>'credit_units', '');
    IF v_credit_text ~ '^[0-9]+(\.[0-9]+)?$' THEN
      v_required_credits := GREATEST(v_credit_text::numeric, 0);
    END IF;
    IF TG_OP = 'UPDATE'
      AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(COALESCE(OLD.status, '')) = 'success'
    THEN
      v_credit_text := COALESCE(OLD.metadata->>'credit_units', '');
      IF v_credit_text ~ '^[0-9]+(\.[0-9]+)?$' THEN
        v_old_required_credits := GREATEST(v_credit_text::numeric, 0);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'ad_campaigns' THEN
    v_restaurant_id := NEW.restaurant_id;
    IF v_restaurant_id IS NULL
      OR lower(COALESCE(NEW.payment_method, '')) <> 'credits'
      OR lower(COALESCE(NEW.payment_status, '')) <> 'paid'
    THEN
      RETURN NEW;
    END IF;
    v_required_credits := GREATEST(
      COALESCE(NEW.total_budget, 0), COALESCE(NEW.spent, 0),
      COALESCE(NEW.paid_amount, 0), 0
    ) * 15;
    IF TG_OP = 'UPDATE'
      AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(COALESCE(OLD.payment_method, '')) = 'credits'
      AND lower(COALESCE(OLD.payment_status, '')) = 'paid'
    THEN
      v_old_required_credits := GREATEST(
        COALESCE(OLD.total_budget, 0), COALESCE(OLD.spent, 0),
        COALESCE(OLD.paid_amount, 0), 0
      ) * 15;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_required_credits <= 0 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant_id::text)::bigint);
  v_usage := public.get_restaurant_credit_usage(v_restaurant_id);
  v_available_credits := public.tok_credit_balance_from_usage(v_usage) + v_old_required_credits;

  IF TG_TABLE_NAME = 'ad_campaigns'
    AND COALESCE((v_usage->'credits'->0->'metadata'->>'preactivation')::boolean, false)
  THEN
    v_available_credits := GREATEST(COALESCE(
      (v_usage->'credits'->0->'metadata'->>'campaign_spendable_balance')::numeric, 0
    ), 0) + v_old_required_credits;
  END IF;

  IF v_required_credits > v_available_credits THEN
    RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %, available %',
      v_restaurant_id, v_required_credits, v_available_credits
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_restaurant_tok_credit_spend()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_restaurant_tok_credit_spend() TO service_role;

NOTIFY pgrst, 'reload schema';
