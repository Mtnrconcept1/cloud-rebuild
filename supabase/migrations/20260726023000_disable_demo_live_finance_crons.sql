-- Dedicated commercial demo must never execute production Stripe reconciliation.
-- This is a strict no-op on production, where cron commands target the production project.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(
  hashtext('tok:commercial-demo:disable-live-finance-crons:v1')
);

CREATE TEMP TABLE tok_demo_finance_crons_prechange
ON COMMIT DROP
AS
SELECT
  j.jobid,
  j.jobname,
  j.active,
  to_jsonb(j) - 'active' AS immutable_state
FROM cron.job AS j
WHERE j.jobname = ANY (ARRAY[
  'tok-reconcile-paid-order-checkouts',
  'tok-reconcile-match-group-authorizations',
  'tok-capture-due-match-groups',
  'restaurant-subscription-activation-worker'
]::text[]);

DO $preflight$
DECLARE
  v_demo_count integer;
BEGIN
  IF to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: cron.alter_job is unavailable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tok_demo_finance_crons_prechange
    GROUP BY jobname
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Preflight failed: duplicate finance cron names detected';
  END IF;

  SELECT count(*)
  INTO v_demo_count
  FROM cron.job AS j
  WHERE j.jobname = ANY (ARRAY[
      'tok-reconcile-paid-order-checkouts',
      'tok-reconcile-match-group-authorizations',
      'tok-capture-due-match-groups',
      'restaurant-subscription-activation-worker'
    ]::text[])
    AND j.command LIKE '%https://hzldfhjfgjcadmpghhhf.supabase.co/functions/v1/%';

  -- Zero means this is production or a database without the dedicated demo jobs.
  -- A partial demo set is drift and must be investigated rather than silently changed.
  IF v_demo_count NOT IN (0, 4) THEN
    RAISE EXCEPTION
      'Preflight failed: expected zero or four dedicated demo finance crons, found %',
      v_demo_count;
  END IF;

  IF v_demo_count = 4 AND EXISTS (
    SELECT 1
    FROM cron.job AS j
    WHERE j.command LIKE '%https://hzldfhjfgjcadmpghhhf.supabase.co/functions/v1/%'
      AND j.jobname = ANY (ARRAY[
        'tok-reconcile-paid-order-checkouts',
        'tok-reconcile-match-group-authorizations',
        'tok-capture-due-match-groups',
        'restaurant-subscription-activation-worker'
      ]::text[])
      AND NOT CASE j.jobname
        WHEN 'tok-reconcile-paid-order-checkouts'
          THEN j.command LIKE '%/functions/v1/reconcile-paid-order-checkouts%'
        WHEN 'tok-reconcile-match-group-authorizations'
          THEN j.command LIKE '%/functions/v1/reconcile-match-group-authorizations%'
        WHEN 'tok-capture-due-match-groups'
          THEN j.command LIKE '%/functions/v1/capture-due-match-groups%'
        WHEN 'restaurant-subscription-activation-worker'
          THEN j.command LIKE '%/functions/v1/stripe-worker%'
            AND j.command LIKE '%process-subscription-activations%'
        ELSE false
      END
  ) THEN
    RAISE EXCEPTION 'Preflight failed: a dedicated demo finance cron command changed';
  END IF;
END;
$preflight$;

DO $disable$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT j.jobid
    FROM cron.job AS j
    WHERE j.active
      AND j.jobname = ANY (ARRAY[
        'tok-reconcile-paid-order-checkouts',
        'tok-reconcile-match-group-authorizations',
        'tok-capture-due-match-groups',
        'restaurant-subscription-activation-worker'
      ]::text[])
      AND j.command LIKE '%https://hzldfhjfgjcadmpghhhf.supabase.co/functions/v1/%'
  LOOP
    PERFORM cron.alter_job(job_id := v_job.jobid, active := false);
  END LOOP;
END;
$disable$;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job AS j
    WHERE j.active
      AND j.jobname = ANY (ARRAY[
        'tok-reconcile-paid-order-checkouts',
        'tok-reconcile-match-group-authorizations',
        'tok-capture-due-match-groups',
        'restaurant-subscription-activation-worker'
      ]::text[])
      AND j.command LIKE '%https://hzldfhjfgjcadmpghhhf.supabase.co/functions/v1/%'
  ) THEN
    RAISE EXCEPTION 'Postflight failed: a dedicated demo live-finance cron remains active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tok_demo_finance_crons_prechange AS before
    FULL JOIN (
      SELECT j.*
      FROM cron.job AS j
      WHERE j.jobname = ANY (ARRAY[
        'tok-reconcile-paid-order-checkouts',
        'tok-reconcile-match-group-authorizations',
        'tok-capture-due-match-groups',
        'restaurant-subscription-activation-worker'
      ]::text[])
    ) AS after
      ON after.jobid = before.jobid
    WHERE before.jobid IS NULL
       OR after.jobid IS NULL
       OR after.jobname <> before.jobname
       OR (to_jsonb(after) - 'active') IS DISTINCT FROM before.immutable_state
       OR (
         after.command NOT LIKE '%https://hzldfhjfgjcadmpghhhf.supabase.co/functions/v1/%'
         AND after.active IS DISTINCT FROM before.active
       )
       OR (
         after.command LIKE '%https://hzldfhjfgjcadmpghhhf.supabase.co/functions/v1/%'
         AND after.active IS DISTINCT FROM false
       )
  ) THEN
    RAISE EXCEPTION 'Postflight failed: cron identity, schedule, command or non-demo state changed';
  END IF;
END;
$postflight$;

COMMIT;

-- Deliberately do not install live Stripe credentials in the demo project.
-- Re-enable only after a reviewed, test-mode-only worker path exists.
