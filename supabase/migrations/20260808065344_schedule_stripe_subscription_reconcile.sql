-- Hourly authoritative repair for lost or permanently failed Stripe webhooks.
-- This worker only retrieves existing subscriptions and updates local status;
-- it cannot create a charge, invoice, Checkout Session or subscription.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent: tok-stripe-subscription-reconcile not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-stripe-subscription-reconcile')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-stripe-subscription-reconcile'
  );

  PERFORM cron.schedule('tok-stripe-subscription-reconcile', '17 * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', %L
      ),
      body := '{"source":"cron","limit":100}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$, v_base || '/stripe-subscription-reconcile', v_secret));
END;
$$;

NOTIFY pgrst, 'reload schema';
