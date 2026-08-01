-- Fence Google Actions Center outbox workers with a durable claim lease.
--
-- The original SKIP LOCKED claim protected only the short RPC transaction.
-- Once that RPC returned, the row was still pending and another worker could
-- claim and deliver it concurrently. Existing functions remain available for
-- a rolling deployment; the worker uses the token-aware settlement function.

ALTER TABLE public.google_actions_center_outbox
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

ALTER TABLE public.google_actions_center_outbox
  DROP CONSTRAINT IF EXISTS google_actions_center_outbox_status_check;

ALTER TABLE public.google_actions_center_outbox
  ADD CONSTRAINT google_actions_center_outbox_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'abandoned')
  );

ALTER TABLE public.google_actions_center_outbox
  DROP CONSTRAINT IF EXISTS google_actions_center_outbox_processing_claim_check;

ALTER TABLE public.google_actions_center_outbox
  ADD CONSTRAINT google_actions_center_outbox_processing_claim_check CHECK (
    status <> 'processing'
    OR (claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_google_actions_center_outbox_expired_lease
  ON public.google_actions_center_outbox (lease_expires_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.claim_google_actions_center_outbox(
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.google_actions_center_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.google_actions_center_outbox
    WHERE (
        status = 'pending'
        AND next_attempt_at <= now()
      )
      OR (
        status = 'processing'
        AND lease_expires_at <= now()
      )
    ORDER BY
      CASE
        WHEN status = 'processing' THEN lease_expires_at
        ELSE next_attempt_at
      END,
      created_at,
      id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.google_actions_center_outbox AS target
  SET status = 'processing',
      attempts = target.attempts + 1,
      claim_token = gen_random_uuid(),
      lease_expires_at = now() + interval '30 minutes'
  FROM due
  WHERE target.id = due.id
  RETURNING target.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_google_actions_center_outbox(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_actions_center_outbox(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.settle_google_actions_center_outbox_claim(
  p_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_attempts integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  SELECT attempts
  INTO v_attempts
  FROM public.google_actions_center_outbox
  WHERE id = p_id
    AND status = 'processing'
    AND claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  BEGIN
    UPDATE public.google_actions_center_outbox
    SET status = CASE
          WHEN p_success THEN 'sent'
          WHEN COALESCE(v_attempts, 0) >= 6 THEN 'abandoned'
          ELSE 'pending'
        END,
        sent_at = CASE WHEN p_success THEN now() ELSE sent_at END,
        next_attempt_at = CASE
          WHEN p_success THEN next_attempt_at
          ELSE now() + (
            interval '1 minute' * power(3, LEAST(COALESCE(v_attempts, 0), 5))
          )
        END,
        last_error = CASE
          WHEN p_success THEN NULL
          ELSE left(COALESCE(p_error, 'unknown_error'), 1000)
        END,
        claim_token = NULL,
        lease_expires_at = NULL
    WHERE id = p_id
      AND status = 'processing'
      AND claim_token = p_claim_token;

    RETURN FOUND;
  EXCEPTION
    WHEN unique_violation THEN
      -- A fresh availability replacement may have been queued while this row
      -- was in flight. That newer pending snapshot supersedes a failed retry;
      -- abandon this row instead of leaving its lease stuck on a uniqueness
      -- error when it transitions back to pending.
      UPDATE public.google_actions_center_outbox
      SET status = 'abandoned',
          last_error = left(COALESCE(p_error, 'superseded_by_newer_availability'), 1000),
          claim_token = NULL,
          lease_expires_at = NULL
      WHERE id = p_id
        AND status = 'processing'
        AND claim_token = p_claim_token;

      RETURN FOUND;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_google_actions_center_outbox_claim(
  uuid,
  uuid,
  boolean,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.settle_google_actions_center_outbox_claim(
  uuid,
  uuid,
  boolean,
  text
) TO service_role;

COMMENT ON FUNCTION public.claim_google_actions_center_outbox(integer) IS
  'Claims due Google Actions Center outbox rows with a durable, expiring fencing token.';
COMMENT ON FUNCTION public.settle_google_actions_center_outbox_claim(uuid, uuid, boolean, text) IS
  'Settles an outbox row only when the caller still owns its active claim token.';

NOTIFY pgrst, 'reload schema';
