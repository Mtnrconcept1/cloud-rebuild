-- Employee invitations and the employee portal must work during the TOK launch.
-- These explicit authenticated endpoints still enforce their existing RLS and
-- RPC ownership checks. No platform role, feature flag or hook is changed.
-- Legacy behavior is retained from 20261013014557 at source commit ab913afa.
BEGIN;

CREATE OR REPLACE FUNCTION public.launch_table_allowed(p_table text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.role() = 'anon', false)
    OR NOT public.launch_gate_enabled()
    OR coalesce(auth.role()='service_role',false)
    OR public.has_role(auth.uid(),'admin')
    OR (coalesce(auth.role()='authenticated',false) AND auth.uid() IS NOT NULL
      AND p_table=ANY(ARRAY[
        'tok_workforce_settings','tok_workforce_employees','tok_workforce_shifts',
        'tok_workforce_time_entries','tok_workforce_validations','tok_workforce_absences',
        'tok_workforce_requests','tok_workforce_exchanges','tok_workforce_clock_sessions',
        'tok_workforce_clock_events','tok_workforce_invitations']))
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

CREATE OR REPLACE FUNCTION public.launch_rpc_allowed(p_rpc text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT public.launch_gate_enabled() OR coalesce(auth.role()='service_role',false)
    OR public.has_role(auth.uid(),'admin')
    OR (coalesce(auth.role()='authenticated',false) AND auth.uid() IS NOT NULL
      AND p_rpc=ANY(ARRAY[
        'tok_workforce_my_restaurants','tok_workforce_claim_employee',
        'tok_workforce_invite_employee','tok_workforce_list_invitations',
        'tok_workforce_revoke_invitation','tok_workforce_punch',
        'tok_workforce_team_directory','tok_workforce_respond_exchange',
        'tok_workforce_review_exchange','tok_workforce_review_request']))
    OR p_rpc=ANY(ARRAY['get_launch_gate_state','has_role','is_feature_flag_active',
      'sync_signup_application','get_my_signup_application'])
    OR (coalesce(auth.role() = 'anon', false) AND p_rpc=ANY(ARRAY[
      'search_restaurants_catalog_page','get_total_donated_points']))
    OR (public.has_role(auth.uid(),'restaurateur') AND p_rpc=ANY(ARRAY[
      'restaurant_set_cuisines','get_my_restaurant_ai_subscriptions',
      'get_my_restaurant_billing_account','get_restaurant_billing_summary']))
    OR public.has_role(auth.uid(),'courier') OR public.has_role(auth.uid(),'commercial')
$$;

-- CREATE OR REPLACE preserves the existing function ownership and EXECUTE grants.
NOTIFY pgrst,'reload schema';
COMMIT;
