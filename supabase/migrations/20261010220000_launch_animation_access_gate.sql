-- Launch access is controlled only by the existing admin-owned coming-soon flag.
-- Countdown expiry NEVER authorizes client access. Existing ownership policies
-- remain in force: the additional policies below are RESTRICTIVE, not grants.
BEGIN;
INSERT INTO public.feature_flags(name,label,description,is_active)
VALUES ('coming-soon','Animation de lancement · verrou client','Seule la désactivation admin ouvre les accès clients.',false)
ON CONFLICT(name) DO NOTHING;

CREATE TABLE public.launch_gate_clock (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  ends_at timestamptz
);
ALTER TABLE public.launch_gate_clock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_gate_clock FROM anon, authenticated;
INSERT INTO public.launch_gate_clock(singleton,ends_at)
SELECT true, CASE WHEN is_active THEN clock_timestamp()+interval '480 hours' END
FROM public.feature_flags WHERE name='coming-soon';

CREATE FUNCTION public.sync_launch_gate_clock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.name='coming-soon' AND NEW.is_active
     AND (TG_OP='INSERT' OR OLD.is_active IS DISTINCT FROM true) THEN
    INSERT INTO public.launch_gate_clock(singleton,ends_at)
    VALUES(true,clock_timestamp()+interval '480 hours')
    ON CONFLICT(singleton) DO UPDATE SET ends_at=EXCLUDED.ends_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_launch_gate_clock() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_launch_gate_clock AFTER INSERT OR UPDATE OF is_active
ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.sync_launch_gate_clock();

CREATE FUNCTION public.launch_gate_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT is_active FROM public.feature_flags WHERE name='coming-soon'),true)
$$;
CREATE FUNCTION public.get_launch_gate_state() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('enabled',public.launch_gate_enabled(),
    'ends_at',(SELECT ends_at FROM public.launch_gate_clock WHERE singleton),
    'server_now',clock_timestamp())
$$;

