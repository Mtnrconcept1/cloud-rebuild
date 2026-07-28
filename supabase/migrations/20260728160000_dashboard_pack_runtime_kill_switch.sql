-- Global Mon pack kill switch.
-- The UI flag and the server lifecycle share the same locked source of truth:
-- request/confirmation/resume fail closed, while pause/cancel/credit remain available.
BEGIN;

UPDATE public.feature_flags
SET label = 'Mon pack — coupure globale',
    description = 'Masque Mon pack et bloque les nouvelles activations ou reprises de modules Fair Growth.',
    updated_at = now()
WHERE name = 'dashboard-pack';

CREATE OR REPLACE FUNCTION private_finance.assert_dashboard_pack_runtime_enabled(
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_runtime_enabled boolean := false;
BEGIN
  IF p_action NOT IN ('request', 'confirm_activation', 'resume') THEN
    RETURN;
  END IF;

  -- Lock both dependency rows in a stable order. A concurrent admin toggle
  -- therefore completes either before or after the guarded lifecycle action.
  WITH locked_flags AS MATERIALIZED (
    SELECT flag.name, flag.is_active
    FROM public.feature_flags flag
    WHERE flag.name IN ('dashboard-pack', 'dashboard-restaurateur')
    ORDER BY flag.name
    FOR SHARE
  )
  SELECT COALESCE(count(*) = 2 AND bool_and(is_active), false)
  INTO v_runtime_enabled
  FROM locked_flags;

  IF NOT v_runtime_enabled THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'dashboard_pack_disabled',
      DETAIL = 'Mon pack is disabled globally or its dashboard dependency is unavailable.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private_finance.assert_dashboard_pack_runtime_enabled(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep the existing request implementation private and expose a guarded
-- compatibility wrapper under the unchanged public RPC signature.
ALTER FUNCTION public.request_fair_growth_module(uuid, text)
  RENAME TO request_fair_growth_module_unchecked;
ALTER FUNCTION public.request_fair_growth_module_unchecked(uuid, text)
  SET SCHEMA private_finance;
REVOKE ALL ON FUNCTION private_finance.request_fair_growth_module_unchecked(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_fair_growth_module(
  p_restaurant_id uuid,
  p_module_slug text
)
RETURNS public.restaurant_paid_modules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private_finance.assert_dashboard_pack_runtime_enabled('request');
  RETURN private_finance.request_fair_growth_module_unchecked(
    p_restaurant_id,
    p_module_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_fair_growth_module(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_fair_growth_module(uuid, text)
  TO authenticated;

-- Wrap the audited lifecycle without duplicating its authorization,
-- idempotency, Stripe authority or event-writing logic.
ALTER FUNCTION private_finance.transition_fair_growth_module(
  uuid, text, text, text, text, integer
)
  RENAME TO transition_fair_growth_module_unchecked;
REVOKE ALL ON FUNCTION private_finance.transition_fair_growth_module_unchecked(
  uuid, text, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private_finance.transition_fair_growth_module(
  p_paid_module_id uuid,
  p_action text,
  p_idempotency_key text,
  p_stripe_event_id text DEFAULT NULL,
  p_stripe_object_id text DEFAULT NULL,
  p_credit_amount_cents integer DEFAULT NULL
)
RETURNS public.restaurant_paid_modules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private_finance.assert_dashboard_pack_runtime_enabled(p_action);
  RETURN private_finance.transition_fair_growth_module_unchecked(
    p_paid_module_id,
    p_action,
    p_idempotency_key,
    p_stripe_event_id,
    p_stripe_object_id,
    p_credit_amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION private_finance.transition_fair_growth_module(
  uuid, text, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

-- Enforce the same invariant on trusted direct writes and verify that a
-- paused module cannot be resumed after its catalogue entry is disabled.
CREATE OR REPLACE FUNCTION private_finance.enforce_dashboard_pack_paid_module_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('requested', 'trialing', 'active') THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status
    OR NEW.status NOT IN ('requested', 'trialing', 'active')
  THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN NEW.status = 'requested' THEN 'request'
    WHEN NEW.status = 'trialing' THEN 'confirm_activation'
    ELSE 'resume'
  END;

  PERFORM private_finance.assert_dashboard_pack_runtime_enabled(v_action);

  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1
    FROM public.fair_growth_modules module
    WHERE module.id = NEW.module_id
      AND module.is_active
      AND module.availability_status IN ('available', 'pilot')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'module_not_operational';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private_finance.enforce_dashboard_pack_paid_module_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_dashboard_pack_paid_module_write
  ON public.restaurant_paid_modules;
CREATE TRIGGER enforce_dashboard_pack_paid_module_write
  BEFORE INSERT OR UPDATE OF status ON public.restaurant_paid_modules
  FOR EACH ROW
  EXECUTE FUNCTION private_finance.enforce_dashboard_pack_paid_module_write();

-- Rebind every public lifecycle RPC to the guarded private wrapper. The
-- helper deliberately returns early for pause, cancel and process_credit.
CREATE OR REPLACE FUNCTION public.confirm_fair_growth_module_activation(
  p_paid_module_id uuid,
  p_idempotency_key text,
  p_stripe_event_id text,
  p_stripe_object_id text
)
RETURNS public.restaurant_paid_modules
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private_finance.transition_fair_growth_module(
    p_paid_module_id,
    'confirm_activation',
    p_idempotency_key,
    p_stripe_event_id,
    p_stripe_object_id,
    NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.pause_fair_growth_module(
  p_paid_module_id uuid,
  p_idempotency_key text
)
RETURNS public.restaurant_paid_modules
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private_finance.transition_fair_growth_module(
    p_paid_module_id,
    'pause',
    p_idempotency_key
  )
$$;

CREATE OR REPLACE FUNCTION public.resume_fair_growth_module(
  p_paid_module_id uuid,
  p_idempotency_key text
)
RETURNS public.restaurant_paid_modules
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private_finance.transition_fair_growth_module(
    p_paid_module_id,
    'resume',
    p_idempotency_key
  )
$$;

CREATE OR REPLACE FUNCTION public.cancel_fair_growth_module(
  p_paid_module_id uuid,
  p_idempotency_key text
)
RETURNS public.restaurant_paid_modules
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private_finance.transition_fair_growth_module(
    p_paid_module_id,
    'cancel',
    p_idempotency_key
  )
$$;

CREATE OR REPLACE FUNCTION public.process_fair_growth_module_credit(
  p_paid_module_id uuid,
  p_idempotency_key text,
  p_credit_amount_cents integer,
  p_stripe_event_id text,
  p_stripe_object_id text
)
RETURNS public.restaurant_paid_modules
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private_finance.transition_fair_growth_module(
    p_paid_module_id,
    'process_credit',
    p_idempotency_key,
    p_stripe_event_id,
    p_stripe_object_id,
    p_credit_amount_cents
  )
$$;

REVOKE ALL ON FUNCTION public.confirm_fair_growth_module_activation(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pause_fair_growth_module(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resume_fair_growth_module(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_fair_growth_module(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_fair_growth_module_credit(uuid, text, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.confirm_fair_growth_module_activation(uuid, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pause_fair_growth_module(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_fair_growth_module(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_fair_growth_module(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_fair_growth_module_credit(uuid, text, integer, text, text)
  TO authenticated, service_role;

COMMIT;
