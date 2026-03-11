-- Assign restaurants to rbarman back-office account.
-- Business decision: in this environment, the current restaurant catalog is operated by a single demo restaurateur account
-- (rbarman@hotmail.ch) so that ownership-based back-office flows work immediately after deployment.
-- Scope chosen explicitly: only restaurants with owner_id IS NULL are assigned, to avoid overriding valid existing ownership.

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
    RAISE NOTICE 'No auth.users row found for rbarman@hotmail.ch; no restaurant ownership updated.';
    RETURN;
  END IF;

  UPDATE public.restaurants
  SET owner_id = v_rbarman_user_id
  WHERE owner_id IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RAISE NOTICE 'Assigned % restaurant(s) with NULL owner_id to rbarman@hotmail.ch (%).', v_rows_updated, v_rbarman_user_id;
END
$$;

-- Verification (run manually after migration):
-- SELECT COUNT(*) AS restaurants_assigned_to_rbarman
-- FROM public.restaurants r
-- JOIN auth.users u ON u.id = r.owner_id
-- WHERE u.email = 'rbarman@hotmail.ch';
