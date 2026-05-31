-- Security linter hardening and minimal database-side automation for Tok production.
-- This migration is intentionally conservative: it removes direct anonymous access
-- from sensitive RPCs, keeps public read RPCs available, removes broad bucket listing,
-- and schedules DB-only automation. Edge Functions that need secrets must still be
-- scheduled by Supabase Scheduled Functions, GitHub Actions, or another external scheduler.

-- 1) Fix mutable search_path warnings on current overloads.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('jsonb_target_pages_has_actualites', 'calculate_match_group_discount')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.signature);
  END LOOP;
END;
$$;

-- 2) Public bucket URLs do not require a broad storage.objects SELECT/list policy.
-- Media URLs are stored in social_post_media; clients should not list the bucket.
DROP POLICY IF EXISTS social_posts_storage_select ON storage.objects;

-- 3) Remove direct anonymous EXECUTE from sensitive SECURITY DEFINER functions.
-- Keep intentionally public RPCs out of this list, such as:
-- search_restaurants_catalog, get_match_group_public_feed, record_social_feed_event,
-- is_feature_flag_active, get_total_donated_meals, get_total_donated_points,
-- get_gift_stats, and get_restaurant_reservation_slot_availability.
DO $$
DECLARE
  fn text;
  r record;
  sensitive_function_names text[] := ARRAY[
    'admin_activate_all_feature_flags',
    'admin_dispatch_notification_campaign',
    'admin_get_cancellation_fraud_metrics',
    'admin_get_refund_queue',
    'admin_get_reservation_billing_history',
    'admin_list_users',
    'admin_review_signup_application',
    'admin_seed_default_flags',
    'admin_set_user_roles',
    'admin_submit_signup_application',
    'admin_toggle_feature_flag',
    'apply_checkout_benefits',
    'apply_reservation_loyalty_points',
    'auth_can_manage_dispatch_job',
    'auth_can_manage_order_delivery',
    'auth_can_view_courier',
    'auth_can_view_dispatch_job',
    'auth_can_view_order_delivery',
    'auth_is_admin',
    'auth_owns_courier',
    'auth_owns_restaurant',
    'cancel_order_by_customer',
    'cancel_order_by_restaurant',
    'cancel_reservation_by_customer',
    'cancel_reservation_by_restaurant',
    'claim_gift_points',
    'cleanup_expired_groups',
    'close_due_match_groups',
    'create_match_group',
    'create_support_incident',
    'credit_order_loyalty_points',
    'credit_reservation_loyalty_points',
    'delete_user_gdpr_cascade',
    'dispatch_due_notification_campaigns',
    'donate_points_for_meal',
    'enqueue_deliveries',
    'ensure_guest_profile',
    'estimate_campaign_audience',
    'generate_tok_payable_invoice',
    'generate_tok_payable_invoices_all',
    'generate_tok_reservation_fee_invoice',
    'generate_tok_reservation_fee_invoices_all',
    'get_campaign_stats',
    'get_customer_orders_dashboard',
    'get_order_customers',
    'get_payable_invoice_lines',
    'get_payment_integrity_anomalies',
    'get_payout_invoice_lines',
    'get_reservation_customers',
    'get_reservation_fee_invoice_lines',
    'get_restaurant_actualites_insights',
    'get_restaurant_campaign_activity',
    'get_restaurant_comparison',
    'get_restaurant_orders_dashboard',
    'get_restaurant_payment_history',
    'get_restaurant_performance',
    'get_restaurant_recommendations',
    'guard_ad_campaign_client_write',
    'handle_email_confirmation',
    'handle_new_user',
    'has_role',
    'is_restaurant_internal_actor',
    'log_audit',
    'log_feature_flag_audit',
    'mark_noshow_reservations',
    'mark_refund_applied',
    'notify_restaurant_follow',
    'notify_social_comment',
    'notify_social_repost',
    'rate_limit_consume',
    'recompute_restaurant_review_stats',
    'record_actualites_order_conversion_trigger',
    'record_actualites_reservation_conversion_trigger',
    'redeem_loyalty_points',
    'refresh_match_group_discount',
    'refresh_restaurant_daily_kpis_for_date',
    'refresh_restaurant_daily_kpis_recent_days',
    'refresh_social_comment_counts',
    'refresh_social_post_counts',
    'rls_auto_enable',
    'send_gift_points',
    'social_comment_counts_trigger',
    'social_post_counts_trigger',
    'submit_verified_review',
    'sync_signup_application',
    'sync_social_post_promotion_status',
    'touch_support_incident_last_message',
    'trg_ensure_order_number',
    'trg_ensure_reservation_reference',
    'trigger_anti_gaspi_subscription_alert',
    'trigger_chefs_table_subscription_alert',
    'trigger_flash_sale_subscription_alert',
    'trigger_invoice_notification',
    'trigger_order_status_notification',
    'trigger_recompute_review_stats',
    'trigger_refresh_kpis',
    'trigger_reservation_notifications',
    'trigger_review_reply_notification',
    'update_loyalty_tier',
    'update_restaurant_reservation_status_safe',
    'upsert_match_group_member_order',
    'user_can_access_support_incident',
    'validate_and_create_reservation',
    'validate_and_create_reservation_safe'
  ];
BEGIN
  FOREACH fn IN ARRAY sensitive_function_names LOOP
    FOR r IN
      SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.signature);
    END LOOP;
  END LOOP;
END;
$$;

-- 4) Lock pure trigger/maintenance functions from direct API execution by signed-in users too.
-- Triggers can still execute these internally.
DO $$
DECLARE
  fn text;
  r record;
  trigger_or_internal_function_names text[] := ARRAY[
    'credit_order_loyalty_points',
    'credit_reservation_loyalty_points',
    'guard_ad_campaign_client_write',
    'handle_email_confirmation',
    'handle_new_user',
    'log_audit',
    'log_feature_flag_audit',
    'notify_restaurant_follow',
    'notify_social_comment',
    'notify_social_repost',
    'record_actualites_order_conversion_trigger',
    'record_actualites_reservation_conversion_trigger',
    'social_comment_counts_trigger',
    'social_post_counts_trigger',
    'sync_social_post_promotion_status',
    'touch_support_incident_last_message',
    'trg_ensure_order_number',
    'trg_ensure_reservation_reference',
    'trigger_anti_gaspi_subscription_alert',
    'trigger_chefs_table_subscription_alert',
    'trigger_flash_sale_subscription_alert',
    'trigger_invoice_notification',
    'trigger_order_status_notification',
    'trigger_recompute_review_stats',
    'trigger_refresh_kpis',
    'trigger_reservation_notifications',
    'trigger_review_reply_notification',
    'update_loyalty_tier'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_or_internal_function_names LOOP
    FOR r IN
      SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.signature);
    END LOOP;
  END LOOP;
END;
$$;

-- 5) Minimal DB-side automation. This is safe because these jobs call only DB functions.
-- Stripe capture and other secret-bearing work must run through Edge Functions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'close_due_match_groups'
    ) AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tok-close-due-match-groups') THEN
      PERFORM cron.schedule('tok-close-due-match-groups', '* * * * *', 'select public.close_due_match_groups();');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'sync_social_post_promotion_status'
    ) AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tok-sync-social-post-promotions') THEN
      PERFORM cron.schedule('tok-sync-social-post-promotions', '*/5 * * * *', 'select public.sync_social_post_promotion_status();');
    END IF;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
