-- Weekly refresh of the Aligro catalogue through pg_cron + pg_net.
-- Prerequisite: Vault secret 'internal_cron_secret' must exist before this
-- migration is replayed in production, following the pattern already used by
-- the other TOK schedulers.
--
-- Monday 03:15 UTC: outside service hours, and early enough in the week that a
-- failed run can be noticed and replayed before the next daily dish generation
-- relies on stale prices.

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
    RAISE NOTICE 'Vault secret internal_cron_secret absent: tok-aligro-catalog-sync not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-aligro-catalog-sync') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-aligro-catalog-sync'
  );

  PERFORM cron.schedule('tok-aligro-catalog-sync', '15 3 * * 1', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', %L
      ),
      body := '{"source":"cron"}'::jsonb,
      timeout_milliseconds := 300000
    );
  $cron$, v_base || '/aligro-catalog-sync', v_secret));
END;
$$;

NOTIFY pgrst, 'reload schema';
