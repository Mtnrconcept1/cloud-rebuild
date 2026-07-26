-- Schedule TOK Connect outgoing webhook dispatch through pg_cron + pg_net.
-- Prerequisite: Vault secret 'internal_cron_secret' must exist before this
-- migration is replayed in production.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  IF private.tok_is_production_cluster() IS NOT TRUE THEN
    RAISE NOTICE
      'Production-targeting cron schedule skipped outside the Production cluster';
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent: tok-connect-webhook-dispatcher not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-connect-webhook-dispatcher') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-connect-webhook-dispatcher'
  );

  PERFORM cron.schedule('tok-connect-webhook-dispatcher', '* * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', %L
      ),
      body := '{"source":"cron","limit":50}'::jsonb
    );
  $cron$, v_base || '/tok-connect-webhook-dispatch', v_secret));
END;
$$;

NOTIFY pgrst, 'reload schema';
