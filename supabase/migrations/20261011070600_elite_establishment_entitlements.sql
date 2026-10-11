BEGIN;
CREATE TABLE IF NOT EXISTS public.restaurant_subscription_establishments (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id),
  subscription_id uuid NOT NULL REFERENCES public.restaurant_ai_subscriptions(id),
  seat_number integer NOT NULL CHECK(seat_number BETWEEN 2 AND 20),
  UNIQUE(subscription_id,seat_number),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_establishments_parent_idx ON public.restaurant_subscription_establishments(subscription_id);
CREATE TABLE IF NOT EXISTS public.restaurant_subscription_seat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.restaurant_ai_subscriptions(id),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  extra_quantity integer NOT NULL CHECK(extra_quantity BETWEEN 0 AND 17),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
  stripe_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id,restaurant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_seat_request_pending_idx
ON public.restaurant_subscription_seat_requests(subscription_id) WHERE status='pending';
ALTER TABLE public.restaurant_subscription_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscription_seat_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_subscription_establishments,public.restaurant_subscription_seat_requests FROM anon,authenticated;
GRANT SELECT ON public.restaurant_subscription_establishments TO authenticated;
DROP POLICY IF EXISTS subscription_establishment_owner ON public.restaurant_subscription_establishments;
CREATE POLICY subscription_establishment_owner ON public.restaurant_subscription_establishments FOR SELECT TO authenticated
USING(public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

CREATE TABLE IF NOT EXISTS public.restaurant_subscription_extra_capacity (
 subscription_id uuid PRIMARY KEY REFERENCES public.restaurant_ai_subscriptions(id),
 quantity integer NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 17),
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurant_subscription_extra_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_subscription_extra_capacity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.restaurant_subscription_extra_capacity TO authenticated;
DROP POLICY IF EXISTS capacity_owner_read ON public.restaurant_subscription_extra_capacity;
CREATE POLICY capacity_owner_read ON public.restaurant_subscription_extra_capacity FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.restaurant_ai_subscriptions s WHERE s.id=subscription_id AND public.auth_owns_restaurant(s.restaurant_id)) OR public.auth_is_admin());
GRANT ALL ON public.restaurant_subscription_extra_capacity,public.restaurant_subscription_establishments,public.restaurant_subscription_seat_requests TO service_role;
CREATE OR REPLACE FUNCTION public.sync_restaurant_extra_capacity(p_subscription_id uuid,p_stripe_subscription_id text,p_quantity integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurant_ai_subscriptions WHERE id=p_subscription_id AND stripe_subscription_id=p_stripe_subscription_id) THEN
 RAISE EXCEPTION 'Subscription changed'; END IF;
 INSERT INTO public.restaurant_subscription_extra_capacity(subscription_id,quantity) VALUES(p_subscription_id,p_quantity)
 ON CONFLICT(subscription_id) DO UPDATE SET quantity=excluded.quantity,verified_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.sync_restaurant_extra_capacity(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_restaurant_extra_capacity(uuid,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_restaurant_seat(p_source uuid,p_target uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.restaurant_ai_subscriptions%ROWTYPE; r public.restaurant_subscription_seat_requests%ROWTYPE; n integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
  IF p_source=p_target OR NOT EXISTS(SELECT 1 FROM public.restaurants a JOIN public.restaurants b ON b.owner_id=a.owner_id
    WHERE a.id=p_source AND b.id=p_target AND a.owner_id=p_actor AND NOT a.is_demo AND NOT b.is_demo) THEN
    RAISE EXCEPTION 'Establishments must have the same owner' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM public.restaurant_ai_subscriptions WHERE restaurant_id=p_source
    AND plan='elite' AND stripe_mode='live' AND status IN ('active','trialing') AND current_period_end>now()
    AND stripe_subscription_id IS NOT NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Elite subscription required'; END IF;
  SELECT * INTO r FROM public.restaurant_subscription_seat_requests WHERE subscription_id=s.id AND restaurant_id=p_target;
  IF FOUND THEN RETURN to_jsonb(r)||jsonb_build_object('stripe_subscription_id',s.stripe_subscription_id,'monthly_cents',s.additional_establishment_price_cents_snapshot); END IF;
  IF EXISTS(SELECT 1 FROM public.restaurant_subscription_establishments WHERE restaurant_id IN (p_source,p_target))
    OR EXISTS(SELECT 1 FROM public.restaurant_ai_subscriptions WHERE restaurant_id=p_target AND stripe_subscription_id IS NOT NULL
      AND status NOT IN ('cancelled','canceled')) THEN RAISE EXCEPTION 'Establishment already subscribed or linked'; END IF;
  SELECT count(*)+2 INTO n FROM public.restaurant_subscription_establishments WHERE subscription_id=s.id;
  IF n>20 THEN RAISE EXCEPTION 'Maximum 20 establishments'; END IF;
  INSERT INTO public.restaurant_subscription_seat_requests(subscription_id,restaurant_id,requested_by,extra_quantity)
  VALUES(s.id,p_target,p_actor,GREATEST(0,n-COALESCE(s.included_establishments_snapshot,3))) RETURNING * INTO r;
  RETURN to_jsonb(r)||jsonb_build_object('stripe_subscription_id',s.stripe_subscription_id,'monthly_cents',s.additional_establishment_price_cents_snapshot);
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_restaurant_seat(p_request uuid,p_stripe_item text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.restaurant_subscription_seat_requests%ROWTYPE; s public.restaurant_ai_subscriptions%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.restaurant_subscription_seat_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status='completed' THEN RETURN; END IF;
  SELECT * INTO s FROM public.restaurant_ai_subscriptions WHERE id=r.subscription_id FOR UPDATE;
  IF s.plan<>'elite' OR s.status NOT IN ('active','trialing') OR s.current_period_end<=now() THEN RAISE EXCEPTION 'Subscription no longer eligible'; END IF;
  IF r.extra_quantity>0 AND (SELECT COALESCE(max(quantity),0) FROM public.restaurant_subscription_extra_capacity WHERE subscription_id=s.id)<r.extra_quantity THEN RAISE EXCEPTION 'Paid capacity required'; END IF;
  IF r.extra_quantity>0 AND NULLIF(p_stripe_item,'') IS NULL THEN RAISE EXCEPTION 'Paid Stripe item required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.restaurants a JOIN public.restaurants b ON b.owner_id=a.owner_id
    WHERE a.id=s.restaurant_id AND b.id=r.restaurant_id AND a.owner_id=r.requested_by) THEN RAISE EXCEPTION 'Owner changed'; END IF;
  INSERT INTO public.restaurant_subscription_establishments(restaurant_id,subscription_id,seat_number)
  SELECT r.restaurant_id,s.id,COALESCE(max(seat_number),1)+1 FROM public.restaurant_subscription_establishments WHERE subscription_id=s.id;
  -- Supersede only unbilled onboarding rows, never an existing paid contract.
  UPDATE public.restaurant_ai_subscriptions SET status='cancelled'
    WHERE restaurant_id=r.restaurant_id AND stripe_subscription_id IS NULL;
  UPDATE public.restaurant_subscription_seat_requests SET status='completed',stripe_item_id=p_stripe_item WHERE id=r.id;
  INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,new_data)
  VALUES(r.requested_by,'attach_elite_establishment','restaurant',r.restaurant_id,to_jsonb(r));
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_restaurant_seat(uuid,uuid,uuid),public.complete_restaurant_seat(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_restaurant_seat(uuid,uuid,uuid),public.complete_restaurant_seat(uuid,text) TO service_role;

CREATE OR REPLACE VIEW public.restaurant_subscription_entitlements WITH(security_invoker=true) AS
SELECT s.* FROM public.restaurant_ai_subscriptions s
WHERE NOT EXISTS(SELECT 1 FROM public.restaurant_subscription_establishments e WHERE e.restaurant_id=s.restaurant_id)
UNION ALL
SELECT (jsonb_populate_record(NULL::public.restaurant_ai_subscriptions,
  to_jsonb(s)||jsonb_build_object('restaurant_id',e.restaurant_id))).*
FROM public.restaurant_subscription_establishments e JOIN public.restaurant_ai_subscriptions s ON s.id=e.subscription_id
JOIN public.restaurants child ON child.id=e.restaurant_id JOIN public.restaurants parent ON parent.id=s.restaurant_id
WHERE s.plan='elite' AND child.owner_id=parent.owner_id
AND e.seat_number <= COALESCE(s.included_establishments_snapshot,3) + COALESCE((SELECT c.quantity FROM public.restaurant_subscription_extra_capacity c WHERE c.subscription_id=s.id),0);
REVOKE ALL ON public.restaurant_subscription_entitlements FROM anon;
GRANT SELECT ON public.restaurant_subscription_entitlements TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.restaurant_credit_root(p_restaurant uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE((SELECT s.restaurant_id FROM public.restaurant_subscription_establishments e
   JOIN public.restaurant_ai_subscriptions s ON s.id=e.subscription_id
   JOIN public.restaurants child ON child.id=e.restaurant_id JOIN public.restaurants parent ON parent.id=s.restaurant_id
   WHERE e.restaurant_id=p_restaurant AND child.owner_id=parent.owner_id
     AND EXISTS(SELECT 1 FROM public.restaurant_subscription_entitlements v WHERE v.restaurant_id=p_restaurant)),p_restaurant);
$$;
CREATE OR REPLACE FUNCTION public.restaurant_credit_group(p_restaurant uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p_restaurant UNION SELECT e.restaurant_id FROM public.restaurant_subscription_establishments e
 JOIN public.restaurant_ai_subscriptions s ON s.id=e.subscription_id WHERE s.restaurant_id=p_restaurant;
$$;
REVOKE ALL ON FUNCTION public.restaurant_credit_root(uuid),public.restaurant_credit_group(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_credit_root(uuid),public.restaurant_credit_group(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.restaurant_actualites_subscription_plan(p_restaurant_id uuid)
 RETURNS TABLE(has_access boolean, plan_slug text, weekly_post_limit integer, unlimited_posts boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.assert_commercial_demo_production_rpc_allowed();
  WITH selected_plan AS (
    SELECT lower(COALESCE(rsp.slug, ras.plan, '')) AS slug
    FROM public.restaurant_subscription_entitlements ras
    LEFT JOIN public.restaurant_subscription_plans rsp
      ON rsp.id = ras.restaurant_subscription_plan_id
    WHERE ras.restaurant_id = p_restaurant_id
      AND ras.stripe_mode='live' AND ras.status IN ('trialing', 'active')
      AND ras.current_period_start<=now() AND ras.current_period_end > now()
    ORDER BY ras.current_period_end DESC NULLS LAST, ras.created_at DESC
    LIMIT 1
  )
  SELECT
    COALESCE((SELECT slug IN ('pro', 'premium', 'elite', 'custom') FROM selected_plan), false) AS has_access,
    (SELECT slug FROM selected_plan) AS plan_slug,
    CASE
      WHEN (SELECT slug FROM selected_plan) = 'pro' THEN 1
      WHEN (SELECT slug FROM selected_plan) IN ('premium', 'elite', 'custom') THEN NULL
      ELSE 0
    END AS weekly_post_limit,
    COALESCE((SELECT slug IN ('premium', 'elite', 'custom') FROM selected_plan), false) AS unlimited_posts;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_has_elite_crm_subscription(p_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_subscription_entitlements ras
    LEFT JOIN public.restaurant_subscription_plans rsp
      ON rsp.id = ras.restaurant_subscription_plan_id
    WHERE ras.restaurant_id = p_restaurant_id
      AND ras.stripe_mode='live' AND ras.status IN ('trialing', 'active')
      AND ras.current_period_start<=now() AND ras.current_period_end > now()
      AND lower(COALESCE(rsp.slug, ras.plan, '')) IN ('premium', 'elite')
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_my_restaurant_ai_subscriptions(p_restaurant_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, restaurant_id uuid, plan text, status text, monthly_conversation_limit integer, monthly_text_tool_limit integer, monthly_image_limit integer, monthly_premium_image_limit integer, monthly_voice_minutes_limit integer, started_at timestamp with time zone, current_period_start timestamp with time zone, current_period_end timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, restaurant_subscription_plan_id uuid, billing_period text, monthly_campaign_credit_chf numeric, monthly_ai_tool_credits integer, monthly_photo_retouch_credits integer, cancel_at_period_end boolean, scheduled_plan_change jsonb, price_monthly_chf_snapshot numeric, currency text, billing_amount_chf_snapshot numeric, price_monthly_cents_snapshot integer, billing_amount_cents_snapshot integer, billing_net_cents_snapshot integer, billing_vat_cents_snapshot integer, vat_rate_bps_snapshot integer, annual_months_charged_snapshot integer, acquired_reservation_fee_cents_snapshot integer, marketplace_commission_bps_snapshot integer, included_establishments_snapshot integer, additional_establishment_price_cents_snapshot integer, reservation_revenue_cap_bps_snapshot integer, pricing_version_snapshot text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    s.id,
    s.restaurant_id,
    s.plan,
    s.status,
    s.monthly_conversation_limit,
    s.monthly_text_tool_limit,
    s.monthly_image_limit,
    s.monthly_premium_image_limit,
    s.monthly_voice_minutes_limit,
    s.started_at,
    s.current_period_start,
    s.current_period_end,
    s.created_at,
    s.updated_at,
    s.restaurant_subscription_plan_id,
    s.billing_period,
    s.monthly_campaign_credit_chf,
    s.monthly_ai_tool_credits,
    s.monthly_photo_retouch_credits,
    s.cancel_at_period_end,
    s.scheduled_plan_change,
    s.price_monthly_chf_snapshot,
    s.currency,
    s.billing_amount_chf_snapshot,
    s.price_monthly_cents_snapshot,
    s.billing_amount_cents_snapshot,
    s.billing_net_cents_snapshot,
    s.billing_vat_cents_snapshot,
    s.vat_rate_bps_snapshot,
    s.annual_months_charged_snapshot,
    s.acquired_reservation_fee_cents_snapshot,
    s.marketplace_commission_bps_snapshot,
    s.included_establishments_snapshot,
    s.additional_establishment_price_cents_snapshot,
    s.reservation_revenue_cap_bps_snapshot,
    s.pricing_version_snapshot
  FROM public.restaurant_subscription_entitlements s
  WHERE auth.uid() IS NOT NULL
    AND (public.auth_owns_restaurant(s.restaurant_id) OR public.auth_is_admin())
    AND (p_restaurant_ids IS NULL OR s.restaurant_id = ANY (p_restaurant_ids));
$function$;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(p_restaurant_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_subscription record;
  v_anchor timestamptz := COALESCE(
    p_since,
    p_until - interval '1 microsecond',
    now()
  );
  v_civil_start timestamptz;
  v_civil_end timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_result jsonb;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_id_required';
  END IF;
  IF p_since IS NOT NULL AND p_until IS NOT NULL AND p_until <= p_since THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_entitlement_window';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_is_admin() AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  p_restaurant_id := public.restaurant_credit_root(p_restaurant_id);

  SELECT subscription.billing_period,
         subscription.current_period_start,
         subscription.current_period_end
  INTO v_subscription
  FROM public.restaurant_subscription_entitlements subscription
  WHERE subscription.restaurant_id = p_restaurant_id
  ORDER BY
    CASE WHEN subscription.status IN ('trialing', 'active') THEN 0 ELSE 1 END,
    subscription.current_period_end DESC NULLS LAST,
    subscription.created_at DESC
  LIMIT 1;

  IF COALESCE(v_subscription.billing_period, 'monthly') <> 'yearly' OR v_subscription.current_period_end <= now() THEN
    RETURN public.get_restaurant_credit_usage_before_fair_growth(
      p_restaurant_id, p_since, p_until
    );
  END IF;
  IF v_subscription.current_period_start IS NULL OR v_subscription.current_period_end IS NULL
    OR v_subscription.current_period_end <= v_subscription.current_period_start
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'annual_subscription_service_period_required';
  END IF;

  v_civil_start := (
    date_trunc('month', v_anchor AT TIME ZONE 'Europe/Zurich')
    AT TIME ZONE 'Europe/Zurich'
  );
  v_civil_end := (
    (date_trunc('month', v_anchor AT TIME ZONE 'Europe/Zurich') + interval '1 month')
    AT TIME ZONE 'Europe/Zurich'
  );
  v_period_start := greatest(
    v_civil_start,
    v_subscription.current_period_start
  );
  v_period_end := least(
    v_civil_end,
    v_subscription.current_period_end
  );
  IF v_period_end <= v_period_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'annual_entitlement_window_outside_service_period';
  END IF;

  v_result := public.get_restaurant_credit_usage_before_fair_growth(
    p_restaurant_id, v_period_start, v_period_end
  );
  RETURN jsonb_set(
    v_result,
    '{period,entitlement_reset}',
    to_jsonb('civil_month'::text),
    true
  );
END;
$function$;

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
    AND ras.stripe_mode = 'live'
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

  IF v_subscription.id IS NULL OR v_subscription.status NOT IN ('active', 'trialing')
    OR v_subscription.current_period_end IS NULL OR v_subscription.current_period_end <= now() THEN
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
      WHEN v_subscription.id IS NOT NULL AND v_subscription.status IN ('active', 'trialing')
        AND v_subscription.current_period_start <= now() AND v_subscription.current_period_end > now() THEN
        (COALESCE(v_subscription.monthly_campaign_credit_chf, 0) * 15)
        + COALESCE(v_subscription.monthly_ai_tool_credits, 0)
        + COALESCE(v_subscription.monthly_photo_retouch_credits, 0)
      ELSE 0
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
  WHERE rcp.restaurant_id IN (SELECT public.restaurant_credit_group(p_restaurant_id))
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
    WHERE ac.restaurant_id IN (SELECT public.restaurant_credit_group(p_restaurant_id))
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
    FROM public.ai_usage_logs ul
    WHERE ul.restaurant_id IN (SELECT public.restaurant_credit_group(p_restaurant_id))
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
      WHERE ac.restaurant_id IN (SELECT public.restaurant_credit_group(p_restaurant_id))
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
      FROM public.ai_usage_logs ul
      WHERE ul.restaurant_id IN (SELECT public.restaurant_credit_group(p_restaurant_id))
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
$function$;


CREATE OR REPLACE FUNCTION public.guard_restaurant_tok_credit_spend()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      COALESCE(NEW.total_budget, 0),
      COALESCE(NEW.spent, 0),
      COALESCE(NEW.paid_amount, 0),
      0
    ) * 15;

    IF TG_OP = 'UPDATE'
      AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(COALESCE(OLD.payment_method, '')) = 'credits'
      AND lower(COALESCE(OLD.payment_status, '')) = 'paid'
    THEN
      v_old_required_credits := GREATEST(
        COALESCE(OLD.total_budget, 0),
        COALESCE(OLD.spent, 0),
        COALESCE(OLD.paid_amount, 0),
        0
      ) * 15;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_required_credits <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || public.restaurant_credit_root(v_restaurant_id)::text)::bigint);

  v_usage := public.get_restaurant_credit_usage(v_restaurant_id);
  v_available_credits := public.tok_credit_balance_from_usage(v_usage) + v_old_required_credits;

  IF v_required_credits > v_available_credits THEN
    RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %, available %',
      v_restaurant_id,
      v_required_credits,
      v_available_credits
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(p_restaurant_id uuid, p_feature text, p_units integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plan text := 'starter';
  v_limit integer := 0;
  v_used integer := 0;
  v_allowed boolean := false;
  v_feature text := COALESCE(NULLIF(trim(p_feature), ''), 'ai_sales_insights');
BEGIN
  IF p_restaurant_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'feature', v_feature,
      'plan', v_plan,
      'limit', 0,
      'used', 0,
      'remaining', 0,
      'reason', 'restaurant_required'
    );
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT public.is_feature_flag_active(v_feature) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'feature', v_feature,
      'plan', v_plan,
      'limit', 0,
      'used', 0,
      'remaining', 0,
      'reason', 'feature_disabled'
    );
  END IF;

  SELECT
    ras.plan,
    CASE
      WHEN v_feature = 'ai_support_chat' THEN ras.monthly_conversation_limit
      WHEN v_feature = 'ai_photo_enhancer' THEN ras.monthly_image_limit
      WHEN v_feature = 'ai_premium_image_generation' THEN ras.monthly_premium_image_limit
      WHEN v_feature IN ('ai_menu_optimizer', 'ai_marketing_campaigns', 'ai_sales_insights', 'ai_accounting_insights') THEN ras.monthly_text_tool_limit
      WHEN v_feature = 'ai_admin_monitoring' THEN GREATEST(ras.monthly_text_tool_limit, 100)
      ELSE ras.monthly_text_tool_limit
    END
  INTO v_plan, v_limit
  FROM public.restaurant_subscription_entitlements ras
  WHERE ras.restaurant_id = p_restaurant_id
    AND ras.stripe_mode = 'live'
    AND ras.status IN ('trialing', 'active')
    AND ras.current_period_start <= now()
    AND ras.current_period_end > now()
  ORDER BY ras.created_at DESC
  LIMIT 1;

  IF v_limit IS NULL THEN
    v_limit := 0;
  END IF;

  SELECT count(*)::integer
  INTO v_used
  FROM public.ai_usage_logs ul
  WHERE ul.restaurant_id IN (SELECT public.restaurant_credit_group(public.restaurant_credit_root(p_restaurant_id)))
    AND ul.status = 'success'
    AND ul.created_at >= date_trunc('month', now())
    AND COALESCE(ul.feature_name, ul.metadata->>'feature', ul.action) = v_feature;

  v_allowed := v_limit < 0 OR (v_used + GREATEST(COALESCE(p_units, 1), 1)) <= v_limit;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'feature', v_feature,
    'plan', v_plan,
    'limit', v_limit,
    'used', v_used,
    'remaining', CASE WHEN v_limit < 0 THEN -1 ELSE GREATEST(v_limit - v_used, 0) END,
    'reason', CASE WHEN v_allowed THEN NULL ELSE 'quota_exceeded' END
  );
END;
$function$;


COMMIT;
