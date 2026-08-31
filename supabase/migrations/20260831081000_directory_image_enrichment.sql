-- Durable, resumable image enrichment for public unclaimed restaurant listings.
-- The queue is service-only. It never makes a directory listing transactional.

CREATE TABLE IF NOT EXISTS public.restaurant_directory_image_jobs (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'not_found', 'error')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  source_page_url text,
  source_image_url text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_directory_image_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_directory_image_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.restaurant_directory_image_jobs TO service_role;

CREATE INDEX IF NOT EXISTS restaurant_directory_image_jobs_due_idx
  ON public.restaurant_directory_image_jobs(status, next_attempt_at, attempts, created_at)
  WHERE status IN ('pending', 'processing', 'not_found', 'error');

INSERT INTO public.restaurant_directory_image_jobs (restaurant_id, status)
SELECT r.id, 'pending'
FROM public.restaurants r
WHERE r.is_directory_listing IS TRUE
  AND NULLIF(btrim(COALESCE(r.image_url, '')), '') IS NULL
ON CONFLICT (restaurant_id) DO NOTHING;

UPDATE public.restaurant_directory_image_jobs j
SET status = 'success',
    next_attempt_at = NULL,
    locked_at = NULL,
    last_error = NULL,
    updated_at = now()
FROM public.restaurants r
WHERE r.id = j.restaurant_id
  AND NULLIF(btrim(COALESCE(r.image_url, '')), '') IS NOT NULL
  AND j.status <> 'success';

CREATE OR REPLACE FUNCTION public.service_claim_directory_image_jobs(p_limit integer DEFAULT 5)
RETURNS TABLE(restaurant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 10);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.restaurant_id
    FROM public.restaurant_directory_image_jobs j
    JOIN public.restaurants r ON r.id = j.restaurant_id
    WHERE r.is_directory_listing IS TRUE
      AND NULLIF(btrim(COALESCE(r.image_url, '')), '') IS NULL
      AND j.attempts < 3
      AND (
        j.status IN ('pending', 'not_found', 'error')
        OR (j.status = 'processing' AND j.locked_at < now() - interval '15 minutes')
      )
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
    ORDER BY COALESCE(j.next_attempt_at, j.created_at), j.attempts, j.restaurant_id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.restaurant_directory_image_jobs j
  SET status = 'processing',
      attempts = j.attempts + 1,
      last_attempt_at = now(),
      locked_at = now(),
      next_attempt_at = NULL,
      last_error = NULL,
      updated_at = now()
  FROM candidates c
  WHERE j.restaurant_id = c.restaurant_id
  RETURNING j.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_claim_directory_image_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_directory_image_jobs(integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $schedule$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent: tok-directory-image-enrichment not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-directory-image-enrichment')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tok-directory-image-enrichment');

  PERFORM cron.schedule('tok-directory-image-enrichment', '* * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', %L
      ),
      body := '{"mode":"process_batch","limit":5,"source":"cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$, v_base || '/enrich-directory-images', v_secret));
END;
$schedule$;

NOTIFY pgrst, 'reload schema';
