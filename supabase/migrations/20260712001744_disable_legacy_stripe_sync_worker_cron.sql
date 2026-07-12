-- stripe-worker is a raw Stripe webhook compatibility proxy. The historical
-- minute cron calls it without a Stripe signature, so every invocation is
-- correctly rejected and creates audit noise. Real Stripe delivery is push-
-- based and must never be simulated by pg_cron.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'stripe-sync-worker'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$$;
