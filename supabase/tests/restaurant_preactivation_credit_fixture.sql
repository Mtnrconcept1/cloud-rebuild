-- Isolated PostgreSQL 17 integration schema for the exact credit migration.
-- Run only inside the disposable CI database, never against production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private_finance;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role'::text $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.auth_owns_restaurant(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.is_feature_flag_active(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE TABLE public.restaurant_ai_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  status text NOT NULL,
  activated_at timestamptz,
  billing_period text DEFAULT 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.restaurant_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  status text NOT NULL,
  campaign_credit_chf numeric DEFAULT 0,
  ai_tool_credits integer DEFAULT 0,
  ai_photo_credits integer DEFAULT 0,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  function_name text DEFAULT 'ai-restaurant-agent',
  feature_name text DEFAULT 'ai_sales_insights',
  action text DEFAULT 'general'
);

CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,
  payment_method text,
  payment_status text,
  total_budget numeric DEFAULT 0,
  spent numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  activated_at timestamptz,
  scheduled_at timestamptz,
  starts_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Stand-in for the historical, already deployed monthly entitlement function.
-- The new migration must delegate to this for active subscriptions, and must
-- replace its pre-activation allowance entirely.
CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage_before_fair_growth(
  p_restaurant_id uuid, p_since timestamptz DEFAULT NULL, p_until timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_subscription record;
  v_topups numeric := 0;
  v_spent numeric := 0;
BEGIN
  SELECT status, billing_period, current_period_start INTO v_subscription
  FROM public.restaurant_ai_subscriptions
  WHERE restaurant_id=p_restaurant_id
  ORDER BY created_at DESC LIMIT 1;

  SELECT COALESCE(sum(campaign_credit_chf * 15 + ai_tool_credits + ai_photo_credits),0)
  INTO v_topups
  FROM public.restaurant_credit_purchases
  WHERE restaurant_id=p_restaurant_id AND status='paid'
    AND COALESCE(paid_at,updated_at,created_at) >= now()-interval '12 months';

  SELECT COALESCE(sum(
    CASE WHEN metadata->>'credit_units' ~ '^[0-9]+$'
      THEN (metadata->>'credit_units')::numeric ELSE 1 END
  ),0) INTO v_spent
  FROM public.ai_usage_logs
  WHERE restaurant_id=p_restaurant_id AND status='success'
    AND created_at >= COALESCE(v_subscription.current_period_start, date_trunc('month',now()));

  RETURN jsonb_build_object(
    'subscription', CASE WHEN v_subscription.status IS NULL THEN NULL
       ELSE jsonb_build_object('status',v_subscription.status) END,
    'period', jsonb_build_object('start', COALESCE(p_since,now()-interval '1 month'),
                               'end',COALESCE(p_until,now()),'generated_at',now()),
    'credits', jsonb_build_array(jsonb_build_object(
      'kind','tok_credits','label','Credits TOK','unit','credit',
      'included_allowance', 100,
      'topup_allowance',v_topups,
      'balance',GREATEST(100+v_topups-v_spent,0),
      'topup_balance',GREATEST(v_topups-v_spent,0),
      'metadata',jsonb_build_object('historical','true')
    )),
    'entries','[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tok_credit_balance_from_usage(p_usage jsonb)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE((p_usage->'credits'->0->>'balance')::numeric, 0)
$$;

-- Existing installation already has these two triggers; recreate them in
-- isolated CI specifically to exercise the updated guard implementation.
