-- Comprehensive RPC privilege hardening from the 2026-07-11 application audit.
-- Revoke anonymous access from authenticated helpers and restaurant mutations.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'assert_meal_formula_service_capacity',
        'auth_can_manage_floor_plan_variant',
        'count_restaurant_actualites_like_audience',
        'create_premium_actualites_banner',
        'get_restaurant_actualites_access',
        'get_restaurant_actualites_premium_banner_audience',
        'refresh_match_group_discount',
        'restaurant_archive_anti_waste_offer',
        'restaurant_archive_flash_sale',
        'restaurant_set_cuisines',
        'restaurant_update_anti_waste_offer_status',
        'restaurant_upsert_flash_sale',
        'signup_restaurateur_onboarding_payment_ready',
        'user_can_access_support_incident'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
  END LOOP;
END
$$;

-- Trigger, scheduler and maintenance functions are never client APIs.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname = ANY (ARRAY[
          'enforce_signed_commercial_prospect_status_owner',
          'enqueue_image_analysis_job',
          'rls_auto_enable',
          'sync_social_post_promotion_status',
          'touch_support_incident_last_message'
        ])
        OR p.proname LIKE 'trigger\_%\_subscription\_alert' ESCAPE '\'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
  END LOOP;
END
$$;

-- Prevent future functions created by the migration owner from inheriting
-- PostgreSQL's PUBLIC EXECUTE default. Explicit grants remain mandatory.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
