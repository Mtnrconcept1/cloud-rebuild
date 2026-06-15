-- Campaign and AI credit packs for restaurateur billing.
-- Purchases are created and reconciled by Edge Functions; the browser only reads packs and history.

CREATE TABLE IF NOT EXISTS public.restaurant_credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_chf numeric(12, 2) NOT NULL DEFAULT 0,
  campaign_credit_chf numeric(12, 2) NOT NULL DEFAULT 0,
  ai_tool_credits integer NOT NULL DEFAULT 0,
  ai_photo_credits integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_credit_packs_price_check CHECK (price_chf >= 0),
  CONSTRAINT restaurant_credit_packs_campaign_check CHECK (campaign_credit_chf >= 0),
  CONSTRAINT restaurant_credit_packs_ai_tool_check CHECK (ai_tool_credits >= 0),
  CONSTRAINT restaurant_credit_packs_ai_photo_check CHECK (ai_photo_credits >= 0),
  CONSTRAINT restaurant_credit_packs_non_empty_check CHECK (
    campaign_credit_chf > 0 OR ai_tool_credits > 0 OR ai_photo_credits > 0
  )
);

CREATE TABLE IF NOT EXISTS public.restaurant_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  credit_pack_id uuid NOT NULL REFERENCES public.restaurant_credit_packs(id) ON DELETE RESTRICT,
  purchased_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_payment',
  price_chf numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'chf',
  campaign_credit_chf numeric(12, 2) NOT NULL DEFAULT 0,
  ai_tool_credits integer NOT NULL DEFAULT 0,
  ai_photo_credits integer NOT NULL DEFAULT 0,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_mode text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_credit_purchases_status_check CHECK (
    status IN ('pending_payment', 'paid', 'failed', 'cancelled', 'refunded')
  ),
  CONSTRAINT restaurant_credit_purchases_price_check CHECK (price_chf >= 0),
  CONSTRAINT restaurant_credit_purchases_campaign_check CHECK (campaign_credit_chf >= 0),
  CONSTRAINT restaurant_credit_purchases_ai_tool_check CHECK (ai_tool_credits >= 0),
  CONSTRAINT restaurant_credit_purchases_ai_photo_check CHECK (ai_photo_credits >= 0)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_credit_packs_active_position
  ON public.restaurant_credit_packs(is_active, position, price_chf);

CREATE INDEX IF NOT EXISTS idx_restaurant_credit_purchases_restaurant_paid
  ON public.restaurant_credit_purchases(restaurant_id, status, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurant_credit_purchases_pack
  ON public.restaurant_credit_purchases(credit_pack_id, created_at DESC);

DROP TRIGGER IF EXISTS touch_restaurant_credit_packs_updated_at ON public.restaurant_credit_packs;
CREATE TRIGGER touch_restaurant_credit_packs_updated_at
BEFORE UPDATE ON public.restaurant_credit_packs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS touch_restaurant_credit_purchases_updated_at ON public.restaurant_credit_purchases;
CREATE TRIGGER touch_restaurant_credit_purchases_updated_at
BEFORE UPDATE ON public.restaurant_credit_purchases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.restaurant_credit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_credit_packs_active_select" ON public.restaurant_credit_packs;
CREATE POLICY "restaurant_credit_packs_active_select"
  ON public.restaurant_credit_packs
  FOR SELECT
  TO authenticated
  USING (is_active OR COALESCE(public.has_role(auth.uid(), 'admin'), false));

DROP POLICY IF EXISTS "restaurant_credit_packs_admin_all" ON public.restaurant_credit_packs;
CREATE POLICY "restaurant_credit_packs_admin_all"
  ON public.restaurant_credit_packs
  FOR ALL
  TO authenticated
  USING (COALESCE(public.has_role(auth.uid(), 'admin'), false))
  WITH CHECK (COALESCE(public.has_role(auth.uid(), 'admin'), false));

DROP POLICY IF EXISTS "restaurant_credit_purchases_owner_admin_select" ON public.restaurant_credit_purchases;
CREATE POLICY "restaurant_credit_purchases_owner_admin_select"
  ON public.restaurant_credit_purchases
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.has_role(auth.uid(), 'admin'), false)
    OR COALESCE(public.auth_owns_restaurant(restaurant_id), false)
  );

DROP POLICY IF EXISTS "restaurant_credit_purchases_admin_all" ON public.restaurant_credit_purchases;
CREATE POLICY "restaurant_credit_purchases_admin_all"
  ON public.restaurant_credit_purchases
  FOR ALL
  TO authenticated
  USING (COALESCE(public.has_role(auth.uid(), 'admin'), false))
  WITH CHECK (COALESCE(public.has_role(auth.uid(), 'admin'), false));

