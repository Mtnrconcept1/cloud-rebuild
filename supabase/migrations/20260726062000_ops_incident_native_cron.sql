-- Make Edge Function incident detection independent from GitHub Actions schedules.
-- The cron request is authenticated with the existing Vault-backed internal
-- scheduler secret. The wrapper then calls ops-incident-control with the
-- dedicated OPS_CONTROL_SECRET kept exclusively in the Edge runtime.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_base_url constant text :=
    'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'pg_cron is unavailable';
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Supabase Vault is unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'internal_cron_secret'
      AND NULLIF(decrypted_secret, '') IS NOT NULL
      AND length(decrypted_secret) >= 16
  ) THEN
    RAISE EXCEPTION 'internal_cron_secret is not configured';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'tok-ops-incident-native-scan';

  PERFORM cron.schedule(
    'tok-ops-incident-native-scan',
    '*/5 * * * *',
    format($job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-cron-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'internal_cron_secret'
              AND NULLIF(decrypted_secret, '') IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT 1
          )
        ),
        body := '{}'::jsonb
      );
    $job$, v_base_url || '/ops-incident-native-scan')
  );
END;
$$;

COMMENT ON EXTENSION pg_cron IS
  'Schedules internal TOK workers, including the five-minute native incident scan.';
