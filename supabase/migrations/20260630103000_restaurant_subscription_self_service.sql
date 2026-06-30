-- Restaurateur subscription self-service.
-- Adds non-destructive state needed to cancel at period end or schedule a
-- downgrade while keeping the current paid entitlements active.

ALTER TABLE public.restaurant_ai_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_plan_change jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stripe_subscription_schedule_id text;

ALTER TABLE public.restaurant_ai_subscriptions
  DROP CONSTRAINT IF EXISTS restaurant_ai_subscriptions_billing_period_check;

ALTER TABLE public.restaurant_ai_subscriptions
  ADD CONSTRAINT restaurant_ai_subscriptions_billing_period_check
  CHECK (billing_period IN ('monthly', 'yearly'));

CREATE INDEX IF NOT EXISTS idx_restaurant_ai_subscriptions_cancel_at_period_end
  ON public.restaurant_ai_subscriptions (cancel_at_period_end)
  WHERE cancel_at_period_end = true;

CREATE INDEX IF NOT EXISTS idx_restaurant_ai_subscriptions_schedule_id
  ON public.restaurant_ai_subscriptions (stripe_subscription_schedule_id)
  WHERE stripe_subscription_schedule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_restaurant_subscription_self_service_state(
  p_restaurant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
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
    ras.status,
    ras.cancel_at_period_end,
    ras.scheduled_plan_change,
    ras.stripe_subscription_schedule_id,
    ras.current_period_start,
    ras.current_period_end
  INTO v_subscription
  FROM public.restaurant_ai_subscriptions ras
  WHERE ras.restaurant_id = p_restaurant_id
  ORDER BY
    CASE WHEN ras.status IN ('trialing', 'active') THEN 0 ELSE 1 END,
    ras.current_period_end DESC,
    ras.created_at DESC
  LIMIT 1;

  IF v_subscription.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_subscription.id,
    'restaurant_id', v_subscription.restaurant_id,
    'status', v_subscription.status,
    'cancel_at_period_end', COALESCE(v_subscription.cancel_at_period_end, false),
    'scheduled_plan_change', COALESCE(v_subscription.scheduled_plan_change, '{}'::jsonb),
    'stripe_subscription_schedule_id', v_subscription.stripe_subscription_schedule_id,
    'current_period_start', v_subscription.current_period_start,
    'current_period_end', v_subscription.current_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_subscription_self_service_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_subscription_self_service_state(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
