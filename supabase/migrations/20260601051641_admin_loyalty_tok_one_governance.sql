ALTER TABLE public.loyalty_tiers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS public.admin_loyalty_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  reason text,
  admin_user_id uuid DEFAULT auth.uid(),
  old_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_loyalty_change_history_entity_created_idx
  ON public.admin_loyalty_change_history(entity_type, entity_id, created_at DESC);

ALTER TABLE public.admin_loyalty_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_loyalty_change_history_admin_select" ON public.admin_loyalty_change_history;
CREATE POLICY "admin_loyalty_change_history_admin_select"
  ON public.admin_loyalty_change_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_loyalty_change_history_admin_insert" ON public.admin_loyalty_change_history;
CREATE POLICY "admin_loyalty_change_history_admin_insert"
  ON public.admin_loyalty_change_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT ON public.admin_loyalty_change_history TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_tok_one_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_subscribers integer := 0;
  v_canceled_subscribers integer := 0;
  v_monthly_revenue numeric := 0;
  v_estimated_benefit_cost numeric := 0;
  v_active_plans integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_plans
  FROM public.user_subscription_plans
  WHERE COALESCE(status, 'active') = 'active';

  SELECT
    COUNT(*) FILTER (WHERE COALESCE(ts.status, 'inactive') IN ('active', 'trialing'))::integer,
    COUNT(*) FILTER (WHERE COALESCE(ts.status, 'inactive') IN ('canceled', 'cancelled'))::integer,
    COALESCE(SUM(CASE WHEN COALESCE(ts.status, 'inactive') IN ('active', 'trialing') THEN usp.price_monthly ELSE 0 END), 0)
  INTO v_active_subscribers, v_canceled_subscribers, v_monthly_revenue
  FROM public.user_subscription_plans usp
  LEFT JOIN public.tok_one_subscriptions ts ON ts.plan_id = usp.id;

  v_estimated_benefit_cost := ROUND((v_active_subscribers * 3.50)::numeric, 2);

  RETURN jsonb_build_object(
    'activePlans', v_active_plans,
    'activeSubscribers', COALESCE(v_active_subscribers, 0),
    'monthlyRevenue', COALESCE(v_monthly_revenue, 0),
    'churnCount', COALESCE(v_canceled_subscribers, 0),
    'benefitsConsumed', COALESCE(v_active_subscribers, 0) * 2,
    'estimatedBenefitCost', v_estimated_benefit_cost,
    'marginImpact', COALESCE(v_monthly_revenue, 0) - v_estimated_benefit_cost
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_subscription_plan(
  p_plan_id uuid,
  p_payload jsonb,
  p_benefits jsonb,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid := p_plan_id;
  v_old_data jsonb := '{}'::jsonb;
  v_benefit jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF COALESCE((p_payload ->> 'price_monthly')::numeric, 0) < 0 OR COALESCE((p_payload ->> 'price_yearly')::numeric, 0) < 0 THEN
    RAISE EXCEPTION 'price cannot be negative';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_benefits, '[]'::jsonb)) AS benefit
    WHERE NULLIF(trim(benefit ->> 'benefit_type'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'benefit type is required';
  END IF;

  IF v_plan_id IS NOT NULL THEN
    SELECT to_jsonb(usp.*)
    INTO v_old_data
    FROM public.user_subscription_plans usp
    WHERE usp.id = v_plan_id;

    UPDATE public.user_subscription_plans
    SET
      name = p_payload ->> 'name',
      description = NULLIF(p_payload ->> 'description', ''),
      price_monthly = COALESCE((p_payload ->> 'price_monthly')::numeric, 0),
      price_yearly = COALESCE((p_payload ->> 'price_yearly')::numeric, 0),
      currency = COALESCE(NULLIF(p_payload ->> 'currency', ''), 'EUR'),
      free_delivery_min_order = NULLIF(p_payload ->> 'free_delivery_min_order', '')::numeric,
      status = COALESCE(NULLIF(p_payload ->> 'status', ''), 'active'),
      updated_at = now()
    WHERE id = v_plan_id;
  ELSE
    INSERT INTO public.user_subscription_plans (
      name,
      description,
      price_monthly,
      price_yearly,
      currency,
      free_delivery_min_order,
      status
    )
    VALUES (
      p_payload ->> 'name',
      NULLIF(p_payload ->> 'description', ''),
      COALESCE((p_payload ->> 'price_monthly')::numeric, 0),
      COALESCE((p_payload ->> 'price_yearly')::numeric, 0),
      COALESCE(NULLIF(p_payload ->> 'currency', ''), 'EUR'),
      NULLIF(p_payload ->> 'free_delivery_min_order', '')::numeric,
      COALESCE(NULLIF(p_payload ->> 'status', ''), 'active')
    )
    RETURNING id INTO v_plan_id;
  END IF;

  DELETE FROM public.subscription_benefits WHERE plan_id = v_plan_id;

  FOR v_benefit IN SELECT value FROM jsonb_array_elements(COALESCE(p_benefits, '[]'::jsonb))
  LOOP
    INSERT INTO public.subscription_benefits (plan_id, benefit_type, value)
    VALUES (
      v_plan_id,
      v_benefit ->> 'benefit_type',
      COALESCE(v_benefit -> 'value', '{}'::jsonb)
    );
  END LOOP;

  INSERT INTO public.admin_loyalty_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('subscription_plan', v_plan_id, CASE WHEN p_plan_id IS NULL THEN 'create' ELSE 'update' END, p_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), p_payload);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_save_subscription_plan', 'subscription_plan', v_plan_id, COALESCE(v_old_data, '{}'::jsonb), p_payload);

  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_archive_subscription_plan(p_plan_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data jsonb;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT to_jsonb(usp.*) INTO v_old_data FROM public.user_subscription_plans usp WHERE id = p_plan_id;
  UPDATE public.user_subscription_plans SET status = 'archived', updated_at = now() WHERE id = p_plan_id;

  INSERT INTO public.admin_loyalty_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('subscription_plan', p_plan_id, 'archive', v_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('status', 'archived'));

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_archive_subscription_plan', 'subscription_plan', p_plan_id, COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('status', 'archived', 'reason', v_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_loyalty_tier(
  p_tier_id uuid,
  p_payload jsonb,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_id uuid := p_tier_id;
  v_old_data jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF COALESCE((p_payload ->> 'multiplier')::numeric, 1) <= 0 OR COALESCE((p_payload ->> 'multiplier')::numeric, 1) > 10 THEN
    RAISE EXCEPTION 'multiplier is invalid';
  END IF;

  IF v_tier_id IS NOT NULL THEN
    SELECT to_jsonb(lt.*) INTO v_old_data FROM public.loyalty_tiers lt WHERE id = v_tier_id;
    UPDATE public.loyalty_tiers
    SET
      name = p_payload ->> 'name',
      min_points = COALESCE((p_payload ->> 'min_points')::integer, 0),
      multiplier = COALESCE((p_payload ->> 'multiplier')::numeric, 1),
      benefits = COALESCE(p_payload -> 'benefits', '{}'::jsonb),
      status = COALESCE(NULLIF(p_payload ->> 'status', ''), 'active')
    WHERE id = v_tier_id;
  ELSE
    INSERT INTO public.loyalty_tiers (name, min_points, multiplier, benefits, status)
    VALUES (
      p_payload ->> 'name',
      COALESCE((p_payload ->> 'min_points')::integer, 0),
      COALESCE((p_payload ->> 'multiplier')::numeric, 1),
      COALESCE(p_payload -> 'benefits', '{}'::jsonb),
      COALESCE(NULLIF(p_payload ->> 'status', ''), 'active')
    )
    RETURNING id INTO v_tier_id;
  END IF;

  INSERT INTO public.admin_loyalty_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('loyalty_tier', v_tier_id, CASE WHEN p_tier_id IS NULL THEN 'create' ELSE 'update' END, p_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), p_payload);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_save_loyalty_tier', 'loyalty_tier', v_tier_id, COALESCE(v_old_data, '{}'::jsonb), p_payload);

  RETURN v_tier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_archive_loyalty_tier(p_tier_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data jsonb;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT to_jsonb(lt.*) INTO v_old_data FROM public.loyalty_tiers lt WHERE id = p_tier_id;
  UPDATE public.loyalty_tiers SET status = 'archived' WHERE id = p_tier_id;

  INSERT INTO public.admin_loyalty_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('loyalty_tier', p_tier_id, 'archive', v_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('status', 'archived'));

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_archive_loyalty_tier', 'loyalty_tier', p_tier_id, COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('status', 'archived', 'reason', v_reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_tok_one_metrics() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_save_subscription_plan(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_archive_subscription_plan(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_save_loyalty_tier(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_archive_loyalty_tier(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_tok_one_metrics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_subscription_plan(uuid, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_archive_subscription_plan(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_loyalty_tier(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_archive_loyalty_tier(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
