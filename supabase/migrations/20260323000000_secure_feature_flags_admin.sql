-- Secure feature flag management: server-side RPC with RBAC + audit trail.

-- 1. Audit trigger: log every change to feature_flags in audit_log
CREATE OR REPLACE FUNCTION public.log_feature_flag_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    auth.uid(),
    TG_OP,
    'feature_flag',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flag_audit ON public.feature_flags;
CREATE TRIGGER trg_feature_flag_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.log_feature_flag_audit();

-- 2. Server-side RPC to toggle a single feature flag (admin-only)
CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(
  p_flag_name text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag record;
BEGIN
  -- RBAC check
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  -- Upsert the flag
  UPDATE public.feature_flags
  SET is_active = p_is_active,
      updated_at = now()
  WHERE name = p_flag_name
  RETURNING id, name, is_active INTO v_flag;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feature flag "%" not found.', p_flag_name;
  END IF;

  -- Cascade: disabling "livraison" also disables "commandes"
  IF p_flag_name = 'livraison' AND NOT p_is_active THEN
    UPDATE public.feature_flags
    SET is_active = false, updated_at = now()
    WHERE name = 'commandes' AND is_active = true;
  END IF;

  RETURN jsonb_build_object(
    'id', v_flag.id,
    'name', v_flag.name,
    'is_active', v_flag.is_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_feature_flag(text, boolean) TO authenticated;

-- 3. Server-side RPC to activate all feature flags (admin-only)
CREATE OR REPLACE FUNCTION public.admin_activate_all_feature_flags()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  UPDATE public.feature_flags
  SET is_active = true, updated_at = now()
  WHERE is_active = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_all_feature_flags() TO authenticated;

-- 4. Server-side RPC to seed missing default flags (admin-only)
CREATE OR REPLACE FUNCTION public.admin_seed_default_flags(
  p_flags jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  FOR v_flag IN SELECT * FROM jsonb_array_elements(p_flags)
  LOOP
    INSERT INTO public.feature_flags (name, label, description, is_active)
    VALUES (
      v_flag ->> 'name',
      v_flag ->> 'label',
      v_flag ->> 'description',
      COALESCE((v_flag ->> 'is_active')::boolean, true)
    )
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_seed_default_flags(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
