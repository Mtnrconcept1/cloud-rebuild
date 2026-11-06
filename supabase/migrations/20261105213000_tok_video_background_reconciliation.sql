BEGIN;

CREATE INDEX IF NOT EXISTS restaurant_video_generations_reconcile_idx
  ON public.restaurant_video_generations (updated_at, id)
  WHERE provider_request_id IS NOT NULL
    AND status IN ('queued', 'in_progress', 'archiving', 'needs_review');

-- A short lease, with oldest checks first. The timestamp also advances on
-- failed HTTP checks, allowing other restaurants to be processed next time.
CREATE OR REPLACE FUNCTION public.claim_restaurant_video_reconciliation()
RETURNS SETOF public.restaurant_video_generations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    WITH due AS (
      SELECT id FROM public.restaurant_video_generations
      WHERE provider_request_id IS NOT NULL
        AND status IN ('queued', 'in_progress', 'archiving', 'needs_review')
        AND updated_at < clock_timestamp() - interval '180 seconds'
      ORDER BY updated_at, id
      LIMIT 2 FOR UPDATE SKIP LOCKED
    )
    UPDATE public.restaurant_video_generations AS job
    SET updated_at = clock_timestamp()
    FROM due WHERE job.id = due.id
    RETURNING job.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_restaurant_video_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_video_reconciliation() TO service_role;

-- The existing scheduler credential is resolved at execution time only. No
-- credential value is stored in cron.job, and no request is sent without one.
SELECT cron.schedule(
  'tok-video-reconcile',
  '*/2 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/ai-video-studio',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', secret.decrypted_secret
      ),
      body := '{"action":"reconcile"}'::jsonb,
      timeout_milliseconds := 180000
    )
    FROM (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
      ORDER BY updated_at DESC LIMIT 1
    ) AS secret;
  $cron$
);

COMMIT;
