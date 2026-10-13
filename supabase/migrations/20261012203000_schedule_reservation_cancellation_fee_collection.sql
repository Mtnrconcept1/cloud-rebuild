-- Schedule only the guarded Stripe cancellation-fee worker.
-- Its live charging feature gate defaults to OFF; creating this cron does
-- not authorize collection. The vault secret never enters a log or response.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_endpoint text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/process-reservation-cancellation-fees';
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE NOTICE 'Missing internal_cron_secret: reservation cancellation fees cron not scheduled.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tok-reservation-cancellation-fees') THEN
    PERFORM cron.unschedule('tok-reservation-cancellation-fees');
  END IF;

  PERFORM cron.schedule('tok-reservation-cancellation-fees', '42 * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', %L
      ),
      body := '{"source":"cron","limit":20}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$, v_endpoint, v_secret));
END;
$$;

COMMIT;
