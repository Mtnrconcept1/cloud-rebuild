-- Run standalone balance-debit reconciliation once daily using the existing
-- service-only Stripe worker and the existing secret stored in Supabase Vault.
-- This does not rotate, expose or create any secret.
BEGIN;
DO $job$
DECLARE
  v_url text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-worker';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_cron_secret') THEN
    RAISE NOTICE 'Stripe platform fee reconciliation inactive: internal cron secret absent';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-stripe-platform-balance-fees'
  ) THEN
    PERFORM cron.unschedule('tok-stripe-platform-balance-fees');
  END IF;

  PERFORM cron.schedule(
    'tok-stripe-platform-balance-fees',
    '37 5 * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-cron-secret', (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'internal_cron_secret' LIMIT 1
          )
        ),
        body := jsonb_build_object(
          'action', 'reconcile-platform-fees',
          'source', 'tok-stripe-platform-balance-fees'
        ),
        timeout_milliseconds := 90000
      );
    $cron$, v_url)
  );
END;
$job$;
COMMIT;
