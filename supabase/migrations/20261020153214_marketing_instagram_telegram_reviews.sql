-- Immutable snapshots submitted through the marketing BFF; no browser grants.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketing_instagram_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 20000),
  status text NOT NULL DEFAULT 'delivering' CHECK (status IN ('delivering','pending','delivery_unknown','approved','rejected')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  chat_id text NOT NULL CHECK (char_length(chat_id) BETWEEN 1 AND 40),
  message_id bigint CHECK (message_id > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_actor text,
  CHECK ((status IN ('approved','rejected')) = (decided_at IS NOT NULL AND decision_actor IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS marketing_instagram_reviews_created_idx ON public.marketing_instagram_reviews (created_at DESC);
ALTER TABLE public.marketing_instagram_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_instagram_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.marketing_instagram_reviews TO service_role;
CREATE OR REPLACE FUNCTION public.protect_instagram_review_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.fingerprint, NEW.payload, NEW.requested_by, NEW.token_hash, NEW.chat_id, NEW.expires_at, NEW.created_at)
     IS DISTINCT FROM (OLD.fingerprint, OLD.payload, OLD.requested_by, OLD.token_hash, OLD.chat_id, OLD.expires_at, OLD.created_at)
     OR OLD.status IN ('approved','rejected') THEN
    RAISE EXCEPTION 'instagram_review_snapshot_immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.message_id IS NOT NULL AND NEW.message_id IS DISTINCT FROM OLD.message_id THEN
    RAISE EXCEPTION 'instagram_review_message_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_instagram_review_snapshot() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_instagram_review_snapshot ON public.marketing_instagram_reviews;
CREATE TRIGGER protect_instagram_review_snapshot BEFORE UPDATE ON public.marketing_instagram_reviews
FOR EACH ROW EXECUTE FUNCTION public.protect_instagram_review_snapshot();
COMMENT ON TABLE public.marketing_instagram_reviews IS 'Private Instagram comment/reply snapshots and Telegram human decisions. Approval never publishes to Instagram.';
COMMIT;
