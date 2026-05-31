CREATE OR REPLACE FUNCTION public.is_restaurant_internal_actor(p_user_id uuid, p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.restaurants r
        WHERE r.id = p_restaurant_id
          AND r.owner_id = p_user_id
      )
      OR public.has_role(p_user_id, 'admin')
    ),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_restaurant_internal_actor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_restaurant_internal_actor(uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
