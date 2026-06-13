-- Ensure email-confirmed signups land on the interface matching the role chosen at signup.
-- The privileged role only opens the correct pending surface; restaurant/courier activation remains controlled by admin review.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role text := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'client'));
  v_signup_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  v_signup_role := CASE
    WHEN v_requested_role = 'restaurateur' THEN 'restaurateur'::public.app_role
    WHEN v_requested_role IN ('courier', 'livreur') THEN 'courier'::public.app_role
    ELSE NULL
  END;

  IF v_signup_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_signup_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Repair users who confirmed their email before this fix but still only have the client role.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
       CASE
         WHEN lower(COALESCE(u.raw_user_meta_data->>'role', '')) = 'restaurateur'
           THEN 'restaurateur'::public.app_role
         WHEN lower(COALESCE(u.raw_user_meta_data->>'role', '')) IN ('courier', 'livreur')
           THEN 'courier'::public.app_role
       END AS role
FROM auth.users u
WHERE lower(COALESCE(u.raw_user_meta_data->>'role', '')) IN ('restaurateur', 'courier', 'livreur')
ON CONFLICT (user_id, role) DO NOTHING;

-- Always keep the base client role for authenticated users so client-created accounts keep the client interface.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'client'::public.app_role
FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;
