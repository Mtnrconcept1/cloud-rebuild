-- Rate-limit buckets for edge functions (AI cost control, scraping, etc.)
-- Backed by a single Postgres table + a SECURITY DEFINER RPC that performs
-- an atomic fixed-window counter update. Callers pass (function_name, subject)
-- + the window size; the RPC returns true if the call is allowed, false if
-- the bucket is exhausted.
--
-- Buckets are pruned opportunistically by the RPC itself (old rows for the
-- same key are reset when the window has elapsed). A scheduled cleanup job
-- can also delete rows where last_reset < now() - 7 days.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  function_name text NOT NULL,
  subject       text NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now(),
  last_hit_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (function_name, subject)
);

COMMENT ON TABLE public.rate_limit_buckets IS
  'Fixed-window rate-limit counters for edge functions. Managed exclusively by rate_limit_consume().';

CREATE INDEX IF NOT EXISTS rate_limit_buckets_last_hit_at_idx
  ON public.rate_limit_buckets (last_hit_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Strict lockdown: only the service role can read/write this table. Edge
-- functions call the SECURITY DEFINER RPC below, which bypasses RLS safely.
DROP POLICY IF EXISTS "deny all rate_limit_buckets" ON public.rate_limit_buckets;
CREATE POLICY "deny all rate_limit_buckets"
  ON public.rate_limit_buckets
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;

-- Atomic consume: upsert the bucket, reset if the window has elapsed,
-- increment the counter and return the boolean verdict in a single round-trip.
CREATE OR REPLACE FUNCTION public.rate_limit_consume(
  p_function_name text,
  p_subject       text,
  p_max_requests  integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current   integer;
  v_window    timestamptz;
  v_now       timestamptz := now();
  v_threshold timestamptz;
BEGIN
  IF p_function_name IS NULL OR p_subject IS NULL THEN
    RAISE EXCEPTION 'rate_limit_consume: function_name and subject must be non-null';
  END IF;
  IF p_max_requests <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'rate_limit_consume: max_requests and window_seconds must be positive';
  END IF;

  v_threshold := v_now - make_interval(secs => p_window_seconds);

  INSERT INTO public.rate_limit_buckets (function_name, subject, request_count, window_start, last_hit_at)
  VALUES (p_function_name, p_subject, 1, v_now, v_now)
  ON CONFLICT (function_name, subject) DO UPDATE
  SET request_count = CASE
        WHEN public.rate_limit_buckets.window_start < v_threshold THEN 1
        ELSE public.rate_limit_buckets.request_count + 1
      END,
      window_start = CASE
        WHEN public.rate_limit_buckets.window_start < v_threshold THEN v_now
        ELSE public.rate_limit_buckets.window_start
      END,
      last_hit_at = v_now
  RETURNING request_count INTO v_current;

  RETURN v_current <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_consume(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_consume(text, text, integer, integer) TO service_role;

COMMIT;
