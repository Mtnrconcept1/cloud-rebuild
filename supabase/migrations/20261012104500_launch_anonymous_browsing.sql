-- Anonymous visitors may discover public TOK content during the launch,
-- subject to the existing RLS and GRANT policies. Signed-in clients remain locked.
BEGIN;

-- The original restrictive launch_access_guard exists on every RLS table.
-- For anon, the pre-existing policies still decide which rows can be returned.
CREATE OR REPLACE FUNCTION public.launch_table_allowed(p_table text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.role() = 'anon', false)
    OR NOT public.launch_gate_enabled()
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

-- PostgREST visitors are subject to the original function permissions and RLS,
-- not the authenticated-client launch lock.
CREATE OR REPLACE FUNCTION public.enforce_launch_gate() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_path text := current_setting('request.path',true);
  v_resource text;
BEGIN
  IF coalesce(auth.role(),'') <> 'authenticated' THEN RETURN; END IF;
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

-- Restore anonymous reads of public assets without changing their bucket RLS.
-- Preserve all previous launch restrictions for authenticated client objects.
DROP POLICY IF EXISTS launch_access_guard ON storage.objects;
CREATE POLICY launch_access_guard ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (coalesce((SELECT auth.role()='anon'),false)
  OR NOT (SELECT public.launch_gate_enabled())
  OR (SELECT public.has_role(auth.uid(),'admin'))
  OR bucket_id='verification-documents'
  OR ((SELECT public.has_role(auth.uid(),'restaurateur')) AND bucket_id IN
    ('images','restaurant-images','invoice-logos','social-post-media','ai-generated-assets')))
WITH CHECK (coalesce((SELECT auth.role()='anon'),false)
  OR NOT (SELECT public.launch_gate_enabled())
  OR (SELECT public.has_role(auth.uid(),'admin'))
  OR bucket_id='verification-documents'
  OR ((SELECT public.has_role(auth.uid(),'restaurateur')) AND bucket_id IN
    ('images','restaurant-images','invoice-logos','social-post-media','ai-generated-assets')));

NOTIFY pgrst,'reload schema';
COMMIT;
