-- Admin domain and Supabase advisor hardening.

CREATE OR REPLACE FUNCTION public.admin_normalize_cuisine_slug(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(both '-' FROM regexp_replace(lower(trim(COALESCE(p_name, ''))), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.admin_normalize_cuisine_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_normalize_cuisine_slug(text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_normalize_cuisine_slug(text) FROM authenticated;

DO $$
DECLARE
  fn text;
  r record;
  sensitive_admin_rpc_names text[] := ARRAY[
    'admin_archive_chef_table_drop',
    'admin_archive_cuisine',
    'admin_get_actualites_sponsored_posts',
    'admin_log_admin_action',
    'admin_review_social_post_promotion',
    'admin_save_chef_table_drop',
    'admin_update_launch_pack_fulfillment',
    'admin_update_launch_pack_status',
    'admin_update_restaurant_disabled_features',
    'admin_upsert_cuisine'
  ];
BEGIN
  FOREACH fn IN ARRAY sensitive_admin_rpc_names LOOP
    FOR r IN
      SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fn
        AND p.prosecdef
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    END LOOP;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.admin_marketplace_alerts') IS NOT NULL THEN
    EXECUTE $ddl$ALTER TABLE public.admin_marketplace_alerts ENABLE ROW LEVEL SECURITY$ddl$;
    EXECUTE $ddl$REVOKE ALL ON public.admin_marketplace_alerts FROM PUBLIC, anon$ddl$;
    EXECUTE $ddl$REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_marketplace_alerts FROM authenticated$ddl$;
    EXECUTE $ddl$GRANT SELECT, INSERT, UPDATE ON public.admin_marketplace_alerts TO authenticated$ddl$;
    EXECUTE $ddl$GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_marketplace_alerts TO service_role$ddl$;

    EXECUTE $ddl$DROP POLICY IF EXISTS "admin_marketplace_alerts_admin_select" ON public.admin_marketplace_alerts$ddl$;
    EXECUTE $ddl$CREATE POLICY "admin_marketplace_alerts_admin_select"
      ON public.admin_marketplace_alerts
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))$ddl$;

    EXECUTE $ddl$DROP POLICY IF EXISTS "admin_marketplace_alerts_admin_insert" ON public.admin_marketplace_alerts$ddl$;
    EXECUTE $ddl$CREATE POLICY "admin_marketplace_alerts_admin_insert"
      ON public.admin_marketplace_alerts
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'))$ddl$;

    EXECUTE $ddl$DROP POLICY IF EXISTS "admin_marketplace_alerts_admin_update" ON public.admin_marketplace_alerts$ddl$;
    EXECUTE $ddl$CREATE POLICY "admin_marketplace_alerts_admin_update"
      ON public.admin_marketplace_alerts
      FOR UPDATE
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'))$ddl$;
  END IF;

  IF to_regclass('public.admin_marketplace_alert_events') IS NOT NULL THEN
    EXECUTE $ddl$ALTER TABLE public.admin_marketplace_alert_events ENABLE ROW LEVEL SECURITY$ddl$;
    EXECUTE $ddl$REVOKE ALL ON public.admin_marketplace_alert_events FROM PUBLIC, anon$ddl$;
    EXECUTE $ddl$REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_marketplace_alert_events FROM authenticated$ddl$;
    EXECUTE $ddl$GRANT SELECT, INSERT ON public.admin_marketplace_alert_events TO authenticated$ddl$;
    EXECUTE $ddl$GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_marketplace_alert_events TO service_role$ddl$;
    EXECUTE $ddl$CREATE INDEX IF NOT EXISTS admin_marketplace_alert_events_alert_id_idx
      ON public.admin_marketplace_alert_events (alert_id)$ddl$;

    EXECUTE $ddl$DROP POLICY IF EXISTS "admin_marketplace_alert_events_admin_select" ON public.admin_marketplace_alert_events$ddl$;
    EXECUTE $ddl$CREATE POLICY "admin_marketplace_alert_events_admin_select"
      ON public.admin_marketplace_alert_events
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))$ddl$;

    EXECUTE $ddl$DROP POLICY IF EXISTS "admin_marketplace_alert_events_admin_insert" ON public.admin_marketplace_alert_events$ddl$;
    EXECUTE $ddl$CREATE POLICY "admin_marketplace_alert_events_admin_insert"
      ON public.admin_marketplace_alert_events
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'))$ddl$;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
