-- Drains the Google Actions Center outbox every two minutes.
--
-- Prerequisite: Vault secret 'internal_cron_secret' must exist, following the
-- pattern used by the other TOK schedulers. Without it the job is not scheduled
-- and the migration says so rather than failing.
--
-- Two minutes is the compromise the integration needs: fast enough that a slot
-- sold through another channel disappears from Google before a second guest
-- books it, slow enough to batch a busy service into few calls.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent: tok-google-actions-center-sync not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-google-actions-center-sync') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-google-actions-center-sync'
  );

  PERFORM cron.schedule('tok-google-actions-center-sync', '*/2 * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', %L
      ),
      body := '{"source":"cron","limit":50}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$, v_base || '/google-actions-center-sync', v_secret));
END;
$$;

NOTIFY pgrst, 'reload schema';
