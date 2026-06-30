-- Allow restaurant CRM for Premium and Elite subscriptions.
-- The legacy function name is kept for compatibility with existing RPC guards.

CREATE OR REPLACE FUNCTION public.restaurant_has_elite_crm_subscription(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_ai_subscriptions ras
    LEFT JOIN public.restaurant_subscription_plans rsp
      ON rsp.id = ras.restaurant_subscription_plan_id
    WHERE ras.restaurant_id = p_restaurant_id
      AND ras.status IN ('trialing', 'active')
      AND (ras.current_period_end IS NULL OR ras.current_period_end > now())
      AND lower(COALESCE(rsp.slug, ras.plan, '')) IN ('premium', 'elite')
  );
$$;

COMMENT ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid)
  IS 'Compatibility guard: returns true for active Premium or Elite restaurant subscriptions allowed to access CRM.';

REVOKE ALL ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
