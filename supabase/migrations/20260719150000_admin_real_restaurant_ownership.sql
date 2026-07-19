-- Secure, audited ownership assignment for production users and restaurants.
-- Demo identities and demo restaurants are intentionally excluded.

CREATE OR REPLACE FUNCTION public.admin_list_real_restaurant_owners()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  roles text[],
  restaurant_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    auth_user.id,
    COALESCE(
      NULLIF(btrim(profile.full_name), ''),
      split_part(COALESCE(auth_user.email, auth_user.id::text), '@', 1)
    ),
    auth_user.email::text,
    COALESCE(role_map.roles, ARRAY['client']::text[]),
    COALESCE(restaurant_map.restaurant_count, 0::bigint)
  FROM auth.users AS auth_user
  LEFT JOIN public.profiles AS profile
    ON profile.user_id = auth_user.id
  LEFT JOIN LATERAL (
    SELECT array_agg(user_role.role::text ORDER BY user_role.role::text) AS roles
    FROM public.user_roles AS user_role
    WHERE user_role.user_id = auth_user.id
  ) AS role_map ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS restaurant_count
    FROM public.restaurants AS restaurant
    WHERE restaurant.owner_id = auth_user.id
      AND COALESCE(restaurant.is_demo, false) IS FALSE
  ) AS restaurant_map ON true
  WHERE lower(COALESCE(auth_user.raw_app_meta_data->>'account_type', ''))
      NOT IN ('commercial_demo', 'restaurant_demo', 'demo_system')
    AND lower(COALESCE(auth_user.raw_app_meta_data->>'environment', '')) <> 'demo'
    AND NOT EXISTS (
      SELECT 1
      FROM public.commercial_demo_accounts AS demo_account
      WHERE demo_account.user_id = auth_user.id
    )
  ORDER BY 2, 3;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_real_restaurants_for_assignment()
RETURNS TABLE (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  owner_id uuid,
  owner_name text,
  owner_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    restaurant.id,
    restaurant.name,
    restaurant.city,
    restaurant.owner_id,
    COALESCE(
      NULLIF(btrim(profile.full_name), ''),
      split_part(COALESCE(auth_user.email, restaurant.owner_id::text), '@', 1)
    ),
    auth_user.email::text
  FROM public.restaurants AS restaurant
  LEFT JOIN auth.users AS auth_user
    ON auth_user.id = restaurant.owner_id
  LEFT JOIN public.profiles AS profile
    ON profile.user_id = restaurant.owner_id
  WHERE COALESCE(restaurant.is_demo, false) IS FALSE
  ORDER BY restaurant.name, restaurant.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_link_real_user_restaurant(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_expected_owner_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_service_role boolean := COALESCE((SELECT auth.jwt()->>'role') = 'service_role', false);
  v_restaurant public.restaurants%ROWTYPE;
  v_target_user auth.users%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT v_is_service_role
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_restaurant_id IS NULL OR p_expected_owner_id IS NULL THEN
    RAISE EXCEPTION 'User, restaurant and expected owner are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found.' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_restaurant.is_demo, false) IS TRUE THEN
    RAISE EXCEPTION 'A demo restaurant cannot be linked in production.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_target_user
  FROM auth.users
  WHERE id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.' USING ERRCODE = 'P0002';
  END IF;

  IF lower(COALESCE(v_target_user.raw_app_meta_data->>'account_type', ''))
       IN ('commercial_demo', 'restaurant_demo', 'demo_system')
     OR lower(COALESCE(v_target_user.raw_app_meta_data->>'environment', '')) = 'demo'
     OR EXISTS (
       SELECT 1
       FROM public.commercial_demo_accounts AS demo_account
       WHERE demo_account.user_id = p_user_id
     ) THEN
    RAISE EXCEPTION 'A demo user cannot own a production restaurant.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'restaurateur'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- A retry after a lost network response is safe and returns the same state.
  IF v_restaurant.owner_id = p_user_id THEN
    RETURN jsonb_build_object(
      'restaurant_id', v_restaurant.id,
      'restaurant_name', v_restaurant.name,
      'owner_id', p_user_id,
      'changed', false
    );
  END IF;

  IF v_restaurant.owner_id IS DISTINCT FROM p_expected_owner_id THEN
    RAISE EXCEPTION 'The restaurant owner changed while this form was open. Refresh and retry.'
      USING ERRCODE = '40001';
  END IF;

  IF char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'A reassignment reason between 5 and 500 characters is required.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.restaurants
  SET owner_id = p_user_id,
      updated_at = now()
  WHERE id = p_restaurant_id;

  INSERT INTO public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  VALUES (
    v_actor_id,
    'admin_link_real_user_restaurant',
    'restaurant',
    p_restaurant_id,
    jsonb_build_object('owner_id', v_restaurant.owner_id),
    jsonb_build_object('owner_id', p_user_id, 'reason', v_reason)
  );

  RETURN jsonb_build_object(
    'restaurant_id', v_restaurant.id,
    'restaurant_name', v_restaurant.name,
    'previous_owner_id', v_restaurant.owner_id,
    'owner_id', p_user_id,
    'changed', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.admin_list_real_restaurant_owners() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_real_restaurants_for_assignment() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_link_real_user_restaurant(uuid, uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_real_restaurant_owners() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_real_restaurants_for_assignment() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_link_real_user_restaurant(uuid, uuid, uuid, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
