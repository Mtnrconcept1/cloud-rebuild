-- Keep feature rollout state readable by the application while retaining
-- super-admin-only writes.
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_public_select" ON public.feature_flags;
CREATE POLICY "feature_flags_public_select"
  ON public.feature_flags
  FOR SELECT
  TO anon, authenticated
  USING (true);
