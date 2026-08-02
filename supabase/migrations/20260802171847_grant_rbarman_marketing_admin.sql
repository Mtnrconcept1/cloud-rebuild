-- grant_rbarman_marketing_admin
-- Allow the existing rbarman account to access the isolated Marketing Operations Center.
-- This is intentionally non-destructive and only applies when the Supabase Auth user already exists.

DO $$
DECLARE
  v_rbarman_user_id uuid;
BEGIN
  SELECT id
  INTO v_rbarman_user_id
  FROM auth.users
  WHERE lower(email) = 'rbarman@hotmail.ch'
  LIMIT 1;

  IF v_rbarman_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row found for rbarman@hotmail.ch; skipping marketing admin role grant.';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_rbarman_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Ensured admin role for rbarman@hotmail.ch (%) so Marketing Operations login can pass the BFF admin check.', v_rbarman_user_id;
END
$$;

NOTIFY pgrst, 'reload schema';
