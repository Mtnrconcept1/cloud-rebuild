-- Disposable test database only. Billing functions/tables are loaded verbatim
-- from historical migrations by ai-image-credit-fixture.mjs.
-- CI databases share cluster-wide roles with the OAuth/webhook fixtures.
-- Preserve existing attributes, including service_role BYPASSRLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA private_finance;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY,email text);
CREATE TABLE public.restaurants (id uuid PRIMARY KEY,owner_id uuid REFERENCES auth.users(id),name text);
CREATE TABLE public.restaurant_staff (restaurant_id uuid REFERENCES public.restaurants(id),user_id uuid REFERENCES auth.users(id),PRIMARY KEY(restaurant_id,user_id));
CREATE TABLE public.user_roles (user_id uuid REFERENCES auth.users(id),role text,PRIMARY KEY(user_id,role));
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon')
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE FUNCTION public.has_role(p_user uuid,p_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user AND role=p_role)
$$;
CREATE FUNCTION public.auth_owns_restaurant(p_restaurant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.restaurants WHERE id=p_restaurant AND owner_id=auth.uid())
$$;
CREATE TABLE public.ai_conversations (id uuid PRIMARY KEY);
CREATE TABLE public.restaurant_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,name text,description text,
  price_monthly_chf numeric DEFAULT 0,campaign_credit_chf numeric DEFAULT 0,
  ai_tool_credits integer DEFAULT 0,ai_photo_credits integer DEFAULT 0,
  features jsonb DEFAULT '[]',position integer DEFAULT 0
);
CREATE TABLE public.restaurant_ai_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL,
  restaurant_subscription_plan_id uuid,plan text DEFAULT 'starter',status text NOT NULL,
  activated_at timestamptz,billing_period text DEFAULT 'monthly',
  stripe_subscription_id text,stripe_checkout_session_id text,
  monthly_campaign_credit_chf numeric DEFAULT 0,monthly_ai_tool_credits integer DEFAULT 0,
  monthly_photo_retouch_credits integer DEFAULT 0,current_period_start timestamptz,
  current_period_end timestamptz,metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.restaurant_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL,status text NOT NULL,
  campaign_credit_chf numeric DEFAULT 0,ai_tool_credits integer DEFAULT 0,ai_photo_credits integer DEFAULT 0,
  paid_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid,title text,status text,
  payment_method text,payment_status text,total_budget numeric DEFAULT 0,
  spent numeric DEFAULT 0,paid_amount numeric DEFAULT 0,activated_at timestamptz,
  scheduled_at timestamptz,starts_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
