-- Internal OpenAI entitlement for the verified MTNR Concept owner.
-- This is NOT a TOK credit purchase. It cannot fund ad campaigns or Stripe spending.
-- The existing OpenAI provider billing, usage logs, and per-request rate limits remain active.

CREATE TABLE IF NOT EXISTS private_finance.internal_unlimited_openai_grants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'internal_owner_access',
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS internal_unlimited_openai_grants_restaurant_idx
  ON private_finance.internal_unlimited_openai_grants (restaurant_id)
  WHERE enabled;

ALTER TABLE private_finance.internal_unlimited_openai_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private_finance.internal_unlimited_openai_grants
  FROM PUBLIC, anon, authenticated, service_role;

-- Seed only after verifying BOTH the immutable auth user ID and current owner.
-- In clean development databases where this account does not exist, seed zero rows.
INSERT INTO private_finance.internal_unlimited_openai_grants
  (user_id, restaurant_id, reason, enabled)
SELECT u.id, r.id, 'mtnrconcept_owner_unlimited_openai', true
FROM auth.users u
JOIN public.restaurants r ON r.owner_id = u.id
WHERE u.id = '2e27851c-5301-48e5-a046-1b949b918e7d'::uuid
  AND lower(u.email) = 'mtnrconcept@gmail.com'
  AND r.id = 'fe046974-2945-4cf5-89cb-9c52ff354b93'::uuid
ON CONFLICT (user_id, restaurant_id)
DO UPDATE SET enabled = true, reason = EXCLUDED.reason;

-- Private grant lookup: a service-role request may look up an actor explicitly.
-- For an authenticated JWT, only the caller's own grant is recognized.
CREATE OR REPLACE FUNCTION private_finance.has_internal_unlimited_openai_grant(
  p_restaurant_id uuid, p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private_finance.internal_unlimited_openai_grants grant_row
    JOIN public.restaurants r
      ON r.id = grant_row.restaurant_id AND r.owner_id = grant_row.user_id
    WHERE grant_row.restaurant_id = p_restaurant_id
      AND grant_row.enabled
      AND (
        (auth.role() = 'service_role'
          AND (p_user_id IS NULL OR p_user_id = grant_row.user_id))
        OR
        (auth.uid() IS NOT NULL AND grant_row.user_id = auth.uid()
          AND (p_user_id IS NULL OR p_user_id = auth.uid()))
      )
  );
$$;

