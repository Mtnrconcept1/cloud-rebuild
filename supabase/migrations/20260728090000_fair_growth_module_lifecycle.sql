-- Audited, idempotent Fair Growth module lifecycle. Stripe remains the
-- authority for activation and credits; browser callers can only request or
-- control an already confirmed local entitlement.
BEGIN;

CREATE TABLE IF NOT EXISTS public.restaurant_paid_module_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_module_id uuid NOT NULL REFERENCES public.restaurant_paid_modules(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('confirm_activation', 'pause', 'resume', 'cancel', 'process_credit')),
  idempotency_key text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  stripe_event_id text REFERENCES public.stripe_webhook_events(event_id),
  stripe_object_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paid_module_id, action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS restaurant_paid_module_events_restaurant_created_idx
  ON public.restaurant_paid_module_events (restaurant_id, created_at DESC);
ALTER TABLE public.restaurant_paid_module_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restaurant_paid_module_events_owner_read ON public.restaurant_paid_module_events;
CREATE POLICY restaurant_paid_module_events_owner_read ON public.restaurant_paid_module_events
  FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());
REVOKE ALL ON public.restaurant_paid_module_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.restaurant_paid_module_events TO authenticated, service_role;
GRANT INSERT ON public.restaurant_paid_module_events TO service_role;

