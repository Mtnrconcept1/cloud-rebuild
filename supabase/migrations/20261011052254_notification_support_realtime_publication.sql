-- Restore existing support/chat Realtime listeners without relaxing their RLS.
-- This only registers already-access-controlled tables for INSERT/UPDATE
-- visibility through Supabase's existing postgres_changes publication.
-- Do not enable REPLICA IDENTITY FULL: old sensitive message bodies must
-- never be broadcast, including during deletes.
DO $migration$
DECLARE
  notification_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Expected Supabase Realtime publication is missing';
  END IF;

  FOREACH notification_table IN ARRAY ARRAY[
    'support_incidents',
    'support_incident_messages',
    'ai_support_tickets',
    'ai_messages'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public'
        AND c.relname = notification_table
        AND c.relkind IN ('r', 'p')
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Support realtime target %.% is missing or has no RLS', 'public', notification_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = notification_table
        AND policy.permissive = 'PERMISSIVE'
        AND policy.cmd IN ('SELECT', 'ALL')
        AND ('authenticated' = ANY(policy.roles) OR 'public' = ANY(policy.roles))
    ) THEN
      RAISE EXCEPTION 'Support realtime target %.% lacks an authenticated SELECT RLS policy', 'public', notification_table;
    END IF;

    IF NOT has_table_privilege('authenticated', format('public.%I', notification_table), 'SELECT') THEN
      RAISE EXCEPTION 'Support realtime target %.% lacks authenticated SELECT privileges', 'public', notification_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = notification_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', notification_table);
    END IF;
  END LOOP;
END
$migration$;