REVOKE ALL ON FUNCTION private_finance.has_internal_unlimited_openai_grant(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep actual purchased and weekly trial credits independent from subsidized
-- OpenAI generations. Only usage by the verified owner AFTER grant creation
-- is excluded; historical charges and all other users remain fully billable.
CREATE OR REPLACE VIEW private_finance.chargeable_ai_usage_logs
  WITH (security_barrier = true)
AS
SELECT logged.*
FROM public.ai_usage_logs logged
WHERE NOT EXISTS (
  SELECT 1
  FROM private_finance.internal_unlimited_openai_grants grant_row
  JOIN public.restaurants r
    ON r.id = grant_row.restaurant_id AND r.owner_id = grant_row.user_id
  WHERE grant_row.enabled
    AND grant_row.user_id = logged.user_id
    AND grant_row.restaurant_id = logged.restaurant_id
    AND logged.created_at >= grant_row.granted_at
);

REVOKE ALL ON private_finance.chargeable_ai_usage_logs
  FROM PUBLIC, anon, authenticated, service_role;

-- Explicit, reviewed function definitions: no dynamic SQL or database source evaluation.
-- Keep the original billing logic and replace only the AI-usage source view.
CREATE OR REPLACE FUNCTION private_finance.get_restaurant_preactivation_credit_usage(p_restaurant_id uuid, p_anchor timestamp with time zone, p_trial_eligible boolean, p_spend_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Replay up to 24 months of purchases and usage so an old, now-expired
  -- lot can still cover a historical charge before a newer lot was bought.
  -- Only lots currently unexpired count toward the returned paid balance.
  -- Replay in chronological order: weekly trial credits
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
        AND COALESCE(paid_at, updated_at, created_at) >= p_anchor - interval '24 months'
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
      FROM private_finance.chargeable_ai_usage_logs
      WHERE restaurant_id = p_restaurant_id
        AND status = 'success'
        AND created_at >= p_anchor - interval '24 months'
        AND created_at < LEAST(p_anchor, COALESCE(p_spend_before, p_anchor))

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
          >= p_anchor - interval '24 months'
        AND COALESCE(activated_at, scheduled_at, starts_at, created_at, updated_at)
          < LEAST(p_anchor, COALESCE(p_spend_before, p_anchor))
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage_before_fair_growth(p_restaurant_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subscription record;
  v_plan_id uuid;
  v_plan_slug text;
  v_plan_name text;
  v_plan_description text;
  v_plan_price_monthly_chf numeric(12, 2);
  v_plan_campaign_credit_chf numeric(12, 2) := 0;
  v_plan_ai_tool_credits integer := 0;
  v_plan_ai_photo_credits integer := 0;
  v_plan_features jsonb := '[]'::jsonb;
  v_plan_position integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_subscription_tok_allowance numeric(14, 2) := 0;
  v_topup_tok_allowance numeric(14, 2) := 0;
  v_tok_allowance numeric(14, 2) := 0;
  v_tok_spent numeric(14, 2) := 0;
  v_topup_first_at timestamptz;
  v_pre_topup_spent numeric(14, 2) := 0;
  v_post_topup_spent numeric(14, 2) := 0;
  v_subscription_remaining_at_topup numeric(14, 2) := 0;
  v_topup_spent numeric(14, 2) := 0;
  v_subscription_spent numeric(14, 2) := 0;
  v_subscription_balance numeric(14, 2) := 0;
  v_topup_balance numeric(14, 2) := 0;
  v_campaign_spent_chf numeric(12, 2) := 0;
  v_ai_spent integer := 0;
  v_photo_spent integer := 0;
  v_campaign_entries jsonb := '[]'::jsonb;
  v_ai_entries jsonb := '[]'::jsonb;
  v_photo_entries jsonb := '[]'::jsonb;
  v_entries jsonb := '[]'::jsonb;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT COALESCE(public.has_role(auth.uid(), 'admin'), false)
    AND NOT COALESCE(public.auth_owns_restaurant(p_restaurant_id), false)
  THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT
    ras.id,
    ras.restaurant_id,
    ras.restaurant_subscription_plan_id,
    ras.plan,
    ras.status,
    ras.billing_period,
    ras.stripe_subscription_id,
    ras.stripe_checkout_session_id,
    ras.monthly_campaign_credit_chf,
    ras.monthly_ai_tool_credits,
    ras.monthly_photo_retouch_credits,
    ras.current_period_start,
    ras.current_period_end,
    ras.metadata,
    ras.created_at,
    ras.updated_at
  INTO v_subscription
  FROM public.restaurant_ai_subscriptions ras
  WHERE ras.restaurant_id = p_restaurant_id
  ORDER BY
    CASE WHEN ras.status IN ('trialing', 'active') THEN 0 ELSE 1 END,
    ras.current_period_end DESC,
    ras.created_at DESC
  LIMIT 1;

  IF v_subscription.id IS NOT NULL AND v_subscription.restaurant_subscription_plan_id IS NOT NULL THEN
    SELECT
      rsp.id,
      rsp.slug,
      rsp.name,
      rsp.description,
      rsp.price_monthly_chf,
      rsp.campaign_credit_chf,
      rsp.ai_tool_credits,
      rsp.ai_photo_credits,
      rsp.features,
      rsp.position
    INTO
      v_plan_id,
      v_plan_slug,
      v_plan_name,
      v_plan_description,
      v_plan_price_monthly_chf,
      v_plan_campaign_credit_chf,
      v_plan_ai_tool_credits,
      v_plan_ai_photo_credits,
      v_plan_features,
      v_plan_position
    FROM public.restaurant_subscription_plans rsp
    WHERE rsp.id = v_subscription.restaurant_subscription_plan_id
    LIMIT 1;
  ELSIF v_subscription.id IS NOT NULL AND v_subscription.plan IS NOT NULL THEN
    SELECT
      rsp.id,
      rsp.slug,
      rsp.name,
      rsp.description,
      rsp.price_monthly_chf,
      rsp.campaign_credit_chf,
      rsp.ai_tool_credits,
      rsp.ai_photo_credits,
      rsp.features,
      rsp.position
    INTO
      v_plan_id,
      v_plan_slug,
      v_plan_name,
      v_plan_description,
      v_plan_price_monthly_chf,
      v_plan_campaign_credit_chf,
      v_plan_ai_tool_credits,
      v_plan_ai_photo_credits,
      v_plan_features,
      v_plan_position
    FROM public.restaurant_subscription_plans rsp
    WHERE rsp.slug = v_subscription.plan
    LIMIT 1;
  END IF;

  IF v_subscription.id IS NULL THEN
    v_period_start := COALESCE(p_since, date_trunc('month', now()));
    v_period_end := COALESCE(p_until, now());
  ELSE
    v_period_start := COALESCE(p_since, v_subscription.current_period_start, date_trunc('month', now()));
    v_period_end := COALESCE(p_until, v_subscription.current_period_end, now());
  END IF;

  IF v_period_end <= v_period_start THEN
    v_period_end := v_period_start + interval '1 month';
  END IF;

  v_subscription_tok_allowance := COALESCE(
    CASE
      WHEN v_subscription.id IS NOT NULL THEN
        (COALESCE(v_subscription.monthly_campaign_credit_chf, 0) * 15)
        + COALESCE(v_subscription.monthly_ai_tool_credits, 0)
        + COALESCE(v_subscription.monthly_photo_retouch_credits, 0)
    END,
    (COALESCE(v_plan_campaign_credit_chf, 0) * 15)
      + COALESCE(v_plan_ai_tool_credits, 0)
      + COALESCE(v_plan_ai_photo_credits, 0),
    0
  )::numeric(14, 2);

  SELECT
    COALESCE(sum((rcp.campaign_credit_chf * 15) + rcp.ai_tool_credits + rcp.ai_photo_credits), 0)::numeric(14, 2),
    min(COALESCE(rcp.paid_at, rcp.updated_at, rcp.created_at))
  INTO v_topup_tok_allowance, v_topup_first_at
  FROM public.restaurant_credit_purchases rcp
  WHERE rcp.restaurant_id = p_restaurant_id
    AND rcp.status = 'paid'
    AND COALESCE(rcp.paid_at, rcp.updated_at, rcp.created_at) >= (v_period_end - interval '12 months')
    AND COALESCE(rcp.paid_at, rcp.updated_at, rcp.created_at) < v_period_end;

  v_tok_allowance := v_subscription_tok_allowance + v_topup_tok_allowance;

  WITH campaign_rows AS (
    SELECT
      ac.id,
      ac.title,
      ac.status,
      ac.payment_status,
      ac.payment_method,
      COALESCE(ac.activated_at, ac.scheduled_at, ac.starts_at, ac.created_at, ac.updated_at, now()) AS occurred_at,
      CASE
        WHEN lower(COALESCE(ac.payment_method, '')) = 'credits'
          AND lower(COALESCE(ac.payment_status, '')) = 'paid'
        THEN GREATEST(COALESCE(ac.total_budget, 0), COALESCE(ac.spent, 0), 0)::numeric(12, 2)
        ELSE 0::numeric(12, 2)
      END AS credit_amount_chf,
      COALESCE(ac.total_budget, 0)::numeric(12, 2) AS budget_chf
    FROM public.ad_campaigns ac
    WHERE ac.restaurant_id = p_restaurant_id
      AND COALESCE(ac.activated_at, ac.scheduled_at, ac.starts_at, ac.created_at, ac.updated_at, now()) >= v_period_start
      AND COALESCE(ac.activated_at, ac.scheduled_at, ac.starts_at, ac.created_at, ac.updated_at, now()) < v_period_end
  )
  SELECT
    COALESCE(sum(cr.credit_amount_chf), 0)::numeric(12, 2),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cr.id,
          'credit_kind', 'campaign',
          'label', cr.title,
          'description', 'Budget campagne reserve sur credits TOK',
          'occurred_at', cr.occurred_at,
          'credit_amount', cr.credit_amount_chf * 15,
          'credit_unit', 'credit',
          'estimated_cost_chf', cr.credit_amount_chf,
          'status', cr.status,
          'metadata', jsonb_build_object(
            'payment_status', cr.payment_status,
            'payment_method', cr.payment_method,
            'budget_chf', cr.budget_chf,
            'campaign_credit_rate', 15
          ),
          'source_table', 'ad_campaigns',
          'source_id', cr.id
        )
        ORDER BY cr.occurred_at DESC
      ) FILTER (WHERE cr.credit_amount_chf > 0),
      '[]'::jsonb
    )
  INTO v_campaign_spent_chf, v_campaign_entries
  FROM campaign_rows cr;

  WITH usage_rows AS (
    SELECT
      ul.id,
      ul.function_name,
      ul.action,
      COALESCE(ul.feature_name, ul.metadata->>'feature', ul.action, ul.function_name, 'unknown') AS feature_label,
      ul.model,
      ul.status,
      ul.total_tokens,
      COALESCE(ul.estimated_cost_chf, 0)::numeric(12, 6) AS estimated_cost_chf,
      ul.created_at AS occurred_at,
      ul.metadata,
      CASE
        WHEN ul.metadata->>'credit_kind' IN ('ai_tools', 'photo_retouch')
        THEN ul.metadata->>'credit_kind'
        WHEN ul.function_name = 'ai-image-enhance'
          OR COALESCE(ul.feature_name, ul.metadata->>'feature', ul.action, '') ILIKE '%photo%'
          OR COALESCE(ul.feature_name, ul.metadata->>'feature', ul.action, '') ILIKE '%image%'
        THEN 'photo_retouch'
        ELSE 'ai_tools'
      END AS credit_kind,
      GREATEST(
        COALESCE(
          CASE WHEN (ul.metadata->>'credit_units') ~ '^[0-9]+$' THEN (ul.metadata->>'credit_units')::integer END,
          CASE WHEN ul.function_name IN ('ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor', 'generate-campaign', 'floorplan-ai', 'ai-accounting-agent') THEN 5 END,
          CASE WHEN (ul.metadata->>'image_count') ~ '^[0-9]+$' THEN (ul.metadata->>'image_count')::integer END,
          CASE WHEN (ul.metadata->>'variant_count') ~ '^[0-9]+$' THEN (ul.metadata->>'variant_count')::integer END,
          1
        ),
        1
      ) AS credit_units
    FROM private_finance.chargeable_ai_usage_logs ul
    WHERE ul.restaurant_id = p_restaurant_id
      AND ul.status = 'success'
      AND ul.created_at >= v_period_start
      AND ul.created_at < v_period_end
  ),
  ai_tool_rows AS (
    SELECT *
    FROM usage_rows
    WHERE credit_kind = 'ai_tools'
  ),
  photo_rows AS (
    SELECT *
    FROM usage_rows
    WHERE credit_kind = 'photo_retouch'
  )
  SELECT
    COALESCE((SELECT sum(credit_units)::integer FROM ai_tool_rows), 0),
    COALESCE((SELECT sum(credit_units)::integer FROM photo_rows), 0),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ar.id,
            'credit_kind', 'ai_tools',
            'label', ar.feature_label,
            'description', ar.action,
            'occurred_at', ar.occurred_at,
            'credit_amount', ar.credit_units,
            'credit_unit', 'credit',
            'estimated_cost_chf', ar.estimated_cost_chf,
            'status', ar.status,
            'metadata', jsonb_build_object(
              'function_name', ar.function_name,
              'model', ar.model,
              'total_tokens', ar.total_tokens,
              'credit_units', ar.credit_units
            ),
            'source_table', 'ai_usage_logs',
            'source_id', ar.id
          )
          ORDER BY ar.occurred_at DESC
        )
        FROM ai_tool_rows ar
      ),
      '[]'::jsonb
    ),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pr.id,
            'credit_kind', 'photo_retouch',
            'label', pr.feature_label,
            'description', pr.action,
            'occurred_at', pr.occurred_at,
            'credit_amount', pr.credit_units,
            'credit_unit', 'credit',
            'estimated_cost_chf', pr.estimated_cost_chf,
            'status', pr.status,
            'metadata', jsonb_build_object(
              'function_name', pr.function_name,
              'model', pr.model,
              'total_tokens', pr.total_tokens,
              'credit_units', pr.credit_units
            ),
            'source_table', 'ai_usage_logs',
            'source_id', pr.id
          )
          ORDER BY pr.occurred_at DESC
        )
        FROM photo_rows pr
      ),
      '[]'::jsonb
    )
  INTO v_ai_spent, v_photo_spent, v_ai_entries, v_photo_entries;

  v_tok_spent := (COALESCE(v_campaign_spent_chf, 0) * 15) + COALESCE(v_ai_spent, 0) + COALESCE(v_photo_spent, 0);

  IF v_topup_first_at IS NOT NULL AND v_topup_first_at > v_period_start THEN
    WITH campaign_spend AS (
      SELECT COALESCE(sum(
        CASE
          WHEN lower(COALESCE(ac.payment_method, '')) = 'credits'
            AND lower(COALESCE(ac.payment_status, '')) = 'paid'
          THEN GREATEST(COALESCE(ac.total_budget, 0), COALESCE(ac.spent, 0), 0) * 15
          ELSE 0
        END
      ), 0)::numeric(14, 2) AS units
      FROM public.ad_campaigns ac
      WHERE ac.restaurant_id = p_restaurant_id
        AND COALESCE(ac.activated_at, ac.scheduled_at, ac.starts_at, ac.created_at, ac.updated_at, now()) >= v_period_start
        AND COALESCE(ac.activated_at, ac.scheduled_at, ac.starts_at, ac.created_at, ac.updated_at, now()) < v_topup_first_at
    ),
    ai_spend AS (
      SELECT COALESCE(sum(
        GREATEST(
          COALESCE(
            CASE WHEN (ul.metadata->>'credit_units') ~ '^[0-9]+$' THEN (ul.metadata->>'credit_units')::integer END,
            CASE WHEN ul.function_name IN ('ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor', 'generate-campaign', 'floorplan-ai', 'ai-accounting-agent') THEN 5 END,
            CASE WHEN (ul.metadata->>'image_count') ~ '^[0-9]+$' THEN (ul.metadata->>'image_count')::integer END,
            CASE WHEN (ul.metadata->>'variant_count') ~ '^[0-9]+$' THEN (ul.metadata->>'variant_count')::integer END,
            1
          ),
          1
        )
      ), 0)::numeric(14, 2) AS units
      FROM private_finance.chargeable_ai_usage_logs ul
      WHERE ul.restaurant_id = p_restaurant_id
        AND ul.status = 'success'
        AND ul.created_at >= v_period_start
        AND ul.created_at < v_topup_first_at
    )
    SELECT campaign_spend.units + ai_spend.units
    INTO v_pre_topup_spent
    FROM campaign_spend, ai_spend;
  END IF;

  v_post_topup_spent := GREATEST(v_tok_spent - v_pre_topup_spent, 0);
  v_subscription_remaining_at_topup := GREATEST(v_subscription_tok_allowance - v_pre_topup_spent, 0);
  v_topup_spent := LEAST(v_topup_tok_allowance, GREATEST(v_post_topup_spent - v_subscription_remaining_at_topup, 0));
  v_subscription_spent := GREATEST(v_tok_spent - v_topup_spent, 0);
  v_subscription_balance := GREATEST(v_subscription_tok_allowance - v_subscription_spent, 0);
  v_topup_balance := GREATEST(v_topup_tok_allowance - v_topup_spent, 0);

  SELECT COALESCE(jsonb_agg(entry ORDER BY (entry->>'occurred_at')::timestamptz DESC), '[]'::jsonb)
  INTO v_entries
  FROM jsonb_array_elements(v_campaign_entries || v_ai_entries || v_photo_entries) AS detail(entry);

  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'start', v_period_start,
      'end', v_period_end,
      'generated_at', now()
    ),
    'subscription', CASE
      WHEN v_subscription.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_subscription.id,
        'restaurant_id', v_subscription.restaurant_id,
        'plan', v_subscription.plan,
        'status', v_subscription.status,
        'billing_period', COALESCE(v_subscription.billing_period, 'monthly'),
        'stripe_subscription_id', v_subscription.stripe_subscription_id,
        'current_period_start', v_subscription.current_period_start,
        'current_period_end', v_subscription.current_period_end,
        'plan_record', CASE
          WHEN v_plan_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', v_plan_id,
            'slug', v_plan_slug,
            'name', v_plan_name,
            'description', v_plan_description,
            'price_monthly_chf', v_plan_price_monthly_chf,
            'features', v_plan_features,
            'position', v_plan_position
          )
        END
      )
    END,
    'credits', jsonb_build_array(
      jsonb_build_object(
        'kind', 'tok_credits',
        'label', 'Credits TOK',
        'unit', 'credit',
        'allowance', round(v_tok_allowance),
        'included_allowance', round(v_subscription_tok_allowance),
        'topup_allowance', round(v_topup_tok_allowance),
        'spent', round(v_tok_spent),
        'subscription_spent', round(v_subscription_spent),
        'topup_spent', round(v_topup_spent),
        'balance', round(GREATEST(v_subscription_balance + v_topup_balance, 0)),
        'subscription_balance', round(v_subscription_balance),
        'topup_balance', round(v_topup_balance),
        'metadata', jsonb_build_object(
          'campaign_credit_rate', 15,
          'campaign_equivalent_chf', round(GREATEST(v_subscription_balance + v_topup_balance, 0) / 15, 2),
          'included_allowance', round(v_subscription_tok_allowance),
          'topup_allowance', round(v_topup_tok_allowance),
          'subscription_balance', round(v_subscription_balance),
          'topup_balance', round(v_topup_balance),
          'topup_spent', round(v_topup_spent),
          'topup_first_at', v_topup_first_at,
          'subscription_credits_expiry', 'current_month',
          'topup_credits_expiry_months', 12,
          'legacy_campaign_spent_chf', v_campaign_spent_chf,
          'ai_tool_spent_credits', v_ai_spent,
          'photo_spent_credits', v_photo_spent
        )
      )
    ),
    'entries', v_entries
  );
