BEGIN;

-- A GitHub workflow run may own at most one approved incident. The production
-- table contains no duplicate non-null run id before this migration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_incidents_github_run_id
  ON public.ops_incidents (github_run_id)
  WHERE github_run_id IS NOT NULL;

-- Once the control plane binds an incident to a workflow run, that binding is
-- immutable. Replaying the same run id is harmless; replacing it with another
-- run id is rejected at the database boundary, including concurrent requests.
CREATE OR REPLACE FUNCTION private.prevent_ops_incident_github_run_rebind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
BEGIN
  IF OLD.github_run_id IS NOT NULL
     AND NEW.github_run_id IS DISTINCT FROM OLD.github_run_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ops_incident_github_run_rebind_forbidden';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.prevent_ops_incident_github_run_rebind()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ops_incidents_prevent_github_run_rebind
  ON public.ops_incidents;

CREATE TRIGGER trg_ops_incidents_prevent_github_run_rebind
  BEFORE UPDATE OF github_run_id ON public.ops_incidents
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_ops_incident_github_run_rebind();

COMMIT;
