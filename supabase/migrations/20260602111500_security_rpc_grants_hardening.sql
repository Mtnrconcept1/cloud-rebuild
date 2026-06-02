-- Lock critical Actualites RPC grants.

REVOKE EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_post_thread(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
