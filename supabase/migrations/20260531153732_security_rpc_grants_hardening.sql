-- Security hardening: remove anonymous execution from sensitive SECURITY DEFINER RPCs.
-- Public read-only RPCs are left available only where explicitly intended.
--
-- This migration runs before the Match Group RPC migrations. Do not reference
-- Match Group functions here, otherwise Supabase shadow DB rebuilds fail on a
-- fresh migration replay. Those RPCs harden their own grants when created.

REVOKE EXECUTE ON FUNCTION public.admin_activate_all_feature_flags() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_seed_default_flags(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_feature_flag(text, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_activate_all_feature_flags() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_seed_default_flags(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_toggle_feature_flag(text, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_actualites_insights(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_campaign_activity(uuid, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_restaurant_actualites_insights(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_restaurant_campaign_activity(uuid, integer, integer) TO authenticated, service_role;

-- Conversion attribution is trigger/server authority. It should not be exposed as public RPC.
REVOKE EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
