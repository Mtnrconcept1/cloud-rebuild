CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
  p_user_id uuid,
  p_roles public.app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_role public.app_role;
  v_roles public.app_role[];
  v_old_roles public.app_role[];
  v_last_admin_removal boolean;
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT COALESCE(array_agg(deduped.role_name ORDER BY deduped.role_name::text), ARRAY['client'::public.app_role])
  INTO v_roles
  FROM (
    SELECT DISTINCT role_name
    FROM unnest(COALESCE(p_roles, ARRAY['client'::public.app_role])) AS role_name
    WHERE role_name IS NOT NULL
  ) AS deduped;

  IF COALESCE(array_length(v_roles, 1), 0) = 0 THEN
    v_roles := ARRAY['client'::public.app_role];
  END IF;

  PERFORM 1
  FROM public.user_roles
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(ur.role ORDER BY ur.role::text), ARRAY[]::public.app_role[])
  INTO v_old_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  v_last_admin_removal :=
    'admin'::public.app_role = ANY(v_old_roles)
    AND NOT ('admin'::public.app_role = ANY(v_roles))
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.role = 'admin'::public.app_role
        AND ur.user_id <> p_user_id
    );

  IF v_last_admin_removal THEN
    RAISE EXCEPTION 'Cannot remove the last admin role.';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_set_user_roles',
    'user_roles',
    p_user_id,
    jsonb_build_object('roles', COALESCE(to_jsonb(v_old_roles), '[]'::jsonb)),
    jsonb_build_object('roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
