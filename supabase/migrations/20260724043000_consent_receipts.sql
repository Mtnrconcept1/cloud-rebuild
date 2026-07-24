BEGIN;

CREATE TABLE IF NOT EXISTS public.consent_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_version text NOT NULL,
  necessary boolean NOT NULL DEFAULT true CHECK (necessary IS TRUE),
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  personalization boolean NOT NULL DEFAULT false,
  geolocation boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('banner', 'settings', 'migration')),
  user_agent text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_receipts_version_not_blank CHECK (btrim(consent_version) <> ''),
  CONSTRAINT consent_receipts_user_agent_length CHECK (user_agent IS NULL OR char_length(user_agent) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_consent_receipts_user_recorded
  ON public.consent_receipts (user_id, recorded_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consent_receipts_version_recorded
  ON public.consent_receipts (consent_version, recorded_at DESC);

ALTER TABLE public.consent_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.consent_receipts FROM PUBLIC;
GRANT INSERT ON public.consent_receipts TO anon, authenticated;
GRANT SELECT ON public.consent_receipts TO authenticated;

DROP POLICY IF EXISTS "Anyone can record consent" ON public.consent_receipts;
CREATE POLICY "Anyone can record consent"
  ON public.consent_receipts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    necessary IS TRUE
    AND source IN ('banner', 'settings', 'migration')
    AND recorded_at <= now() + interval '5 minutes'
    AND recorded_at >= now() - interval '1 day'
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can read own consent receipts" ON public.consent_receipts;
CREATE POLICY "Users can read own consent receipts"
  ON public.consent_receipts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.consent_receipts IS
  'Append-only audit trail of granular privacy choices. Browser state controls activation; this table preserves dated evidence.';

COMMIT;
