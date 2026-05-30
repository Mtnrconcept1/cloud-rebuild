-- Planifie l'envoi des emails en file (email_queue + notification_deliveries)
-- en invoquant l'Edge Function send-email chaque minute via pg_net.
-- Prerequis : secret 'internal_cron_secret' present dans Vault (Project Settings > Vault).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent : planification ignoree. Ajoutez-le puis rejouez cette migration.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('send-email-worker') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-email-worker'
  );

  PERFORM cron.schedule('send-email-worker', '* * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-internal-cron-secret', %L),
      body := '{}'::jsonb
    );
  $cron$, v_base || '/send-email', v_secret));
END;
$$;
