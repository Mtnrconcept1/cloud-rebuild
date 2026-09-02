-- Restore public read access to the cuisine taxonomy without exposing privileged role helpers.
-- Anonymous clients only need non-archived cuisines for public search filters.

DROP POLICY IF EXISTS "cuisines_public_select" ON public.cuisines;
DROP POLICY IF EXISTS "cuisines_admin_select_archived" ON public.cuisines;

CREATE POLICY "cuisines_public_select"
  ON public.cuisines
  FOR SELECT
  TO PUBLIC
  USING (archived_at IS NULL);

CREATE POLICY "cuisines_admin_select_archived"
  ON public.cuisines
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Keep the taxonomy readable by public clients while leaving privileged helpers private.
GRANT SELECT ON public.cuisines TO anon, authenticated;

-- Rollback reference (apply through a new additive migration if ever needed):
-- DROP POLICY IF EXISTS "cuisines_public_select" ON public.cuisines;
-- DROP POLICY IF EXISTS "cuisines_admin_select_archived" ON public.cuisines;
-- CREATE POLICY "cuisines_public_select" ON public.cuisines
--   FOR SELECT USING (archived_at IS NULL OR public.has_role(auth.uid(), 'admin'));
