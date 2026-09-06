-- Turn existing AI feature flags into server-side kill switches for every
-- function that already uses the shared restaurant quota preflight.

CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(
  p_restaurant_id uuid,
  p_feature text,
  p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  FROM public.restaurant_ai_subscriptions ras
  WHERE ras.restaurant_id = p_restaurant_id
    AND ras.status IN ('trialing', 'active')
    AND ras.current_period_start <= now()
    AND ras.current_period_end > now()
  ORDER BY ras.created_at DESC
  LIMIT 1;

  IF v_limit IS NULL THEN
    v_plan := 'starter';
    v_limit := CASE
      WHEN v_feature = 'ai_support_chat' THEN 50
      WHEN v_feature = 'ai_photo_enhancer' THEN 0
      WHEN v_feature = 'ai_premium_image_generation' THEN 0
      ELSE 20
    END;
  END IF;

  SELECT count(*)::integer
  INTO v_used
  FROM public.ai_usage_logs ul
  WHERE ul.restaurant_id = p_restaurant_id
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
$$;

REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';