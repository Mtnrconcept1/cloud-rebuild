-- Run after migrations on a disposable local database, as postgres:
-- psql -X -v ON_ERROR_STOP=1 -f supabase/tests/generated_print_format_smoke.sql
-- Exercises the actual trigger function under actual database roles, isolated
-- from unrelated asset foreign keys/RLS. Also verifies its production binding.
-- No persistent data, grants or policies are changed; everything rolls back.
BEGIN;

DO $binding$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.ai_generated_assets'::regclass
      AND tgname = 'protect_generated_print_format'
      AND tgfoid = 'public.protect_generated_print_format()'::regprocedure
      AND tgenabled = 'O' AND tgtype = 23 -- ROW + BEFORE + INSERT + UPDATE
  ) THEN
    RAISE EXCEPTION 'Print format protection trigger is missing or disabled';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.protect_generated_print_format()'::regprocedure) THEN
    RAISE EXCEPTION 'Print format guard must run with invoker permissions';
  END IF;
END;
$binding$;

CREATE TEMP TABLE print_format_guard_fixture (id integer PRIMARY KEY, metadata jsonb NOT NULL DEFAULT '{}');
CREATE TRIGGER print_format_guard_fixture
BEFORE INSERT OR UPDATE ON print_format_guard_fixture
FOR EACH ROW EXECUTE FUNCTION public.protect_generated_print_format();
GRANT SELECT, INSERT, UPDATE ON print_format_guard_fixture TO service_role, authenticated, anon;

SET LOCAL ROLE service_role;
INSERT INTO print_format_guard_fixture VALUES
  (1, '{"marketing_output_target":{"destination":"print","widthMm":210}}');
UPDATE print_format_guard_fixture
SET metadata = '{"marketing_output_target":{"destination":"print","widthMm":148}}' WHERE id = 1;
RESET ROLE;

SET LOCAL ROLE authenticated;
-- A forged JWT role must not bypass the database-role check.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO print_format_guard_fixture VALUES (2, '{"other":"ordinary client metadata"}');
UPDATE print_format_guard_fixture SET metadata = metadata || '{"other":"edited"}' WHERE id = 1;

DO $client$
DECLARE
  v_payload jsonb;
BEGIN
  FOREACH v_payload IN ARRAY ARRAY[
    '{"marketing_output_target":{"destination":"print"}}'::jsonb,
    '{"marketing_output_target":{"destination":"digital"}}'::jsonb,
    '{"marketing_output_target":null}'::jsonb
  ] LOOP
    BEGIN
      INSERT INTO print_format_guard_fixture VALUES (3, v_payload);
      RAISE EXCEPTION 'Client print contract insertion was accepted';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'PRINT_GENERATION_FORMAT_SERVER_ONLY' THEN RAISE; END IF;
    END;
  END LOOP;

  FOREACH v_payload IN ARRAY ARRAY[
    '{}'::jsonb,
    '{"marketing_output_target":null}'::jsonb,
    '{"marketing_output_target":{"destination":"print","widthMm":297}}'::jsonb
  ] LOOP
    BEGIN
      UPDATE print_format_guard_fixture SET metadata = v_payload WHERE id = 1;
      RAISE EXCEPTION 'Client print contract replacement/removal was accepted';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'PRINT_GENERATION_FORMAT_SERVER_ONLY' THEN RAISE; END IF;
    END;
  END LOOP;

  BEGIN
    UPDATE print_format_guard_fixture
    SET metadata = '{"marketing_output_target":{"destination":"print"}}' WHERE id = 2;
    RAISE EXCEPTION 'Client print contract addition was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'PRINT_GENERATION_FORMAT_SERVER_ONLY' THEN RAISE; END IF;
  END;
END;
$client$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $anonymous$
BEGIN
  BEGIN
    INSERT INTO print_format_guard_fixture VALUES (4, '{"marketing_output_target":{"destination":"print"}}');
    RAISE EXCEPTION 'Anonymous print contract insertion was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'PRINT_GENERATION_FORMAT_SERVER_ONLY' THEN RAISE; END IF;
  END;
END;
$anonymous$;
RESET ROLE;

DO $results$
BEGIN
  IF (SELECT metadata -> 'marketing_output_target' ->> 'widthMm' FROM print_format_guard_fixture WHERE id = 1) <> '148'
    OR (SELECT metadata ->> 'other' FROM print_format_guard_fixture WHERE id = 1) <> 'edited'
    OR (SELECT count(*) FROM print_format_guard_fixture) <> 2 THEN
    RAISE EXCEPTION 'Server contract or unrelated client metadata was not preserved';
  END IF;
END;
$results$;

ROLLBACK;
