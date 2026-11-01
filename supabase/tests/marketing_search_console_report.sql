-- Disposable database only, after the migration.
BEGIN;
DO $test$
DECLARE role_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.marketing_search_console_report'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'RLS required';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'public.marketing_search_console_report','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Unexpected writer %',role_name; END IF;
  END LOOP;
  IF has_table_privilege('anon','public.marketing_search_console_report','SELECT') OR has_table_privilege('authenticated','public.marketing_search_console_report','SELECT') THEN RAISE EXCEPTION 'Private search report exposed'; END IF;
  IF NOT has_table_privilege('service_role','public.marketing_search_console_report','SELECT') THEN RAISE EXCEPTION 'Server cannot read'; END IF;
END $test$;
ROLLBACK;
