-- Fix: handle_new_user now assigns the correct role based on signup metadata.
-- Previously, all users received only the 'client' role regardless of their
-- chosen role during signup (e.g., restaurateur).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requested_role text;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Always assign client role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');

  -- If user signed up as restaurateur, also assign that role
  v_requested_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', ''));
  IF v_requested_role = 'restaurateur' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'restaurateur');
  END IF;

  RETURN NEW;
END;
$$;
