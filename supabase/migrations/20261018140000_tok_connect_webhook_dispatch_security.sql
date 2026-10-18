BEGIN;

ALTER TABLE public.tok_connect_webhook_deliveries
  ADD COLUMN IF NOT EXISTS dispatch_lease_token uuid,
  ADD COLUMN IF NOT EXISTS dispatch_lease_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tok_connect_webhook_dispatch_due
  ON public.tok_connect_webhook_deliveries (next_retry_at, created_at, id)
  WHERE status = 'pending';

-- Attempts are consumed before network I/O. An expired lease can be reclaimed;
-- HTTP delivery is at-least-once and recipients deduplicate X-TOK-Delivery.
CREATE OR REPLACE FUNCTION public.claim_tok_connect_webhook_deliveries(p_limit integer DEFAULT 5)
RETURNS SETOF public.tok_connect_webhook_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 5));
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- A crash during the final attempt must not leave a pending row forever.
  WITH exhausted AS (
    SELECT d.id
    FROM public.tok_connect_webhook_deliveries d
    WHERE d.status = 'pending' AND d.attempts >= 5
      AND (d.dispatch_lease_expires_at IS NULL OR d.dispatch_lease_expires_at <= v_now)
    ORDER BY d.created_at, d.id
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tok_connect_webhook_deliveries d
  SET status = 'failed', next_retry_at = NULL,
      error_message = 'webhook_attempts_exhausted',
      dispatch_lease_token = NULL, dispatch_lease_expires_at = NULL
  FROM exhausted e WHERE d.id = e.id;

  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM public.tok_connect_webhook_deliveries d
    WHERE d.status = 'pending' AND d.attempts < 5
      AND (d.next_retry_at IS NULL OR d.next_retry_at <= v_now)
      AND (d.dispatch_lease_expires_at IS NULL OR d.dispatch_lease_expires_at <= v_now)
    ORDER BY d.next_retry_at NULLS FIRST, d.created_at, d.id
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tok_connect_webhook_deliveries d
  SET attempts = d.attempts + 1, last_attempted_at = v_now,
      dispatch_lease_token = gen_random_uuid(),
      dispatch_lease_expires_at = v_now + interval '60 seconds'
  FROM candidates c WHERE d.id = c.id
  RETURNING d.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_tok_connect_webhook_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_response_status integer DEFAULT NULL,
  p_response_body text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_signature text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('delivered', 'retry', 'failed')
    OR (p_response_status IS NOT NULL AND p_response_status NOT BETWEEN 100 AND 599)
    OR (p_outcome = 'delivered' AND (p_response_status IS NULL OR p_response_status NOT BETWEEN 200 AND 299))
    OR (p_outcome <> 'delivered' AND p_response_status BETWEEN 200 AND 299) THEN
    RAISE EXCEPTION 'invalid_webhook_completion' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tok_connect_webhook_deliveries d
  SET status = CASE
        WHEN p_outcome = 'delivered' THEN 'delivered'
        WHEN p_outcome = 'retry' AND d.attempts < 5 THEN 'pending'
        ELSE 'failed' END,
      delivered_at = CASE WHEN p_outcome = 'delivered' THEN v_now ELSE d.delivered_at END,
      next_retry_at = CASE
        WHEN p_outcome = 'retry' AND d.attempts < 5
          THEN v_now + make_interval(secs => least(3600, 60 * power(2, greatest(d.attempts - 1, 0)))::double precision)
        ELSE NULL END,
      response_status = p_response_status,
      response_body = left(p_response_body, 2000),
      error_message = CASE WHEN p_outcome = 'delivered' THEN NULL ELSE left(p_error_message, 160) END,
      signature = p_signature,
      dispatch_lease_token = NULL,
      dispatch_lease_expires_at = NULL
  WHERE d.id = p_delivery_id AND d.status = 'pending'
    AND d.dispatch_lease_token = p_lease_token
    AND d.dispatch_lease_expires_at > v_now
  RETURNING d.status INTO v_status;

  -- NULL means cancelled, already completed, expired, or claimed by another
  -- worker. A stale worker must never overwrite the newer state.
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tok_connect_webhook_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_tok_connect_webhook_delivery(uuid, uuid, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tok_connect_webhook_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_tok_connect_webhook_delivery(uuid, uuid, text, integer, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
