-- Tighten SECURITY DEFINER RPC execution after the authenticated security audit.
-- PostgreSQL grants EXECUTE on functions to PUBLIC by default, so sensitive RPCs
-- must explicitly revoke both PUBLIC and anon access.

DO $$
BEGIN
  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.get_order_customers(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_order_customers(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_order_customers(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.get_reservation_customers(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_reservation_customers(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_reservation_customers(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.track_order_event(uuid, text, jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.track_order_event(uuid, text, jsonb) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.track_order_event(uuid, text, jsonb) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.restaurant_set_cover_media(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.restaurant_set_cover_media(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.restaurant_set_cover_media(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.restaurant_delete_media_metadata(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.restaurant_delete_media_metadata(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.restaurant_delete_media_metadata(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.restaurant_upsert_anti_waste_offer(uuid, jsonb, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.restaurant_upsert_anti_waste_offer(uuid, jsonb, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.restaurant_upsert_anti_waste_offer(uuid, jsonb, text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.restaurant_update_flash_sale_status(uuid, boolean, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.restaurant_update_flash_sale_status(uuid, boolean, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.restaurant_update_flash_sale_status(uuid, boolean, text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.recompute_restaurant_review_stats(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.recompute_restaurant_review_stats(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.recompute_restaurant_review_stats(uuid) TO service_role;
  END IF;

  IF to_regprocedure('public.refresh_restaurant_daily_kpis_for_date(uuid, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.refresh_restaurant_daily_kpis_for_date(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.refresh_restaurant_daily_kpis_for_date(uuid, text) TO service_role;
  END IF;

  IF to_regprocedure('public.refresh_restaurant_daily_kpis_recent_days(integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.refresh_restaurant_daily_kpis_recent_days(integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.refresh_restaurant_daily_kpis_recent_days(integer) TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
