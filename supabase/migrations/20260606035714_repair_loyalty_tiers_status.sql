-- repair_loyalty_tiers_status
-- Production had the governance migration recorded as applied while the
-- loyalty_tiers.status column was missing. Miamz support triggers depend on it.

ALTER TABLE IF EXISTS public.loyalty_tiers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE public.loyalty_tiers
SET status = 'active'
WHERE status IS NULL
  OR trim(status) = ''
  OR status NOT IN ('active', 'inactive', 'archived');

DO $$
BEGIN
  IF to_regclass('public.loyalty_tiers') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'loyalty_tiers_status_check'
        AND conrelid = 'public.loyalty_tiers'::regclass
    )
  THEN
    ALTER TABLE public.loyalty_tiers
      ADD CONSTRAINT loyalty_tiers_status_check
      CHECK (status IN ('active', 'inactive', 'archived'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS loyalty_tiers_status_min_points_idx
  ON public.loyalty_tiers(status, min_points DESC);

NOTIFY pgrst, 'reload schema';
