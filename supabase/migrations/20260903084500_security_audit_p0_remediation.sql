-- P0 audit remediation: keep internal scheduler credentials in Vault at rest.
--
-- The historical jobs interpolated internal_cron_secret into cron.job when the
-- migration ran. Every command below resolves the current Vault value only at
-- execution time and performs no HTTP request when the secret is absent.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $unschedule$
DECLARE
  job_name text;
BEGIN
  FOREACH job_name IN ARRAY ARRAY[
    'tok-stripe-subscription-reconcile',
    'tok-directory-image-enrichment',
    'tok-directory-commercial-name-verification',
    'tok-directory-cuisine-enrichment',
    'tok-directory-cuisine-osm-enrichment',
    'tok-net-http-response-cache-retention'
  ]
  LOOP
    PERFORM cron.unschedule(job_name)
    WHERE EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = job_name
    );
  END LOOP;
END;
$unschedule$;

SELECT cron.schedule(
  'tok-stripe-subscription-reconcile',
  '17 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-subscription-reconcile',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', secret.decrypted_secret
      ),
      body := '{"source":"cron","limit":100}'::jsonb,
      timeout_milliseconds := 60000
    )
    FROM (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_cron_secret'
        AND NULLIF(decrypted_secret, '') IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS secret;
  $cron$
);

SELECT cron.schedule(
  'tok-directory-image-enrichment',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/enrich-directory-images',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', secret.decrypted_secret
      ),
      body := '{"mode":"process_batch","limit":5,"source":"cron"}'::jsonb,
      timeout_milliseconds := 55000
    )
    FROM (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_cron_secret'
        AND NULLIF(decrypted_secret, '') IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS secret;
  $cron$
);

SELECT cron.schedule(
  'tok-directory-commercial-name-verification',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/verify-directory-commercial-names',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', secret.decrypted_secret
      ),
      body := '{"mode":"process_batch","limit":3,"source":"cron"}'::jsonb,
      timeout_milliseconds := 55000
    )
    FROM (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_cron_secret'
        AND NULLIF(decrypted_secret, '') IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS secret;
  $cron$
);

SELECT cron.schedule(
  'tok-directory-cuisine-enrichment',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/enrich-directory-cuisines',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', secret.decrypted_secret
      ),
      body := '{"mode":"process_batch","limit":3,"source":"cron"}'::jsonb,
      timeout_milliseconds := 55000
    )
    FROM (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_cron_secret'
        AND NULLIF(decrypted_secret, '') IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS secret;
  $cron$
);

SELECT cron.schedule(
  'tok-directory-cuisine-osm-enrichment',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/enrich-directory-cuisines-osm',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', secret.decrypted_secret
      ),
      body := '{"mode":"process_batch","limit":24,"source":"cron"}'::jsonb,
      timeout_milliseconds := 55000
    )
    FROM (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_cron_secret'
        AND NULLIF(decrypted_secret, '') IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS secret;
  $cron$
);

-- Delete old mirrored pg_net responses in bounded batches. The source
-- net._http_response table already has its own seven-day retention policy.
SELECT cron.schedule(
  'tok-net-http-response-cache-retention',
  '*/5 * * * *',
  $cron$
    WITH expired AS (
      SELECT id
      FROM public.net_http_response_cache
      WHERE created_at < now() - interval '7 days'
      ORDER BY created_at
      LIMIT 5000
    )
    DELETE FROM public.net_http_response_cache AS target
    USING expired
    WHERE target.id = expired.id;
  $cron$
);

-- Make the directory-cleaning view obey the caller's RLS context instead of
-- running with its owner's privileges.
DO $view_security$
BEGIN
  IF to_regclass('public.restaurants_clean') IS NOT NULL THEN
    ALTER VIEW public.restaurants_clean SET (security_invoker = true);
  END IF;
END;
$view_security$;

-- Production contains an exact duplicate of the launch-scale status index.
-- Keep idx_edge_function_audit_logs_status_created_10k, which is versioned and
-- covered by the launch-readiness tests.
DROP INDEX IF EXISTS public.idx_edge_function_audit_logs_status_created_at;

NOTIFY pgrst, 'reload schema';
