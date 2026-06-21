-- Restaurateur onboarding now requires only an active subscription, not a legacy launch pack.
-- Onboarding payment required before approval remains enforced by this gate.
CREATE OR REPLACE FUNCTION public.signup_restaurateur_onboarding_payment_ready(
  p_application_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.signup_applications%ROWTYPE;
  v_metadata jsonb;
  v_restaurant_id uuid;
  v_subscription_plan_id uuid;
  v_subscription_plan_slug text;
  v_subscription_ready boolean := false;
BEGIN
  IF p_application_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_application
  FROM public.signup_applications
  WHERE id = p_application_id;

  IF NOT FOUND OR v_application.requested_role <> 'restaurateur' THEN
    RETURN false;
  END IF;

  v_metadata := COALESCE(v_application.metadata, '{}'::jsonb);

  BEGIN
    v_restaurant_id := NULLIF(v_metadata->>'restaurant_id', '')::uuid;
    v_subscription_plan_id := NULLIF(v_metadata->>'selected_subscription_plan_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_restaurant_id IS NULL OR v_subscription_plan_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT rsp.slug INTO v_subscription_plan_slug
  FROM public.restaurant_subscription_plans rsp
  WHERE rsp.id = v_subscription_plan_id
    AND rsp.is_active = true;

  IF v_subscription_plan_slug IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_ai_subscriptions ras
    WHERE ras.restaurant_id = v_restaurant_id
      AND ras.restaurant_subscription_plan_id = v_subscription_plan_id
      AND ras.plan = v_subscription_plan_slug
      AND ras.status IN ('active', 'trialing')
      AND ras.current_period_end > now()
  ) INTO v_subscription_ready;

  RETURN v_subscription_ready;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid) TO authenticated;
