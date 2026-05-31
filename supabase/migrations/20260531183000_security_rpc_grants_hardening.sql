-- Security hardening: remove anonymous execution from sensitive SECURITY DEFINER RPCs.
-- Public read-only RPCs are left available only where explicitly intended.

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
REVOKE EXECUTE ON FUNCTION public.create_match_group(uuid, text, timestamptz, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_match_group_member_order(uuid, jsonb, numeric, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_restaurant_actualites_insights(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_restaurant_campaign_activity(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_match_group(uuid, text, timestamptz, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_match_group_member_order(uuid, jsonb, numeric, jsonb) TO authenticated, service_role;

-- These functions are server/cron authority only. They must not be callable from anon or normal clients.
REVOKE EXECUTE ON FUNCTION public.get_match_group_capture_candidates(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_match_group_pending_authorizations(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_match_group_member_captured(uuid, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_match_group_member_capture_failed(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_match_group_authorization_failed(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_match_group_capture_candidates(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_match_group_pending_authorizations(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_captured(uuid, text, numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_capture_failed(uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_match_group_authorization_failed(uuid, text) TO service_role;

-- Conversion attribution is trigger/server authority. It should not be exposed as public RPC.
REVOKE EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) TO service_role;

-- Optional client-side close fallback remains authenticated-only. Cron function uses service_role.
REVOKE EXECUTE ON FUNCTION public.close_due_match_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_due_match_groups() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
