-- Versioned, append-only privacy consent proof.
-- Additive migration: no existing transactional or identity data is modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.privacy_consent_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id uuid NOT NULL,
  consent_version text NOT NULL CHECK (char_length(btrim(consent_version)) BETWEEN 3 AND 100),
  action text NOT NULL CHECK (action IN ('accept_all', 'reject_all', 'save_preferences', 'withdraw')),
  necessary boolean NOT NULL DEFAULT true CHECK (necessary IS TRUE),
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  personalization boolean NOT NULL DEFAULT false,
  geolocation boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('banner', 'settings', 'cookies_page', 'mobile')),
  locale text CHECK (locale IS NULL OR char_length(locale) <= 32),
  client_recorded_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  retention_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '3 years'),
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT privacy_consent_client_time_reasonable CHECK (
    client_recorded_at IS NULL
    OR client_recorded_at BETWEEN occurred_at - interval '7 days' AND occurred_at + interval '1 day'
  )
);

ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_privacy_consent_events_user_occurred
  ON public.privacy_consent_events (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_privacy_consent_events_anonymous_occurred
  ON public.privacy_consent_events (anonymous_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_events_retention
  ON public.privacy_consent_events (retention_until);

CREATE OR REPLACE FUNCTION public.protect_privacy_consent_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'privacy_consent_events_are_append_only';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.retention_until > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'privacy_consent_event_retention_active';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_privacy_consent_event_update ON public.privacy_consent_events;
CREATE TRIGGER protect_privacy_consent_event_update
BEFORE UPDATE ON public.privacy_consent_events
FOR EACH ROW
EXECUTE FUNCTION public.protect_privacy_consent_event_mutation();

DROP TRIGGER IF EXISTS protect_privacy_consent_event_delete ON public.privacy_consent_events;
CREATE TRIGGER protect_privacy_consent_event_delete
BEFORE DELETE ON public.privacy_consent_events
FOR EACH ROW
EXECUTE FUNCTION public.protect_privacy_consent_event_mutation();

REVOKE ALL ON public.privacy_consent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.privacy_consent_events TO service_role;

COMMENT ON TABLE public.privacy_consent_events IS
  'Append-only proof of versioned privacy choices. Raw IP addresses are never stored.';
COMMENT ON COLUMN public.privacy_consent_events.ip_hash IS
  'Optional salted SHA-256 digest created by the Edge Function; never a raw IP address.';
COMMENT ON COLUMN public.privacy_consent_events.retention_until IS
  'Operational retention limit for consent proof; deletion is blocked before this timestamp.';

NOTIFY pgrst, 'reload schema';

COMMIT;
