-- tok_one_currency_chf
-- Align Tok One subscription plan defaults and admin RPC fallbacks with the Swiss market.

ALTER TABLE public.user_subscription_plans
  ALTER COLUMN currency SET DEFAULT 'CHF';

UPDATE public.user_subscription_plans
SET currency = 'CHF'
WHERE NULLIF(trim(COALESCE(currency, '')), '') IS NULL
   OR upper(currency) = 'EUR'
   OR currency = 'chf';

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
      currency = COALESCE(NULLIF(p_payload ->> 'currency', ''), 'CHF'),
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
      COALESCE(NULLIF(p_payload ->> 'currency', ''), 'CHF'),
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

REVOKE EXECUTE ON FUNCTION public.admin_save_subscription_plan(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_subscription_plan(uuid, jsonb, jsonb, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
