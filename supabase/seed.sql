-- Supabase runs this file after migrations when it creates a preview branch.
-- Production deployments use `supabase db push` and do not execute seed.sql.
--
-- Preview and local databases must never invoke an Edge Function on the
-- production project. Existing production-targeting jobs are disabled below.
-- A repository guard test rejects new migrations that add another such job.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

SELECT pg_advisory_xact_lock(
  hashtext('tok:preview-cron-production-target-guard:v1')
);

DO $preflight$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION
      'Preview cron guard cannot be installed: cron.job is unavailable';
  END IF;

  IF to_regprocedure(
    'cron.alter_job(bigint,text,text,text,text,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Preview cron guard cannot be installed: cron.alter_job is unavailable';
  END IF;
END;
$preflight$;

DO $disable_existing$
DECLARE
  v_job record;
  v_detected_count integer := 0;
  v_disabled_count integer := 0;
  v_production_host CONSTANT text :=
    'wwcrtyoueexyxkkikaos.supabase.co';
BEGIN
  SELECT count(*)
  INTO v_detected_count
  FROM cron.job
  WHERE position(v_production_host IN lower(command)) > 0;

  FOR v_job IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE active
      AND position(v_production_host IN lower(command)) > 0
    ORDER BY jobid
  LOOP
    PERFORM cron.alter_job(
      job_id := v_job.jobid,
      active := false
    );
    v_disabled_count := v_disabled_count + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE active
      AND position(v_production_host IN lower(command)) > 0
  ) THEN
    RAISE EXCEPTION
      'Preview cron guard failed: an active job still targets Production';
  END IF;

  RAISE NOTICE
    'TOK preview cron guard: % production target(s) detected, % disabled',
    v_detected_count,
    v_disabled_count;
END;
$disable_existing$;

COMMIT;
