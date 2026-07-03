-- Track commercial ownership and signatures for the dedicated sales workspace.

ALTER TABLE public.commercial_prospect_followups
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS last_contacted_by_name text,
  ADD COLUMN IF NOT EXISTS signed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_by_name text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_signed_by
  ON public.commercial_prospect_followups(signed_by)
  WHERE signed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_signed_at
  ON public.commercial_prospect_followups(signed_at)
  WHERE signed_at IS NOT NULL;

COMMENT ON COLUMN public.commercial_prospect_followups.assigned_to_name
  IS 'Display name snapshot for the commercial currently owning this prospect.';

COMMENT ON COLUMN public.commercial_prospect_followups.last_contacted_by_name
  IS 'Display name snapshot for the commercial who last updated the prospect follow-up.';

COMMENT ON COLUMN public.commercial_prospect_followups.signed_by
  IS 'Commercial user who registered the restaurant signature.';

COMMENT ON COLUMN public.commercial_prospect_followups.signed_by_name
  IS 'Display name snapshot for the commercial who registered the signature.';

COMMENT ON COLUMN public.commercial_prospect_followups.signed_at
  IS 'Timestamp when the restaurant was marked as signed.';

NOTIFY pgrst, 'reload schema';
