-- Unified restaurateur credit model.
-- Historical columns stay in place for Stripe/webhook compatibility, but the
-- account surface and credit usage RPC expose one universal TOK credit balance.

UPDATE public.restaurant_subscription_plans
SET
  description = CASE slug
    WHEN 'starter' THEN '750 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    WHEN 'pro' THEN '1''800 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    WHEN 'premium' THEN '3''000 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    WHEN 'elite' THEN '6''750 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    ELSE description
  END,
  campaign_credit_chf = CASE slug
    WHEN 'starter' THEN 50
    WHEN 'pro' THEN 120
    WHEN 'premium' THEN 200
    WHEN 'elite' THEN 450
    ELSE campaign_credit_chf
  END,
  ai_tool_credits = CASE WHEN slug IN ('starter', 'pro', 'premium', 'elite') THEN 0 ELSE ai_tool_credits END,
  ai_photo_credits = CASE WHEN slug IN ('starter', 'pro', 'premium', 'elite') THEN 0 ELSE ai_photo_credits END,
  monthly_conversation_limit = CASE slug
    WHEN 'starter' THEN 150
    WHEN 'pro' THEN 360
    WHEN 'premium' THEN 600
    WHEN 'elite' THEN 1350
    ELSE monthly_conversation_limit
  END,
  monthly_text_tool_limit = CASE slug
    WHEN 'starter' THEN 150
    WHEN 'pro' THEN 360
    WHEN 'premium' THEN 600
    WHEN 'elite' THEN 1350
    ELSE monthly_text_tool_limit
  END,
  monthly_image_limit = CASE slug
    WHEN 'starter' THEN 30
    WHEN 'pro' THEN 72
    WHEN 'premium' THEN 120
    WHEN 'elite' THEN 270
    ELSE monthly_image_limit
  END,
  monthly_premium_image_limit = CASE slug
    WHEN 'starter' THEN 12
    WHEN 'pro' THEN 30
    WHEN 'premium' THEN 50
    WHEN 'elite' THEN 112
    ELSE monthly_premium_image_limit
  END,
  features = CASE slug
    WHEN 'starter' THEN '["750 crédits TOK / mois", "50 CHF de campagnes TOK ou 150 requêtes IA simples ou 30 retouches photo simples", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'pro' THEN '["1''800 crédits TOK / mois", "120 CHF de campagnes TOK ou 360 requêtes IA simples ou 72 retouches photo simples", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'premium' THEN '["3''000 crédits TOK / mois", "200 CHF de campagnes TOK ou 600 requêtes IA simples ou 50 photos culinaires pro", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'elite' THEN '["6''750 crédits TOK / mois", "450 CHF de campagnes TOK ou 1''350 requêtes IA simples ou 112 photos culinaires pro", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    ELSE features
  END,
  updated_at = now()
WHERE slug IN ('starter', 'pro', 'premium', 'elite');

UPDATE public.restaurant_ai_subscriptions ras
SET
  monthly_campaign_credit_chf = rsp.campaign_credit_chf,
  monthly_ai_tool_credits = rsp.ai_tool_credits,
  monthly_photo_retouch_credits = rsp.ai_photo_credits,
  monthly_conversation_limit = rsp.monthly_conversation_limit,
  monthly_text_tool_limit = rsp.monthly_text_tool_limit,
  monthly_image_limit = rsp.monthly_image_limit,
  monthly_premium_image_limit = rsp.monthly_premium_image_limit,
  updated_at = now()
FROM public.restaurant_subscription_plans rsp
WHERE ras.status IN ('trialing', 'active')
  AND (
    ras.restaurant_subscription_plan_id = rsp.id
    OR ras.plan = rsp.slug
  )
  AND rsp.slug IN ('starter', 'pro', 'premium', 'elite');

UPDATE public.restaurant_credit_packs
SET is_active = false,
    updated_at = now()
WHERE slug IN ('campaign-100', 'campaign-250', 'ai-100', 'growth-mix');

INSERT INTO public.restaurant_credit_packs (
  slug,
  name,
  description,
  price_chf,
  campaign_credit_chf,
  ai_tool_credits,
  ai_photo_credits,
  features,
  position,
  is_active
)
VALUES
  (
    'tok-credits-600',
    'Recharge 600',
    '600 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    49,
    40,
    0,
    0,
    '["600 crédits TOK", "40 CHF de campagnes TOK", "120 requêtes assistant IA simples", "Crédits recharge valables 12 mois"]'::jsonb,
    10,
    true
  ),
  (
    'tok-credits-1500',
    'Recharge 1''500',
    '1''500 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    100,
    100,
    0,
    0,
    '["1''500 crédits TOK", "100 CHF de campagnes TOK", "300 requêtes assistant IA simples", "Crédits recharge valables 12 mois"]'::jsonb,
    20,
    true
  ),
  (
    'tok-credits-3750',
    'Recharge 3''750',
    '3''750 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    240,
    250,
    0,
    0,
    '["3''750 crédits TOK", "250 CHF de campagnes TOK", "750 requêtes assistant IA simples", "Crédits recharge valables 12 mois"]'::jsonb,
    30,
    true
  ),
  (
    'tok-credits-growth',
    'Recharge Croissance',
    '5''250 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    349,
    350,
    0,
    0,
    '["5''250 crédits TOK", "350 CHF de campagnes TOK", "1''050 requêtes assistant IA simples", "43 affiches ou flyers IA", "Crédits recharge valables 12 mois"]'::jsonb,
    40,
    true
  )
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_chf = EXCLUDED.price_chf,
    campaign_credit_chf = EXCLUDED.campaign_credit_chf,
    ai_tool_credits = EXCLUDED.ai_tool_credits,
    ai_photo_credits = EXCLUDED.ai_photo_credits,
    features = EXCLUDED.features,
    position = EXCLUDED.position,
    is_active = EXCLUDED.is_active,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    COALESCE(sum((rcp.campaign_credit_chf * 15) + rcp.ai_tool_credits + rcp.ai_photo_credits), 0)::numeric(14, 2)
  INTO v_topup_tok_allowance
  FROM public.restaurant_credit_purchases rcp
  WHERE rcp.restaurant_id = p_restaurant_id
    AND rcp.status = 'paid'
    AND COALESCE(rcp.paid_at, rcp.updated_at, rcp.created_at) >= v_period_start
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
          'description', 'Budget campagne réservé sur crédits TOK',
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
    FROM public.ai_usage_logs ul
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
        'label', 'Crédits TOK',
        'unit', 'credit',
        'allowance', round(v_tok_allowance),
        'included_allowance', round(v_subscription_tok_allowance),
        'topup_allowance', round(v_topup_tok_allowance),
        'spent', round(v_tok_spent),
        'balance', round(GREATEST(v_tok_allowance - v_tok_spent, 0)),
        'metadata', jsonb_build_object(
          'campaign_credit_rate', 15,
          'campaign_equivalent_chf', round(GREATEST(v_tok_allowance - v_tok_spent, 0) / 15, 2),
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
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
