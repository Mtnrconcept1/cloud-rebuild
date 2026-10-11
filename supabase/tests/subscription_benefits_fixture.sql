-- Disposable integration fixture, schema-only snapshot; no production records or credentials.
-- Unchanged provider/notification boundaries are stubs; new entitlement SQL runs unmodified.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TYPE public.app_role AS ENUM ('client','restaurateur','admin','courier','commercial');
CREATE TYPE public.commercial_visit_status AS ENUM ('not_visited','visited','in_progress','signed','not_interested');
CREATE TYPE public.loyalty_tier AS ENUM ('bronze','silver','gold','platinum');
CREATE TABLE public.ad_campaigns (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurant_id" uuid,
  "type" text,
  "title" text,
  "body" text,
  "image_url" text,
  "status" text DEFAULT 'draft'::text,
  "target_pages" jsonb DEFAULT '[]'::jsonb,
  "target_criteria" jsonb DEFAULT '{}'::jsonb,
  "channels" jsonb DEFAULT '{}'::jsonb,
  "budget_daily" numeric DEFAULT 0,
  "total_budget" numeric DEFAULT 0,
  "spent" numeric DEFAULT 0,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "scheduled_at" timestamp with time zone,
  "impressions" integer DEFAULT 0,
  "clicks" integer DEFAULT 0,
  "conversions" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "payment_status" text DEFAULT 'unpaid'::text,
  "payment_method" text,
  "paid_amount" numeric DEFAULT 0,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "paid_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "cpm_rate" numeric DEFAULT 9.50,
  "daily_spent" numeric DEFAULT 0,
  "daily_spent_date" date DEFAULT CURRENT_DATE,
  "cpc_rate" numeric DEFAULT 0.95,
  "conversion_rate" numeric DEFAULT 7.50,
  "pricing_strategy" text DEFAULT 'conversion'::text
);
CREATE TABLE public.ai_usage_logs (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "function_name" text,
  "action" text DEFAULT 'invoke'::text,
  "model" text,
  "user_id" uuid,
  "restaurant_id" uuid,
  "conversation_id" uuid,
  "generated_asset_id" uuid,
  "status" text DEFAULT 'success'::text,
  "input_tokens" integer DEFAULT 0,
  "output_tokens" integer DEFAULT 0,
  "total_tokens" integer DEFAULT 0,
  "estimated_cost_chf" numeric(12,6),
  "provider_request_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "feature_name" text,
  "task_id" uuid,
  "source" text
);
CREATE TABLE public.audit_log (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "action" text,
  "entity_type" text,
  "entity_id" uuid,
  "old_data" jsonb DEFAULT '{}'::jsonb,
  "new_data" jsonb DEFAULT '{}'::jsonb,
  "ip_address" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public.flash_sales (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurant_id" uuid,
  "title" text,
  "description" text,
  "image_url" text,
  "original_price" numeric,
  "discounted_price" numeric,
  "quantity_available" integer DEFAULT 1,
  "sale_date" date,
  "sale_start" time without time zone,
  "sale_end" time without time zone,
  "is_active" boolean DEFAULT true,
  "delivery_available" boolean DEFAULT true,
  "takeaway_available" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "archive_reason" text
);
CREATE TABLE public.loyalty_tiers (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text,
  "min_points" integer,
  "benefits" jsonb,
  "multiplier" numeric(3,2) DEFAULT 1.0,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "status" text DEFAULT 'active'::text
);
CREATE TABLE public.loyalty_transactions (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "amount" integer,
  "transaction_type" text,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "order_id" uuid,
  "reservation_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE public.notifications (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "title" text,
  "body" text,
  "type" text,
  "category" text,
  "data" jsonb DEFAULT '{}'::jsonb,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public.orders (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "restaurant_id" uuid,
  "delivery_address" text,
  "total_amount" numeric DEFAULT 0,
  "original_total" numeric DEFAULT 0,
  "discount_amount" numeric DEFAULT 0,
  "delivery_fee" numeric DEFAULT 0,
  "status" text DEFAULT 'pending'::text,
  "notes" text,
  "order_number" text,
  "checkout_id" uuid,
  "donate_earned_xp" boolean DEFAULT false,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "idempotency_key" text,
  "courier_id" uuid,
  "scheduled_at" timestamp with time zone,
  "estimated_delivery_at" timestamp with time zone,
  "actual_delivered_at" timestamp with time zone,
  "cancellation_reason" text,
  "branch_id" uuid,
  "type" text DEFAULT 'delivery'::text,
  "source" text DEFAULT 'app'::text,
  "scheduled_for" timestamp with time zone,
  "subtotal_amount" numeric(10,2) DEFAULT 0.00,
  "delivery_fee_amount" numeric(10,2) DEFAULT 0.00,
  "service_fee_amount" numeric(10,2) DEFAULT 0.00,
  "tax_amount" numeric(10,2) DEFAULT 0.00,
  "tip_amount" numeric(10,2) DEFAULT 0.00,
  "currency" text DEFAULT 'EUR'::text,
  "payment_status" text DEFAULT 'pending'::text,
  "fulfillment_status" text DEFAULT 'pending'::text,
  "accepted_at" timestamp with time zone,
  "ready_at" timestamp with time zone,
  "picked_up_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "restaurant_invoice_id" uuid,
  "cancelled_by" text,
  "refund_status" text,
  "refunded_amount_chf" numeric(12,2) DEFAULT 0,
  "refunded_at" timestamp with time zone,
  "refund_reason" text,
  "refund_initiated_by" text,
  "stripe_refund_id" text,
  "cancellation_reason_code" text,
  "cancellation_reason_details" text,
  "cancelled_at" timestamp with time zone,
  "restaurant_viewed_at" timestamp with time zone,
  "restaurant_accepted_at" timestamp with time zone,
  "acceptance_deadline_at" timestamp with time zone,
  "restaurant_response_status" text
);
CREATE TABLE public.profiles (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "full_name" text,
  "avatar_url" text,
  "phone" text,
  "address" text,
  "city" text,
  "loyalty_points" integer DEFAULT 0,
  "current_tier" loyalty_tier DEFAULT 'bronze'::loyalty_tier,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "date_of_birth" date,
  "gender" text
);
CREATE TABLE public.promo_codes (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "code" text,
  "type" text,
  "value" numeric,
  "min_order_amount" numeric DEFAULT 0,
  "max_discount" numeric,
  "max_uses" integer,
  "current_uses" integer DEFAULT 0,
  "per_user_limit" integer DEFAULT 1,
  "restaurant_id" uuid,
  "is_first_order_only" boolean DEFAULT false,
  "is_stackable" boolean DEFAULT false,
  "valid_from" timestamp with time zone DEFAULT now(),
  "valid_until" timestamp with time zone,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public.restaurant_ai_subscriptions (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurant_id" uuid,
  "plan" text DEFAULT 'starter'::text,
  "status" text DEFAULT 'trialing'::text,
  "monthly_conversation_limit" integer DEFAULT 50,
  "monthly_text_tool_limit" integer DEFAULT 20,
  "monthly_image_limit" integer DEFAULT 0,
  "monthly_premium_image_limit" integer DEFAULT 0,
  "monthly_voice_minutes_limit" integer DEFAULT 0,
  "started_at" timestamp with time zone,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "restaurant_subscription_plan_id" uuid,
  "billing_period" text DEFAULT 'monthly'::text,
  "stripe_subscription_id" text,
  "stripe_checkout_session_id" text,
  "stripe_mode" text DEFAULT 'live'::text,
  "monthly_campaign_credit_chf" numeric(10,2) DEFAULT 0,
  "monthly_ai_tool_credits" integer DEFAULT 0,
  "monthly_photo_retouch_credits" integer DEFAULT 0,
  "cancel_at_period_end" boolean DEFAULT false,
  "scheduled_plan_change" jsonb DEFAULT '{}'::jsonb,
  "stripe_subscription_schedule_id" text,
  "signup_application_id" uuid,
  "internal_invoice_id" uuid,
  "price_monthly_chf_snapshot" numeric,
  "currency" text DEFAULT 'CHF'::text,
  "stripe_price_id" text,
  "payment_method_ready_at" timestamp with time zone,
  "activation_requested_at" timestamp with time zone,
  "activation_trigger_type" text,
  "activation_trigger_id" uuid,
  "activation_triggered_at" timestamp with time zone,
  "activation_completed_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "last_activation_error" text,
  "billing_amount_chf_snapshot" numeric,
  "price_monthly_cents_snapshot" integer,
  "billing_amount_cents_snapshot" integer,
  "billing_net_cents_snapshot" integer,
  "billing_vat_cents_snapshot" integer,
  "vat_rate_bps_snapshot" integer,
  "annual_months_charged_snapshot" integer,
  "acquired_reservation_fee_cents_snapshot" integer,
  "marketplace_commission_bps_snapshot" integer,
  "included_establishments_snapshot" integer,
  "additional_establishment_price_cents_snapshot" integer,
  "reservation_revenue_cap_bps_snapshot" integer,
  "developer_order_bps_snapshot" integer,
  "developer_tok_revenue_bps_snapshot" integer,
  "pricing_version_snapshot" text
);
CREATE TABLE public.restaurant_credit_purchases (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurant_id" uuid,
  "credit_pack_id" uuid,
  "purchased_by" uuid,
  "status" text DEFAULT 'pending_payment'::text,
  "price_chf" numeric(12,2) DEFAULT 0,
  "currency" text DEFAULT 'chf'::text,
  "campaign_credit_chf" numeric(12,2) DEFAULT 0,
  "ai_tool_credits" integer DEFAULT 0,
  "ai_photo_credits" integer DEFAULT 0,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "stripe_mode" text,
  "paid_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "payment_attempt_id" uuid
);
CREATE TABLE public.restaurant_subscription_plans (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "slug" text,
  "name" text,
  "description" text,
  "price_monthly_chf" numeric(10,2),
  "currency" text DEFAULT 'chf'::text,
  "campaign_credit_chf" numeric(10,2) DEFAULT 0,
  "ai_tool_credits" integer DEFAULT 0,
  "ai_photo_credits" integer DEFAULT 0,
  "monthly_conversation_limit" integer DEFAULT 50,
  "monthly_text_tool_limit" integer DEFAULT 20,
  "monthly_image_limit" integer DEFAULT 0,
  "monthly_premium_image_limit" integer DEFAULT 0,
  "monthly_voice_minutes_limit" integer DEFAULT 0,
  "features" jsonb DEFAULT '[]'::jsonb,
  "is_active" boolean DEFAULT true,
  "position" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "public_name" text,
  "acquired_reservation_fee_cents" integer DEFAULT 500,
  "marketplace_commission_bps" integer DEFAULT 990,
  "included_establishments" integer DEFAULT 1,
  "additional_establishment_price_cents" integer,
  "annual_months_charged" integer DEFAULT 11,
  "reservation_revenue_cap_bps" integer DEFAULT 700,
  "developer_order_bps" integer DEFAULT 100,
  "developer_tok_revenue_bps" integer DEFAULT 1000,
  "pricing_version" text DEFAULT 'fair_growth_2026_07'::text
);
CREATE TABLE public.restaurants (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "owner_id" uuid,
  "name" text,
  "description" text,
  "cuisine_type" text,
  "address" text,
  "city" text,
  "phone" text,
  "image_url" text,
  "rating" numeric DEFAULT 0,
  "review_count" integer DEFAULT 0,
  "price_range" integer DEFAULT 2,
  "is_active" boolean DEFAULT false,
  "opening_hours" jsonb,
  "delivery_available" boolean DEFAULT false,
  "delivery_fee" numeric DEFAULT 0,
  "min_order_amount" numeric DEFAULT 0,
  "latitude" double precision,
  "longitude" double precision,
  "points_multiplier" numeric DEFAULT 1.0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "stripe_account_id" text,
  "commission_rate" numeric DEFAULT 0.15,
  "avg_prep_time_min" integer DEFAULT 20,
  "supports_scheduled" boolean DEFAULT false,
  "supports_pickup" boolean DEFAULT false,
  "search_vector" tsvector,
  "legal_name" text,
  "status" text DEFAULT 'pending'::text,
  "avg_rating" numeric(3,2) DEFAULT 0.0,
  "rating_count" integer DEFAULT 0,
  "base_delivery_fee" numeric(10,2) DEFAULT 0.00,
  "avg_delivery_time_min" integer,
  "is_featured" boolean DEFAULT false,
  "supports_dinein" boolean DEFAULT false,
  "supports_reservation" boolean DEFAULT false,
  "supports_scheduled_orders" boolean DEFAULT false,
  "supports_group_orders" boolean DEFAULT false,
  "disabled_payment_methods" text[] DEFAULT '{}'::text[],
  "disabled_dashboard_features" text[] DEFAULT '{}'::text[],
  "orders_paused_until" timestamp with time zone,
  "orders_paused_reason" text,
  "order_slot_capacity_per_15m" integer DEFAULT 30,
  "dynamic_prep_time_minutes" integer,
  "exceptional_hours" jsonb DEFAULT '{}'::jsonb,
  "reservations_full_until" timestamp with time zone,
  "reservations_full_reason" text,
  "slug" text,
  "amenities" text[] DEFAULT '{}'::text[],
  "stripe_connect_details_submitted" boolean DEFAULT false,
  "stripe_connect_charges_enabled" boolean DEFAULT false,
  "stripe_connect_payouts_enabled" boolean DEFAULT false,
  "stripe_connect_requirements_due" text[] DEFAULT ARRAY[]::text[],
  "stripe_connect_disabled_reason" text,
  "stripe_connect_onboarding_completed_at" timestamp with time zone,
  "stripe_connect_last_synced_at" timestamp with time zone,
  "is_demo" boolean DEFAULT false,
  "is_directory_listing" boolean DEFAULT false,
  "directory_source" text,
  "directory_source_reference" text,
  "directory_public_name_verified" boolean DEFAULT false,
  "directory_public_name_source" text,
  "directory_public_name_source_url" text,
  "directory_public_name_verified_at" timestamp with time zone,
  "directory_image_verified" boolean DEFAULT false,
  "directory_image_verified_at" timestamp with time zone,
  "directory_image_verification_score" numeric(5,4),
  "directory_image_verification_model" text,
  "directory_image_source_url" text,
  "directory_image_last_rejected_url" text,
  "tok_connect_mcp_enabled" boolean DEFAULT true,
  "directory_display_name" text
);
CREATE TABLE public.solidarity_donations (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "points_amount" integer,
  "meals_count" integer DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public.subscription_benefits (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "plan_id" uuid,
  "benefit_type" text,
  "value" jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);
CREATE TABLE public.support_tickets (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "order_id" uuid,
  "category" text,
  "priority" text DEFAULT 'medium'::text,
  "status" text DEFAULT 'open'::text,
  "subject" text,
  "description" text,
  "assigned_to" uuid,
  "resolution_type" text,
  "compensation_amount" numeric DEFAULT 0,
  "sla_deadline" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public.tok_one_subscriptions (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid,
  "plan_id" uuid,
  "status" text DEFAULT 'inactive'::text,
  "current_period_start" timestamp with time zone DEFAULT now(),
  "current_period_end" timestamp with time zone DEFAULT now(),
  "cancel_at_period_end" boolean DEFAULT false,
  "stripe_subscription_id" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "stripe_mode" text DEFAULT 'live'::text,
  "stripe_checkout_session_id" text,
  "billing_provider" text DEFAULT 'stripe'::text,
  "apple_product_id" text,
  "apple_transaction_id" text,
  "apple_original_transaction_id" text,
  "apple_environment" text,
  "apple_app_account_token" uuid,
  "apple_signed_at" timestamp with time zone
);
CREATE TABLE public.user_subscription_plans (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text,
  "description" text,
  "price_monthly" numeric(10,2),
  "price_yearly" numeric(10,2),
  "currency" text DEFAULT 'CHF'::text,
  "free_delivery_min_order" numeric(10,2),
  "status" text DEFAULT 'active'::text,
  "stripe_product_id" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);
CREATE UNIQUE INDEX profiles_user_key ON public.profiles(user_id);
CREATE UNIQUE INDEX loyalty_tiers_name_key ON public.loyalty_tiers(name);
CREATE UNIQUE INDEX promo_codes_code_key ON public.promo_codes(code);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
CREATE FUNCTION public.auth_is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.has_role(auth.uid(),'admin') $$;
CREATE FUNCTION public.auth_owns_restaurant(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.restaurants WHERE id=$1 AND owner_id=auth.uid()) $$;
CREATE FUNCTION public.is_feature_flag_active(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.assert_commercial_demo_production_rpc_allowed() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;
CREATE FUNCTION public.queue_notification_deliveries(uuid,uuid,text,jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.restaurants,public.restaurant_ai_subscriptions,public.promo_codes TO authenticated;
ALTER TABLE public.restaurant_ai_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_owner_fixture ON public.restaurant_ai_subscriptions FOR SELECT TO authenticated USING(public.auth_owns_restaurant(restaurant_id));
CREATE POLICY promo_active_fixture ON public.promo_codes FOR SELECT TO anon,authenticated USING(is_active);

CREATE OR REPLACE FUNCTION public.miamz_tier_rank(p_tier text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(COALESCE(p_tier, ''))
    WHEN 'bronze' THEN 0
    WHEN 'silver' THEN 1
    WHEN 'gold' THEN 2
    WHEN 'platinum' THEN 3
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.miamz_priority_rank(p_priority text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(COALESCE(p_priority, ''))
    WHEN 'urgent' THEN 4
    WHEN 'high' THEN 3
    WHEN 'normal' THEN 2
    WHEN 'low' THEN 1
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.miamz_priority_from_rank(p_rank integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_rank, 0) >= 4 THEN 'urgent'
    WHEN COALESCE(p_rank, 0) = 3 THEN 'high'
    WHEN COALESCE(p_rank, 0) = 2 THEN 'normal'
    WHEN COALESCE(p_rank, 0) = 1 THEN 'low'
    ELSE 'normal'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_miamz_benefit_state(p_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF auth.role() <> 'service_role'
    AND v_target IS DISTINCT FROM auth.uid()
    AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN public.resolve_miamz_benefit_state(v_target);
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_has_miamz_benefit(p_user_id uuid, p_benefit_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.get_user_miamz_benefit_state(p_user_id) -> 'active_benefit_ids', '[]'::jsonb) ? COALESCE(p_benefit_id, '');
$function$;

CREATE OR REPLACE FUNCTION public.credit_order_loyalty_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text := lower(coalesce(new.status, ''));
  v_payment_status text := lower(coalesce(new.payment_status, ''));
  v_refund_status text := lower(coalesce(new.refund_status, ''));
  v_order_type text := lower(coalesce(nullif(new.type, ''), new.metadata ->> 'type', ''));
  v_eligible boolean;
  v_disqualifying boolean;
  v_primary_reward public.loyalty_transactions%rowtype;
  v_active_reward public.loyalty_transactions%rowtype;
  v_has_primary_reward boolean := false;
  v_has_active_reward boolean := false;
  v_transaction_id uuid;
  v_restaurant_multiplier numeric := 1;
  v_miamz_multiplier numeric := 1;
  v_effective_multiplier numeric := 1;
  v_multiplier_text text;
  v_miamz_state jsonb := '{}'::jsonb;
  v_has_welcome_miamz boolean := false;
  v_donate boolean := false;
  v_earned integer;
begin
  if new.user_id is null then return new; end if;

  v_eligible := (
    v_status in ('delivered', 'completed')
    or (
      v_status = 'picked_up'
      and v_order_type in ('pickup', 'takeaway', 'emporter', 'click_and_collect')
    )
  ) and v_payment_status in ('paid', 'captured')
    and coalesce(new.total_amount, 0) > 0
    and v_refund_status not in ('refunded', 'fully_refunded', 'full_refund');

  v_disqualifying := v_status in ('cancelled', 'refunded', 'payment_failed', 'refused')
    or v_payment_status in ('failed', 'refunded')
    or v_refund_status in ('refunded', 'fully_refunded', 'full_refund');

  select * into v_primary_reward
  from public.loyalty_transactions
  where order_id = new.id
    and transaction_type in ('order_earned', 'donation')
  order by created_at, id
  limit 1;
  v_has_primary_reward := found;

  select * into v_active_reward
  from public.loyalty_transactions candidate
  where candidate.order_id = new.id
    and candidate.transaction_type in (
      'order_earned', 'donation', 'order_reward_reinstated', 'donation_reinstated'
    )
    and candidate.amount > 0
    and not exists (
      select 1 from public.loyalty_transactions reversal
      where reversal.metadata ->> 'reverses_transaction_id' = candidate.id::text
    )
  order by candidate.created_at desc, candidate.id desc
  limit 1;
  v_has_active_reward := found;

  if v_disqualifying and v_has_active_reward then
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, order_id, amount, transaction_type, description, metadata
    ) values (
      v_active_reward.user_id,
      new.id,
      -abs(v_active_reward.amount),
      case when v_active_reward.transaction_type in ('donation', 'donation_reinstated')
        then 'donation_reversal' else 'order_reward_reversal' end,
      case when v_active_reward.transaction_type in ('donation', 'donation_reinstated')
        then 'Annulation du don Miamz lié à la commande'
        else 'Annulation des points Miamz liés à la commande' end,
      jsonb_build_object(
        'reverses_transaction_id', v_active_reward.id,
        'reason', 'order_disqualified',
        'status', new.status,
        'payment_status', new.payment_status,
        'refund_status', new.refund_status,
        'evaluated_at', now()
      )
    ) on conflict do nothing
    returning id into v_transaction_id;

    if v_transaction_id is not null then
      if v_active_reward.transaction_type in ('donation', 'donation_reinstated') then
        insert into public.solidarity_donations (user_id, points_amount, meals_count)
        values (
          v_active_reward.user_id,
          -abs(v_active_reward.amount),
          -floor(abs(v_active_reward.amount)::numeric / 1000)::integer
        );
      else
        update public.profiles
        set loyalty_points = coalesce(loyalty_points, 0) - abs(v_active_reward.amount)
        where user_id = v_active_reward.user_id;
      end if;
    end if;
    return new;
  end if;

  if not v_eligible or v_has_active_reward then return new; end if;

  -- A legacy/premature reward compensated below is restored exactly once
  -- when the order finally becomes eligible. No multiplier is recalculated.
  if v_has_primary_reward then
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, order_id, amount, transaction_type, description, metadata
    ) values (
      v_primary_reward.user_id,
      new.id,
      abs(v_primary_reward.amount),
      case when v_primary_reward.transaction_type = 'donation'
        then 'donation_reinstated' else 'order_reward_reinstated' end,
      case when v_primary_reward.transaction_type = 'donation'
        then 'Don Miamz rétabli après livraison'
        else 'Points Miamz rétablis après livraison' end,
      jsonb_build_object(
        'reinstates_transaction_id', v_primary_reward.id,
        'eligibility_status', new.status,
        'payment_status', new.payment_status,
        'evaluated_at', now()
      )
    ) on conflict do nothing
    returning id into v_transaction_id;
    if v_transaction_id is not null then
      if v_primary_reward.transaction_type = 'donation' then
        insert into public.solidarity_donations (user_id, points_amount, meals_count)
        values (
          v_primary_reward.user_id,
          abs(v_primary_reward.amount),
          floor(abs(v_primary_reward.amount)::numeric / 1000)::integer
        );
      else
        update public.profiles
        set loyalty_points = coalesce(loyalty_points, 0) + abs(v_primary_reward.amount)
        where user_id = v_primary_reward.user_id;
      end if;
    end if;
    return new;
  end if;

  if coalesce(new.metadata, '{}'::jsonb) ? 'miamz_benefits_applied' then
    v_has_welcome_miamz := coalesce(new.metadata -> 'miamz_benefits_applied', '[]'::jsonb) ? 'welcome_miamz';
    v_miamz_state := coalesce(new.metadata -> 'miamz', '{}'::jsonb);
  else
    v_miamz_state := public.resolve_miamz_benefit_state(new.user_id);
    v_has_welcome_miamz := coalesce(v_miamz_state -> 'active_benefit_ids', '[]'::jsonb) ? 'welcome_miamz';
  end if;
  if not v_has_welcome_miamz then return new; end if;

  select coalesce(points_multiplier, 1) into v_restaurant_multiplier
  from public.restaurants where id = new.restaurant_id;
  v_restaurant_multiplier := least(5, greatest(1, coalesce(v_restaurant_multiplier, 1)));
  v_multiplier_text := coalesce(
    new.metadata ->> 'miamz_points_multiplier',
    new.metadata #>> '{miamz,effects,points_multiplier}',
    v_miamz_state #>> '{effects,points_multiplier}',
    '1'
  );
  if v_multiplier_text ~ '^[0-9]+([.][0-9]+)?$' then
    v_miamz_multiplier := least(5, greatest(1, v_multiplier_text::numeric));
  end if;
  v_effective_multiplier := least(5, v_restaurant_multiplier * v_miamz_multiplier);
  v_earned := greatest(1, floor(new.total_amount * 10 * v_effective_multiplier))::integer;
  v_donate := coalesce(new.donate_earned_xp, false)
    or lower(coalesce(new.metadata ->> 'donate_earned_xp', 'false')) in ('1', 'true', 'yes', 'oui');

  v_transaction_id := null;
  insert into public.loyalty_transactions (
    user_id, order_id, amount, transaction_type, description, metadata
  ) values (
    new.user_id,
    new.id,
    v_earned,
    case when v_donate then 'donation' else 'order_earned' end,
    case when v_donate
      then 'Don solidaire Miamz après commande livrée'
      else 'Points Miamz crédités après commande livrée' end,
    jsonb_build_object(
      'eligibility_status', new.status,
      'payment_status', new.payment_status,
      'evaluated_at', now(),
      'restaurant_multiplier', v_restaurant_multiplier,
      'miamz_points_multiplier', v_miamz_multiplier,
      'effective_multiplier', v_effective_multiplier,
      'miamz_state', v_miamz_state
    )
  ) on conflict do nothing
  returning id into v_transaction_id;

  if v_transaction_id is not null then
    if v_donate then
      insert into public.solidarity_donations (user_id, points_amount, meals_count)
      values (new.user_id, v_earned, floor(v_earned::numeric / 1000)::integer);
    else
      insert into public.profiles (user_id, loyalty_points)
      values (new.user_id, v_earned)
      on conflict (user_id) do update
      set loyalty_points = coalesce(profiles.loyalty_points, 0) + excluded.loyalty_points;
    end if;
  end if;
  return new;
end;
$function$;
CREATE TRIGGER trg_credit_order_loyalty AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.credit_order_loyalty_points();
