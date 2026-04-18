-- Keep admin user listing compatible with projects that only retain public.profiles.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  city text,
  roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    au.id AS user_id,
    COALESCE(
      NULLIF(trim(COALESCE(p.full_name, '')), ''),
      split_part(COALESCE(au.email, au.id::text), '@', 1)
    ) AS full_name,
    au.email::text AS email,
    p.city,
    COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
    FROM public.user_roles ur
    WHERE ur.user_id = au.id
  ) AS roles_map ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY COALESCE(
    NULLIF(trim(COALESCE(p.full_name, '')), ''),
    COALESCE(au.email, au.id::text)
  );
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

NOTIFY pgrst, 'reload schema';
