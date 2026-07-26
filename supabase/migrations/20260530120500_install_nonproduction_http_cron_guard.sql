-- Install the fail-closed classifier before the first HTTP cron migration.
-- Only the audited Production PostgreSQL system identifier may install jobs
-- whose command targets the Production Supabase project.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

SELECT pg_advisory_xact_lock(
  hashtext('tok:cron:production-cluster-guard:v1')
);

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.tok_is_production_cluster()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_system_identifier text;
BEGIN
  BEGIN
    SELECT control.system_identifier::text
    INTO v_system_identifier
    FROM pg_control_system() AS control;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;

  RETURN COALESCE(
    v_system_identifier = '7623125441096521075',
    false
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.tok_is_production_cluster()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.tok_is_production_cluster() IS
  'Fail-closed classifier: true only for audited TOK Production system_identifier 7623125441096521075.';

DO $preflight$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION
      'Production cron guard cannot be installed: cron.job is unavailable';
  END IF;

  IF to_regprocedure(
    'cron.alter_job(bigint,text,text,text,text,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Production cron guard cannot be installed: cron.alter_job is unavailable';
  END IF;

  IF to_regprocedure(
    'private.tok_is_production_cluster()'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Production cron guard cannot be installed: cluster classifier is unavailable';
  END IF;
END;
$preflight$;

-- cron.job cannot be protected with a migration-owned trigger because the
-- migration role does not have TRIGGER on that extension relation. Scheduling
-- is gated at each historical call site; this block repairs existing jobs.
DO $disable_existing$
DECLARE
  v_job record;
  v_detected_count integer := 0;
  v_disabled_count integer := 0;
  v_production_project_ref CONSTANT text := 'wwcrtyoueexyxkkikaos';
BEGIN
  SELECT count(*)
  INTO v_detected_count
  FROM cron.job
  WHERE position(v_production_project_ref IN lower(command)) > 0;

  IF private.tok_is_production_cluster() IS TRUE THEN
    RAISE NOTICE
      'TOK Production cron guard: Production cluster verified; % target(s) left unchanged',
      v_detected_count;
    RETURN;
  END IF;

  FOR v_job IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE active
      AND position(v_production_project_ref IN lower(command)) > 0
    ORDER BY jobid
  LOOP
    PERFORM cron.alter_job(
      job_id := v_job.jobid,
      active := false
    );
    v_disabled_count := v_disabled_count + 1;
  END LOOP;

  RAISE NOTICE
    'TOK non-Production cron guard: % Production target(s) detected, % disabled',
    v_detected_count,
    v_disabled_count;
END;
$disable_existing$;

DO $postflight$
DECLARE
  v_production_project_ref CONSTANT text := 'wwcrtyoueexyxkkikaos';
BEGIN
  IF private.tok_is_production_cluster() IS NOT TRUE
     AND EXISTS (
       SELECT 1
       FROM cron.job
       WHERE active
         AND position(v_production_project_ref IN lower(command)) > 0
     ) THEN
    RAISE EXCEPTION
      'Non-Production cron guard failed: an active job still targets Production';
  END IF;
END;
$postflight$;

COMMIT;