END;
$function$
;

-- Preserve the current Fair Growth / 15-per-week wallet implementation exactly.
-- The wrapper changes only the AI-facing balance, not actual purchased-credit data.
DO $$
BEGIN
  IF to_regprocedure('public.get_restaurant_credit_usage_before_internal_ai_grant(uuid,timestamptz,timestamptz)') IS NULL THEN
    ALTER FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
      RENAME TO get_restaurant_credit_usage_before_internal_ai_grant;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_credit jsonb;
  v_real_balance numeric;
  v_campaign_balance numeric;
BEGIN
  -- The underlying implementation checks ownership/admin permissions first.
  v_result := public.get_restaurant_credit_usage_before_internal_ai_grant(
    p_restaurant_id, p_since, p_until
  );

  IF NOT private_finance.has_internal_unlimited_openai_grant(p_restaurant_id) THEN
    RETURN v_result;
  END IF;

  v_credit := COALESCE(v_result->'credits'->0, '{}'::jsonb);
  IF v_credit = '{}'::jsonb THEN RETURN v_result; END IF;

  v_real_balance := GREATEST(COALESCE((v_credit->>'balance')::numeric, 0), 0);
  v_campaign_balance := GREATEST(COALESCE(
    (v_credit->'metadata'->>'campaign_spendable_balance')::numeric,
    v_real_balance
  ), 0);
  v_credit := v_credit || jsonb_build_object(
    'balance', 2000000000,
    'metadata', COALESCE(v_credit->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'internal_unlimited_openai', true,
        'campaign_spendable_balance', v_campaign_balance,
        'actual_tok_credit_balance', v_real_balance
      )
  );
  RETURN jsonb_set(v_result, '{credits,0}', v_credit, false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- Preserve subscription checks, ownership checks and feature flags.
-- Only the named owner's AI usage quota becomes unlimited.
DO $$
BEGIN
  IF to_regprocedure('public.check_restaurant_ai_quota_before_internal_ai_grant(uuid,text,integer)') IS NULL THEN
    ALTER FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
      RENAME TO check_restaurant_ai_quota_before_internal_ai_grant;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(
  p_restaurant_id uuid,
  p_feature text,
  p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.check_restaurant_ai_quota_before_internal_ai_grant(
    p_restaurant_id, p_feature, p_units
  );

  IF v_result->>'reason' = 'feature_disabled'
    OR NOT private_finance.has_internal_unlimited_openai_grant(p_restaurant_id)
  THEN
    RETURN v_result;
  END IF;

  RETURN v_result || jsonb_build_object(
    'allowed', true,
    'limit', -1,
    'remaining', -1,
    'reason', NULL,
    'internal_unlimited_openai', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
  TO authenticated, service_role;

-- The standard ledger guard uses the displayed balance. Add a second guard:
-- campaigns and non-granted actors must use the real wallet, never the AI grant.
CREATE OR REPLACE FUNCTION private_finance.guard_internal_unlimited_ai_spend()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restaurant_id uuid := NEW.restaurant_id;
  v_usage jsonb;
  v_required numeric(14,2) := 0;
  v_previous numeric(14,2) := 0;
  v_available numeric(14,2) := 0;
BEGIN
  IF v_restaurant_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM private_finance.internal_unlimited_openai_grants g
      JOIN public.restaurants r
        ON r.id = g.restaurant_id AND r.owner_id = g.user_id
      WHERE g.restaurant_id = v_restaurant_id AND g.enabled
    )
  THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'ai_usage_logs' THEN
    IF lower(COALESCE(NEW.status, '')) <> 'success' THEN RETURN NEW; END IF;
    IF private_finance.has_internal_unlimited_openai_grant(v_restaurant_id, NEW.user_id) THEN
      RETURN NEW;
    END IF;

    -- Mirror the existing 15-credit ledger fallback for other actors.
    v_required := GREATEST(COALESCE(
      CASE WHEN NEW.metadata->>'credit_units' ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (NEW.metadata->>'credit_units')::numeric END,
      CASE WHEN NEW.function_name IN (
        'ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor',
        'generate-campaign', 'floorplan-ai', 'ai-accounting-agent'
      ) THEN 5 END,
      CASE WHEN NEW.metadata->>'image_count' ~ '^[0-9]+$'
        THEN (NEW.metadata->>'image_count')::numeric END,
      CASE WHEN NEW.metadata->>'variant_count' ~ '^[0-9]+$'
        THEN (NEW.metadata->>'variant_count')::numeric END,
      1
    ), 1);

    IF TG_OP = 'UPDATE' AND OLD.restaurant_id = NEW.restaurant_id
      AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
      AND lower(COALESCE(OLD.status, '')) = 'success'
    THEN
      v_previous := GREATEST(COALESCE(
        CASE WHEN OLD.metadata->>'credit_units' ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (OLD.metadata->>'credit_units')::numeric END,
        CASE WHEN OLD.function_name IN (
          'ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor',
          'generate-campaign', 'floorplan-ai', 'ai-accounting-agent'
        ) THEN 5 END,
        CASE WHEN OLD.metadata->>'image_count' ~ '^[0-9]+$'
          THEN (OLD.metadata->>'image_count')::numeric END,
        CASE WHEN OLD.metadata->>'variant_count' ~ '^[0-9]+$'
          THEN (OLD.metadata->>'variant_count')::numeric END,
        1
      ), 1);
    END IF;
  ELSIF TG_TABLE_NAME = 'ad_campaigns' THEN
    IF lower(COALESCE(NEW.payment_method, '')) <> 'credits'
      OR lower(COALESCE(NEW.payment_status, '')) <> 'paid'
    THEN RETURN NEW; END IF;

    v_required := GREATEST(
      COALESCE(NEW.total_budget, 0), COALESCE(NEW.spent, 0),
      COALESCE(NEW.paid_amount, 0), 0
    ) * 15;
    IF TG_OP = 'UPDATE' AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(COALESCE(OLD.payment_method, '')) = 'credits'
      AND lower(COALESCE(OLD.payment_status, '')) = 'paid'
    THEN
      v_previous := GREATEST(
        COALESCE(OLD.total_budget, 0), COALESCE(OLD.spent, 0),
        COALESCE(OLD.paid_amount, 0), 0
      ) * 15;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_required <= 0 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant_id::text)::bigint);

  v_usage := public.get_restaurant_credit_usage_before_internal_ai_grant(v_restaurant_id);
  v_available := public.tok_credit_balance_from_usage(v_usage) + v_previous;

  IF TG_TABLE_NAME = 'ad_campaigns'
    AND COALESCE((v_usage->'credits'->0->'metadata'->>'preactivation')::boolean, false)
  THEN
    v_available := GREATEST(COALESCE(
      (v_usage->'credits'->0->'metadata'->>'campaign_spendable_balance')::numeric, 0
    ), 0) + v_previous;
  END IF;

  IF v_required > v_available THEN
    RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %, available %',
      v_restaurant_id, v_required, v_available
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private_finance.guard_internal_unlimited_ai_spend()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_internal_unlimited_ai_usage ON public.ai_usage_logs;
CREATE TRIGGER guard_internal_unlimited_ai_usage
BEFORE INSERT OR UPDATE OF restaurant_id, user_id, status, metadata ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION private_finance.guard_internal_unlimited_ai_spend();

DROP TRIGGER IF EXISTS guard_internal_unlimited_campaign_spend ON public.ad_campaigns;
CREATE TRIGGER guard_internal_unlimited_campaign_spend
BEFORE INSERT OR UPDATE OF restaurant_id, payment_method, payment_status,
  total_budget, spent, paid_amount ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION private_finance.guard_internal_unlimited_ai_spend();

NOTIFY pgrst, 'reload schema';
