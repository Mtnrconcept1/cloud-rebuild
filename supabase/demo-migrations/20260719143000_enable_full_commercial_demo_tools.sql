-- Dedicated project only. Every authenticated identity in this project is
-- created server-side from a verified production commercial/admin account.
-- The helper therefore replaces legacy production isolation policies without
-- making any production table accessible.

CREATE OR REPLACE FUNCTION public.is_dedicated_commercial_demo_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.commercial_demo_accounts account
      WHERE account.user_id = auth.uid()
        AND account.is_active
    );
$function$;

REVOKE ALL ON FUNCTION public.is_dedicated_commercial_demo_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dedicated_commercial_demo_actor()
  TO authenticated, service_role;

DO $do$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS dedicated_commercial_demo_full_access ON %I.%I',
      target.schema_name,
      target.table_name
    );
    EXECUTE format(
      'CREATE POLICY dedicated_commercial_demo_full_access ON %I.%I FOR ALL TO authenticated USING (public.is_dedicated_commercial_demo_actor()) WITH CHECK (public.is_dedicated_commercial_demo_actor())',
      target.schema_name,
      target.table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO authenticated',
      target.schema_name,
      target.table_name
    );
  END LOOP;
END
$do$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DROP POLICY IF EXISTS dedicated_commercial_demo_full_access
  ON storage.objects;
CREATE POLICY dedicated_commercial_demo_full_access
ON storage.objects
FOR ALL
TO authenticated
USING (public.is_dedicated_commercial_demo_actor())
WITH CHECK (public.is_dedicated_commercial_demo_actor());