GRANT SELECT ON public.restaurant_credit_packs TO authenticated;
GRANT SELECT ON public.restaurant_credit_purchases TO authenticated;
GRANT ALL ON public.restaurant_credit_packs TO service_role;
GRANT ALL ON public.restaurant_credit_purchases TO service_role;

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
    'campaign-100',
    'Pack Campagnes 100',
    'Recharge de 100 CHF utilisable pour les campagnes TOK.',
    100,
    100,
    0,
    0,
    '["100 CHF de budget campagne", "Activation immediate apres paiement"]'::jsonb,
    10,
    true
  ),
  (
    'campaign-250',
    'Pack Campagnes 250',
    'Recharge de 250 CHF de budget publicitaire TOK.',
    240,
    250,
    0,
    0,
    '["250 CHF de budget campagne", "10 CHF offerts sur la recharge"]'::jsonb,
    20,
    true
  ),
  (
    'ai-100',
    'Pack IA 100',
    'Recharge de 100 credits pour les assistants IA restaurateur.',
    49,
    0,
    100,
    0,
    '["100 credits outils IA", "20 requetes assistant a 5 credits"]'::jsonb,
    30,
    true
  ),
  (
    'growth-mix',
    'Pack Croissance',
    'Recharge mixte pour campagnes, assistant IA et retouche photo.',
    349,
    300,
    100,
    20,
    '["300 CHF de budget campagne", "100 credits outils IA", "20 credits photo IA"]'::jsonb,
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
  v_subscription_campaign_allowance numeric(12, 2) := 0;
  v_subscription_ai_allowance integer := 0;
  v_subscription_photo_allowance integer := 0;
  v_topup_campaign_allowance numeric(12, 2) := 0;
  v_topup_ai_allowance integer := 0;
  v_topup_photo_allowance integer := 0;
  v_campaign_allowance numeric(12, 2) := 0;
  v_ai_allowance integer := 0;
  v_photo_allowance integer := 0;
  v_campaign_spent numeric(12, 2) := 0;
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

  v_subscription_campaign_allowance := COALESCE(
    CASE WHEN v_subscription.id IS NOT NULL THEN v_subscription.monthly_campaign_credit_chf END,
    v_plan_campaign_credit_chf,
    0
  )::numeric(12, 2);
  v_subscription_ai_allowance := COALESCE(
    CASE WHEN v_subscription.id IS NOT NULL THEN v_subscription.monthly_ai_tool_credits END,
    v_plan_ai_tool_credits,
    0
  );
  v_subscription_photo_allowance := COALESCE(
    CASE WHEN v_subscription.id IS NOT NULL THEN v_subscription.monthly_photo_retouch_credits END,
    v_plan_ai_photo_credits,
    0
  );

  SELECT
    COALESCE(sum(rcp.campaign_credit_chf), 0)::numeric(12, 2),
    COALESCE(sum(rcp.ai_tool_credits), 0)::integer,
    COALESCE(sum(rcp.ai_photo_credits), 0)::integer
  INTO v_topup_campaign_allowance, v_topup_ai_allowance, v_topup_photo_allowance
  FROM public.restaurant_credit_purchases rcp
  WHERE rcp.restaurant_id = p_restaurant_id
    AND rcp.status = 'paid'
    AND COALESCE(rcp.paid_at, rcp.updated_at, rcp.created_at) >= v_period_start
    AND COALESCE(rcp.paid_at, rcp.updated_at, rcp.created_at) < v_period_end;

  v_campaign_allowance := v_subscription_campaign_allowance + v_topup_campaign_allowance;
  v_ai_allowance := v_subscription_ai_allowance + v_topup_ai_allowance;
  v_photo_allowance := v_subscription_photo_allowance + v_topup_photo_allowance;

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
          'credit_amount', cr.credit_amount_chf,
          'credit_unit', 'CHF',
          'estimated_cost_chf', cr.credit_amount_chf,
          'status', cr.status,
          'metadata', jsonb_build_object(
            'payment_status', cr.payment_status,
            'payment_method', cr.payment_method,
            'budget_chf', cr.budget_chf
          ),
          'source_table', 'ad_campaigns',
          'source_id', cr.id
        )
        ORDER BY cr.occurred_at DESC
      ) FILTER (WHERE cr.credit_amount_chf > 0),
      '[]'::jsonb
    )
  INTO v_campaign_spent, v_campaign_entries
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
        'kind', 'campaign',
        'label', 'Credits campagnes',
        'unit', 'CHF',
        'allowance', v_campaign_allowance,
        'included_allowance', v_subscription_campaign_allowance,
        'topup_allowance', v_topup_campaign_allowance,
        'spent', v_campaign_spent,
        'balance', GREATEST(v_campaign_allowance - v_campaign_spent, 0)
      ),
      jsonb_build_object(
        'kind', 'ai_tools',
        'label', 'Credits outils IA',
        'unit', 'credit',
        'allowance', v_ai_allowance,
        'included_allowance', v_subscription_ai_allowance,
        'topup_allowance', v_topup_ai_allowance,
        'spent', v_ai_spent,
        'balance', GREATEST(v_ai_allowance - v_ai_spent, 0)
      ),
      jsonb_build_object(
        'kind', 'photo_retouch',
        'label', 'Credits photo IA',
        'unit', 'credit',
        'allowance', v_photo_allowance,
        'included_allowance', v_subscription_photo_allowance,
        'topup_allowance', v_topup_photo_allowance,
        'spent', v_photo_spent,
        'balance', GREATEST(v_photo_allowance - v_photo_spent, 0)
      )
    ),
    'entries', v_entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz) TO authenticated, service_role;