-- An allowlist rather than a list of client routes: new business resources stay
-- closed by default during launch. Existing RLS still verifies row ownership.
CREATE FUNCTION public.launch_table_allowed(p_table text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT public.launch_gate_enabled()
    OR coalesce(auth.role()='service_role',false)
    OR public.has_role(auth.uid(),'admin')
    OR p_table=ANY(ARRAY['feature_flags','profiles','user_profiles','user_roles',
      'signup_applications','signup_application_drafts','signup_application_documents',
      'restaurant_subscription_plans','legal_acceptances','user_legal_acceptances',
      'platform_settings','cities','cuisines'])
    OR ((public.has_role(auth.uid(),'restaurateur')) AND p_table=ANY(ARRAY[
      'restaurants','restaurant_branches','restaurant_cuisines','menu_items',
      'restaurant_media','meal_formula_categories','meal_formulas','anti_waste_offers',
      'flash_sales','floor_plan_variants','reservation_slots','reservation_tables',
      'reservation_table_layout_overrides','reservation_progressive_offers',
      'restaurant_preferred_tables','restaurant_promotions','restaurant_invoice_settings',
      'restaurant_ai_subscriptions','restaurant_subscriptions','restaurant_ai_profiles',
      'restaurant_social_links','restaurant_billing_accounts','restaurant_billing_ledger',
      'notifications','support_incidents','support_messages']))
    OR public.has_role(auth.uid(),'courier')
    OR public.has_role(auth.uid(),'commercial')
$$;

CREATE FUNCTION public.launch_rpc_allowed(p_rpc text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT public.launch_gate_enabled() OR coalesce(auth.role()='service_role',false)
    OR public.has_role(auth.uid(),'admin')
    OR p_rpc=ANY(ARRAY['get_launch_gate_state','has_role','is_feature_flag_active',
      'sync_signup_application','get_my_signup_application'])
    OR (public.has_role(auth.uid(),'restaurateur') AND p_rpc=ANY(ARRAY[
      'restaurant_set_cuisines','get_my_restaurant_ai_subscriptions',
      'get_my_restaurant_billing_account','get_restaurant_billing_summary']))
    OR public.has_role(auth.uid(),'courier') OR public.has_role(auth.uid(),'commercial')
$$;

CREATE FUNCTION public.enforce_launch_gate() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_path text := current_setting('request.path',true);
  v_resource text;
BEGIN
  IF coalesce(auth.role(),'') NOT IN ('anon','authenticated') THEN RETURN; END IF;
  IF NOT public.launch_gate_enabled() OR public.has_role(auth.uid(),'admin') THEN RETURN; END IF;
  v_path := regexp_replace(coalesce(v_path,''),'^/rest/v1','');
  IF v_path LIKE '/rpc/%' THEN
    v_resource := split_part(v_path,'/',3);
    IF public.launch_rpc_allowed(v_resource) THEN RETURN; END IF;
  ELSE
    v_resource := split_part(v_path,'/',2);
    IF public.launch_table_allowed(v_resource) THEN RETURN; END IF;
  END IF;
  RAISE SQLSTATE 'PT403' USING MESSAGE='TOK_LAUNCH_CLOSED',
    DETAIL='L’application client attend l’ouverture par l’équipe TOK.';
END $$;

-- Cover direct reads, writes and Realtime under user JWTs, including embedded
-- relations. Service-role webhooks and already accepted payment reconciliation
-- retain their existing privileges. No policy is removed or broadened.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND c.relname<>'launch_gate_clock'
  LOOP
    EXECUTE format('CREATE POLICY launch_access_guard ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING ((SELECT public.launch_table_allowed(%L))) WITH CHECK ((SELECT public.launch_table_allowed(%L)))',t.relname,t.relname,t.relname);
  END LOOP;
END $$;

-- Storage public asset URLs remain public by design. Private user objects and
-- writes are gated in addition to their existing folder/ownership policies.
CREATE POLICY launch_access_guard ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (NOT (SELECT public.launch_gate_enabled())
  OR (SELECT public.has_role(auth.uid(),'admin'))
  OR bucket_id='verification-documents'
  OR ((SELECT public.has_role(auth.uid(),'restaurateur')) AND bucket_id IN
    ('images','restaurant-images','invoice-logos','social-post-media','ai-generated-assets')))
WITH CHECK (NOT (SELECT public.launch_gate_enabled())
  OR (SELECT public.has_role(auth.uid(),'admin'))
  OR bucket_id='verification-documents'
  OR ((SELECT public.has_role(auth.uid(),'restaurateur')) AND bucket_id IN
    ('images','restaurant-images','invoice-logos','social-post-media','ai-generated-assets')));

-- Bulk enabling ordinary features must never close the application implicitly.
CREATE OR REPLACE FUNCTION public.admin_activate_all_feature_flags() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer := 0; f record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  FOR f IN SELECT name FROM public.feature_flags WHERE NOT is_active AND name<>'coming-soon'
  LOOP
    PERFORM public.admin_toggle_feature_flag(f.name,true,'Activation globale des fonctionnalités',NULL);
    n := n+1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.launch_gate_enabled(),public.get_launch_gate_state(),
 public.launch_table_allowed(text),public.launch_rpc_allowed(text),public.enforce_launch_gate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.launch_gate_enabled(),public.get_launch_gate_state(),
 public.launch_table_allowed(text),public.launch_rpc_allowed(text),public.enforce_launch_gate() TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_activate_all_feature_flags() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_activate_all_feature_flags() TO authenticated,service_role;

-- Refuse to overwrite a hook introduced by another release/operator.
DO $$ DECLARE existing text; BEGIN
  SELECT split_part(setting,'=',2) INTO existing FROM pg_roles,
    unnest(coalesce(rolconfig,ARRAY[]::text[])) setting
    WHERE rolname='authenticator' AND setting LIKE 'pgrst.db_pre_request=%';
  IF existing IS NOT NULL AND existing<>'' AND existing<>'public.enforce_launch_gate' THEN
    RAISE EXCEPTION 'Existing PostgREST pre-request hook must be composed explicitly';
  END IF;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.enforce_launch_gate';
NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';
COMMIT;
