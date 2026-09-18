BEGIN;

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'tok-thefork-official-site-discovery'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'tok-thefork-official-site-discovery',
    '0 */6 * * *',
    'SELECT public.invoke_thefork_official_site_discovery_worker(1);'
  );
END;
$do$;

-- Re-open only the very recent rows that may have been classified as exhausted
-- while Firecrawl was returning 402/429 during this deployment session.
UPDATE public.restaurant_directory_image_jobs
SET
  last_error = 'thefork_site_discovery:retry',
  next_attempt_at = now() + interval '6 hours',
  locked_at = NULL,
  status = 'not_found',
  updated_at = now()
WHERE last_error = 'thefork_recovery:permanent:site_discovery_exhausted'
  AND last_attempt_at >= now() - interval '20 minutes'
  AND EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    JOIN public.marketing_contacts AS contact
      ON contact.source_objectid::text = restaurant.directory_source_reference
     AND contact.branch = 'Restaurant référencé sur TheFork'
    WHERE restaurant.id = restaurant_directory_image_jobs.restaurant_id
  );

COMMIT;
