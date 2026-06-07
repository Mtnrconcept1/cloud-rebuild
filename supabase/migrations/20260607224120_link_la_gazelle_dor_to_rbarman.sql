-- link_la_gazelle_dor_to_rbarman
-- Mirror the Quirinale seed: attach La Gazelle d'Or to the rbarman restaurateur account.
-- Scope is deliberately limited to the stable slug and Rue de Lyon 55 fallback.

DO $$
DECLARE
  v_rbarman_user_id uuid;
  v_rows_updated integer := 0;
BEGIN
  SELECT id
  INTO v_rbarman_user_id
  FROM auth.users
  WHERE email = 'rbarman@hotmail.ch'
  LIMIT 1;

  IF v_rbarman_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row found for rbarman@hotmail.ch; skipping La Gazelle d''Or ownership link.';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_rbarman_user_id, 'restaurateur'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.restaurants AS r
  SET owner_id = v_rbarman_user_id
  WHERE lower(COALESCE(r.slug, '')) = 'la-gazelle-d-or'
     OR (
      lower(r.name) = lower('La Gazelle d''Or')
      AND lower(COALESCE(r.address, '')) = lower('Rue de Lyon 55')
      AND lower(COALESCE(r.city, '')) = 'geneve'
     );

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RAISE NOTICE 'Linked % La Gazelle d''Or restaurant row(s) to rbarman@hotmail.ch (%).', v_rows_updated, v_rbarman_user_id;
END
$$;

NOTIFY pgrst, 'reload schema';
