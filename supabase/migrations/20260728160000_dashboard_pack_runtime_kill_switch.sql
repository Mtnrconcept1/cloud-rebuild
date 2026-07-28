-- Global Mon pack kill switch.
-- The UI flag and the server lifecycle share the same source of truth:
-- request/confirmation/resume fail closed, while pause/cancel/credit remain available.
BEGIN;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'dashboard-pack',
  'Mon pack — coupure globale',
  'Masque Mon pack et bloque les nouvelles activations ou reprises de modules Fair Growth.',
  true
)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = now();

-- Keep already-open clients in sync with the global switch. RLS still
-- governs delivery and feature_flags is already publicly readable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feature_flags'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags';
  END IF;
END;
$$;

-- Enforce the critical reason on the server as well as in both admin UIs.
-- This keeps direct RPC calls inside the same audited contract.
CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(
  p_flag_name text,
  p_is_active boolean,
  p_reason text DEFAULT NULL,
  p_preset_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous boolean;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage feature flags';
  END IF;

  SELECT is_active INTO v_previous
  FROM public.feature_flags
  WHERE name = p_flag_name;

  IF p_is_active IS FALSE
    AND p_flag_name IN (
      'livraison',
      'emporter',
      'reservation',
      'payment-card',
      'dashboard-restaurateur',
      'dashboard-pack',
      'espace-livreur'
    )
    AND v_reason IS NULL
  THEN
    RAISE EXCEPTION 'reason is required for critical feature flag disable';
  END IF;

  IF p_flag_name = 'commandes' AND p_is_active IS FALSE AND EXISTS (
    SELECT 1 FROM public.feature_flags WHERE name = 'payment-card' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'payment-card requires commandes checkout to stay enabled';
  END IF;

  IF p_flag_name = 'actualites-sociales' AND p_is_active IS TRUE AND EXISTS (
    SELECT 1 FROM public.feature_flags WHERE name = 'tracking' AND is_active = false
  ) THEN
    RAISE EXCEPTION 'actualites-sociales requires tracking';
  END IF;

  UPDATE public.feature_flags
  SET is_active = p_is_active,
      updated_at = now()
  WHERE name = p_flag_name;

  IF NOT FOUND THEN
    INSERT INTO public.feature_flags (name, label, description, is_active)
    VALUES (p_flag_name, p_flag_name, 'Flag cree depuis la gouvernance admin.', p_is_active);
  END IF;

  INSERT INTO public.feature_flag_audit_logs (
    flag_name,
    previous_state,
    new_state,
    reason,
    preset_name,
    admin_user_id,
    metadata
  )
  VALUES (
    p_flag_name,
    v_previous,
    p_is_active,
    v_reason,
    NULLIF(trim(COALESCE(p_preset_name, '')), ''),
    auth.uid(),
    jsonb_build_object('source', 'admin_platform_config')
  );
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.assert_dashboard_pack_runtime_enabled(
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_runtime_enabled boolean;
BEGIN
  IF p_action NOT IN ('request', 'confirm_activation', 'resume') THEN
    RETURN;
  END IF;

  -- Lock only the master row. This serializes the kill switch with lifecycle
  -- writes without taking the inverse multi-row lock order of bulk activation.
  SELECT flag.is_active
  INTO v_runtime_enabled
  FROM public.feature_flags flag
  WHERE flag.name = 'dashboard-pack'
  FOR SHARE;

  IF NOT COALESCE(v_runtime_enabled, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PT423',
      MESSAGE = 'dashboard_pack_disabled',
      DETAIL = 'Mon pack is disabled globally.';
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

-- Enforce the same invariant on trusted direct writes. The audited lifecycle
-- keeps its original lookup order, so a replayed idempotency key returns before
-- this trigger and remains valid even after a later kill-switch activation.
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
  ELSIF NEW.status NOT IN ('requested', 'trialing', 'active') THEN
    RETURN NEW;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.module_id IS NOT DISTINCT FROM OLD.module_id
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
      ERRCODE = '22023',
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
  BEFORE INSERT OR UPDATE OF status, module_id ON public.restaurant_paid_modules
  FOR EACH ROW
  EXECUTE FUNCTION private_finance.enforce_dashboard_pack_paid_module_write();

-- Deployment postflight: object presence, private ACL and Realtime publication.
DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_flags WHERE name = 'dashboard-pack'
  ) THEN
    RAISE EXCEPTION 'Postflight failed: dashboard-pack feature flag is missing';
  END IF;

  IF to_regprocedure('public.request_fair_growth_module(uuid,text)') IS NULL
    OR to_regprocedure('private_finance.request_fair_growth_module_unchecked(uuid,text)') IS NULL
    OR to_regprocedure('private_finance.assert_dashboard_pack_runtime_enabled(text)') IS NULL
    OR to_regprocedure('private_finance.transition_fair_growth_module(uuid,text,text,text,text,integer)') IS NULL
  THEN
    RAISE EXCEPTION 'Postflight failed: a Mon pack lifecycle function is missing';
  END IF;

  IF has_function_privilege(
    'anon',
    'private_finance.assert_dashboard_pack_runtime_enabled(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Postflight failed: the private Mon pack guard is executable by anon';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgname = 'enforce_dashboard_pack_paid_module_write'
      AND tgrelid = 'public.restaurant_paid_modules'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Postflight failed: the Mon pack lifecycle trigger is missing';
  END IF;

  IF position(
    'dashboard-pack' IN pg_get_functiondef(
      'public.admin_toggle_feature_flag(text,boolean,text,text)'::regprocedure
    )
  ) = 0 THEN
    RAISE EXCEPTION 'Postflight failed: dashboard-pack is not a critical audited flag';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feature_flags'
  ) THEN
    RAISE EXCEPTION 'Postflight failed: feature_flags is missing from Supabase Realtime';
  END IF;
END;
$postflight$;

COMMIT;
