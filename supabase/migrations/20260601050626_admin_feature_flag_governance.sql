CREATE TABLE IF NOT EXISTS public.feature_flag_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name text NOT NULL,
  previous_state boolean,
  new_state boolean,
  reason text,
  preset_name text,
  admin_user_id uuid DEFAULT auth.uid(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_flag_audit_logs_flag_created_idx
  ON public.feature_flag_audit_logs(flag_name, created_at DESC);

ALTER TABLE public.feature_flag_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flag_audit_logs_admin_select" ON public.feature_flag_audit_logs;
CREATE POLICY "feature_flag_audit_logs_admin_select"
  ON public.feature_flag_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "feature_flag_audit_logs_admin_insert" ON public.feature_flag_audit_logs;
CREATE POLICY "feature_flag_audit_logs_admin_insert"
  ON public.feature_flag_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.feature_flag_audit_logs TO authenticated;
GRANT INSERT ON public.feature_flag_audit_logs TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_feature_flag_audit_logs(p_limit integer DEFAULT 80)
RETURNS TABLE (
  id uuid,
  flag_name text,
  previous_state boolean,
  new_state boolean,
  reason text,
  preset_name text,
  admin_user_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read feature flag audit logs';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.flag_name,
    l.previous_state,
    l.new_state,
    l.reason,
    l.preset_name,
    l.admin_user_id,
    l.created_at
  FROM public.feature_flag_audit_logs l
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_toggle_feature_flag(text, boolean);
-- Contract: CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(text, boolean, text, text)
CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(
  p_flag_name text,
  p_is_active boolean,
  p_reason text DEFAULT NULL,
  p_preset_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF p_is_active IS FALSE AND p_flag_name IN ('livraison', 'emporter', 'reservation', 'payment-card', 'dashboard-restaurateur', 'espace-livreur') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required for critical feature flag disable';
  END IF;

  -- Guard: payment-card must not remain enabled when checkout/commandes is disabled.
  -- payment-card / commandes inconsistency is blocked from presets and direct calls.
  IF p_flag_name = 'commandes' AND p_is_active IS FALSE AND EXISTS (
    SELECT 1 FROM public.feature_flags WHERE name = 'payment-card' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'payment-card requires commandes checkout to stay enabled';
  END IF;

  -- Guard: actualites-sociales must not be active without tracking when that flag exists.
  -- actualites-sociales / tracking inconsistency is treated as a production safety issue.
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

CREATE OR REPLACE FUNCTION public.admin_apply_feature_flag_preset(
  p_preset_name text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_count integer := 0;
  v_flag record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can apply feature flag presets';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required for feature flag preset';
  END IF;

  -- Preset: production stable.
  IF p_preset_name = 'production stable' THEN
    FOR v_flag IN
      SELECT * FROM (VALUES
        ('payment-card', true),
        ('commandes', true),
        ('livraison', true),
        ('emporter', true),
        ('reservation', true),
        ('dashboard-restaurateur', true),
        ('admin-compta', true),
        ('admin-notifications', true)
      ) AS flags(name, is_active)
    LOOP
      PERFORM public.admin_toggle_feature_flag(v_flag.name, v_flag.is_active, v_reason, p_preset_name);
      v_count := v_count + 1;
    END LOOP;
  ELSIF p_preset_name = 'preview' THEN
    FOR v_flag IN
      SELECT * FROM (VALUES
        ('actualites-sociales', true),
        ('dashboard-actualites', true),
        ('tok-one', true),
        ('admin-actualites', true)
      ) AS flags(name, is_active)
    LOOP
      PERFORM public.admin_toggle_feature_flag(v_flag.name, v_flag.is_active, v_reason, p_preset_name);
      v_count := v_count + 1;
    END LOOP;
  ELSIF p_preset_name = 'maintenance paiements' THEN
    FOR v_flag IN
      SELECT * FROM (VALUES
        ('payment-card', false),
        ('payment-twint', false),
        ('payment-postfinance-card', false),
        ('payment-postfinance-efinance', false),
        ('tok-one', false),
        ('campagnes-pub', false)
      ) AS flags(name, is_active)
    LOOP
      PERFORM public.admin_toggle_feature_flag(v_flag.name, v_flag.is_active, v_reason, p_preset_name);
      v_count := v_count + 1;
    END LOOP;
  ELSIF p_preset_name = 'maintenance livraison' THEN
    FOR v_flag IN
      SELECT * FROM (VALUES
        ('livraison', false),
        ('espace-livreur', false),
        ('courier-home', false),
        ('courier-jobs', false),
        ('emporter', true),
        ('reservation', true)
      ) AS flags(name, is_active)
    LOOP
      PERFORM public.admin_toggle_feature_flag(v_flag.name, v_flag.is_active, v_reason, p_preset_name);
      v_count := v_count + 1;
    END LOOP;
  ELSIF p_preset_name = 'mode lecture seule' THEN
    FOR v_flag IN
      SELECT * FROM (VALUES
        ('payment-card', false),
        ('payment-cash', false),
        ('commandes', false),
        ('livraison', false),
        ('emporter', false),
        ('reservation', false),
        ('dashboard-commandes', false),
        ('dashboard-reservations', false)
      ) AS flags(name, is_active)
    LOOP
      PERFORM public.admin_toggle_feature_flag(v_flag.name, v_flag.is_active, v_reason, p_preset_name);
      v_count := v_count + 1;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Unknown feature flag preset: %', p_preset_name;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_feature_flag_audit_logs(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_feature_flag(text, boolean, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_apply_feature_flag_preset(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_feature_flag_audit_logs(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_toggle_feature_flag(text, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_feature_flag_preset(text, text) TO authenticated, service_role;