CREATE OR REPLACE FUNCTION private_finance.transition_fair_growth_module(
  p_paid_module_id uuid,
  p_action text,
  p_idempotency_key text,
  p_stripe_event_id text DEFAULT NULL,
  p_stripe_object_id text DEFAULT NULL,
  p_credit_amount_cents integer DEFAULT NULL
)
RETURNS public.restaurant_paid_modules
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row public.restaurant_paid_modules%ROWTYPE;
  v_existing public.restaurant_paid_module_events%ROWTYPE;
  v_target text;
  v_from_status text;
  v_is_admin boolean := COALESCE(public.auth_is_admin(), false);
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF NULLIF(trim(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'idempotency_key_required';
  END IF;
  SELECT * INTO v_row FROM public.restaurant_paid_modules WHERE id = p_paid_module_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'paid_module_not_found'; END IF;
  v_from_status := v_row.status;
  IF NOT (v_is_service OR v_is_admin OR (auth.uid() IS NOT NULL AND public.auth_owns_restaurant(v_row.restaurant_id))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;

  SELECT * INTO v_existing FROM public.restaurant_paid_module_events
  WHERE paid_module_id = p_paid_module_id AND action = p_action AND idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN RETURN v_row; END IF;

  IF p_action = 'confirm_activation' THEN
    IF NOT (v_is_service OR v_is_admin) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_or_service_required'; END IF;
    IF p_stripe_event_id IS NULL OR p_stripe_object_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.stripe_webhook_events e
      WHERE e.event_id = p_stripe_event_id AND e.processed_at IS NOT NULL
        AND e.event_type IN ('invoice.paid', 'invoice.payment_succeeded', 'checkout.session.completed')
    ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'authoritative_stripe_payment_required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fair_growth_modules m WHERE m.id = v_row.module_id AND m.is_active AND m.availability_status = 'available')
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'module_not_operational'; END IF;
    IF v_row.status NOT IN ('requested', 'trialing', 'active') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_transition'; END IF;
    v_target := 'active';
    UPDATE public.restaurant_paid_modules SET status = v_target,
      activated_at = COALESCE(activated_at, now()),
      evaluation_started_at = COALESCE(evaluation_started_at, now()),
      evaluation_ends_at = COALESCE(evaluation_ends_at, now() + make_interval(days => value_guarantee_days_snapshot)),
      metadata = metadata || jsonb_build_object('activation_stripe_event_id', p_stripe_event_id, 'activation_stripe_object_id', p_stripe_object_id),
      updated_at = now() WHERE id = p_paid_module_id RETURNING * INTO v_row;
  ELSIF p_action = 'pause' THEN
    IF v_row.status NOT IN ('active', 'paused') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_transition'; END IF;
    v_target := 'paused';
    UPDATE public.restaurant_paid_modules SET status = v_target, updated_at = now() WHERE id = p_paid_module_id RETURNING * INTO v_row;
  ELSIF p_action = 'resume' THEN
    IF v_row.status NOT IN ('paused', 'active') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_transition'; END IF;
    v_target := 'active';
    UPDATE public.restaurant_paid_modules SET status = v_target, updated_at = now() WHERE id = p_paid_module_id RETURNING * INTO v_row;
  ELSIF p_action = 'cancel' THEN
    IF v_row.status NOT IN ('requested', 'trialing', 'active', 'paused', 'cancelled') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_transition'; END IF;
    v_target := 'cancelled';
    UPDATE public.restaurant_paid_modules SET status = v_target, cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
      WHERE id = p_paid_module_id RETURNING * INTO v_row;
  ELSIF p_action = 'process_credit' THEN
    IF NOT (v_is_service OR v_is_admin) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_or_service_required'; END IF;
    IF v_row.status <> 'credit_due' OR COALESCE(p_credit_amount_cents, 0) <= 0 OR p_stripe_event_id IS NULL OR p_stripe_object_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.stripe_webhook_events e WHERE e.event_id = p_stripe_event_id AND e.processed_at IS NOT NULL)
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'authoritative_stripe_credit_required'; END IF;
    v_target := 'cancelled';
    UPDATE public.restaurant_paid_modules SET status = v_target, credit_amount_cents = p_credit_amount_cents,
      cancelled_at = COALESCE(cancelled_at, now()), metadata = metadata || jsonb_build_object('credit_stripe_event_id', p_stripe_event_id, 'credit_stripe_object_id', p_stripe_object_id), updated_at = now()
      WHERE id = p_paid_module_id RETURNING * INTO v_row;
  ELSE RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown_action';
  END IF;

  INSERT INTO public.restaurant_paid_module_events (paid_module_id, restaurant_id, action, idempotency_key, actor_id, from_status, to_status, stripe_event_id, stripe_object_id, details)
  VALUES (v_row.id, v_row.restaurant_id, p_action, trim(p_idempotency_key), auth.uid(),
    v_from_status,
    v_target, p_stripe_event_id, p_stripe_object_id, jsonb_build_object('credit_amount_cents', p_credit_amount_cents, 'pricing_version', v_row.pricing_version_snapshot,
      'monthly_base_cents', v_row.monthly_base_cents_snapshot, 'variable_fee_bps', v_row.variable_fee_bps_snapshot));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION private_finance.transition_fair_growth_module(uuid,text,text,text,text,integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_fair_growth_module_activation(p_paid_module_id uuid, p_idempotency_key text, p_stripe_event_id text, p_stripe_object_id text)
RETURNS public.restaurant_paid_modules LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private_finance.transition_fair_growth_module(p_paid_module_id, 'confirm_activation', p_idempotency_key, p_stripe_event_id, p_stripe_object_id, NULL) $$;
CREATE OR REPLACE FUNCTION public.pause_fair_growth_module(p_paid_module_id uuid, p_idempotency_key text)
RETURNS public.restaurant_paid_modules LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private_finance.transition_fair_growth_module(p_paid_module_id, 'pause', p_idempotency_key) $$;
CREATE OR REPLACE FUNCTION public.resume_fair_growth_module(p_paid_module_id uuid, p_idempotency_key text)
RETURNS public.restaurant_paid_modules LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private_finance.transition_fair_growth_module(p_paid_module_id, 'resume', p_idempotency_key) $$;
CREATE OR REPLACE FUNCTION public.cancel_fair_growth_module(p_paid_module_id uuid, p_idempotency_key text)
RETURNS public.restaurant_paid_modules LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private_finance.transition_fair_growth_module(p_paid_module_id, 'cancel', p_idempotency_key) $$;
CREATE OR REPLACE FUNCTION public.process_fair_growth_module_credit(p_paid_module_id uuid, p_idempotency_key text, p_credit_amount_cents integer, p_stripe_event_id text, p_stripe_object_id text)
RETURNS public.restaurant_paid_modules LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT private_finance.transition_fair_growth_module(p_paid_module_id, 'process_credit', p_idempotency_key, p_stripe_event_id, p_stripe_object_id, p_credit_amount_cents) $$;

REVOKE ALL ON FUNCTION public.confirm_fair_growth_module_activation(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pause_fair_growth_module(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_fair_growth_module(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_fair_growth_module(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_fair_growth_module_credit(uuid,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_fair_growth_module_activation(uuid,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pause_fair_growth_module(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_fair_growth_module(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_fair_growth_module(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_fair_growth_module_credit(uuid,text,integer,text,text) TO authenticated, service_role;

-- Paginated support view: requested activations older than 30 minutes and
-- authoritative module-payment events with no matching local activation.
CREATE OR REPLACE FUNCTION public.admin_get_fair_growth_reconciliation(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE (incident_type text, restaurant_id uuid, paid_module_id uuid, module_slug text, stripe_event_id text, created_at timestamptz, details jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT COALESCE(public.auth_is_admin(), false) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required'; END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT 'activation_blocked'::text, rpm.restaurant_id, rpm.id, m.slug, NULL::text, rpm.requested_at,
      jsonb_build_object('status', rpm.status, 'pricing_version', rpm.pricing_version_snapshot)
    FROM public.restaurant_paid_modules rpm JOIN public.fair_growth_modules m ON m.id = rpm.module_id
    WHERE rpm.status = 'requested' AND rpm.requested_at < now() - interval '30 minutes'
    UNION ALL
    SELECT 'stripe_payment_without_local_state', NULL::uuid, NULL::uuid,
      e.payload #>> '{data,object,metadata,module_slug}', e.event_id, e.created_at,
      jsonb_build_object('stripe_object_id', e.payload #>> '{data,object,id}')
    FROM public.stripe_webhook_events e
    WHERE e.event_type IN ('invoice.paid','invoice.payment_succeeded','checkout.session.completed')
      AND e.payload #>> '{data,object,metadata,billing_kind}' = 'fair_growth_module'
      AND NOT EXISTS (SELECT 1 FROM public.restaurant_paid_module_events pe WHERE pe.stripe_event_id = e.event_id)
  ) incidents ORDER BY created_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 200) OFFSET GREATEST(p_offset, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_fair_growth_reconciliation(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_fair_growth_reconciliation(integer,integer) TO authenticated, service_role;

COMMIT;
