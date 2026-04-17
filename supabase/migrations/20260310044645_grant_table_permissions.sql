-- Grant table-level permissions to PostgREST roles (anon, authenticated)
-- Without these GRANTs, PostgREST cannot expose the tables via the REST API (404 error)

-- ═══════════════════════════════════════════════════════════
-- Phase 1: Core Identity
-- ═══════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_referrals TO authenticated;
GRANT SELECT ON public.user_subscription_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_subscription_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_subscriptions TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- Phase 2: Restaurant & Catalog
-- ═══════════════════════════════════════════════════════════
GRANT SELECT ON public.restaurant_branches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_branches TO authenticated;
GRANT SELECT ON public.restaurant_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_hours TO authenticated;
GRANT SELECT ON public.restaurant_service_areas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_service_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_delivery_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_payout_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_staff TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_settings TO authenticated;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT ON public.menu_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT SELECT ON public.dishes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dishes TO authenticated;
GRANT SELECT ON public.dish_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_variants TO authenticated;
GRANT SELECT ON public.dish_modifier_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_modifier_groups TO authenticated;
GRANT SELECT ON public.dish_modifier_options TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_modifier_options TO authenticated;
GRANT SELECT ON public.dish_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_images TO authenticated;
GRANT SELECT ON public.dish_tags TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_tags TO authenticated;
GRANT SELECT ON public.allergens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allergens TO authenticated;
GRANT SELECT ON public.dish_allergens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_allergens TO authenticated;
GRANT SELECT ON public.dish_availability_windows TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_availability_windows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- Phase 3: Discovery & Orders
-- ═══════════════════════════════════════════════════════════
GRANT SELECT ON public.cuisines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuisines TO authenticated;
GRANT SELECT ON public.restaurant_cuisines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_cuisines TO authenticated;
GRANT SELECT ON public.collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT SELECT ON public.collection_restaurants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_restaurants TO authenticated;
GRANT SELECT, INSERT ON public.search_logs TO authenticated;
GRANT SELECT, INSERT ON public.impressions TO authenticated;
GRANT SELECT, INSERT ON public.clicks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_item_modifiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_modifiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_addresses TO authenticated;
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT SELECT, INSERT ON public.order_fees TO authenticated;
GRANT SELECT, INSERT ON public.order_taxes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_notes TO authenticated;
GRANT SELECT, INSERT ON public.order_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_issues TO authenticated;
GRANT SELECT, INSERT ON public.order_refunds TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- Phase 4: Delivery, Logistics & Payments
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.delivery_batches') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.delivery_batches TO authenticated';
  END IF;
  IF to_regclass('public.delivery_routes') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.delivery_routes TO authenticated';
  END IF;
  IF to_regclass('public.proof_of_delivery') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.proof_of_delivery TO authenticated';
  END IF;
  IF to_regclass('public.payment_intents') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.payment_intents TO authenticated';
  END IF;
  IF to_regclass('public.payout_batches') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.payout_batches TO authenticated';
  END IF;
  IF to_regclass('public.payouts') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.payouts TO authenticated';
  END IF;
  IF to_regclass('public.invoices') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.invoices TO authenticated';
  END IF;
  IF to_regclass('public.credit_notes') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.credit_notes TO authenticated';
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════
-- Phase 5: Loyalty, Reviews, Reservations & AI Data
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.loyalty_tiers') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.loyalty_tiers TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_tiers TO authenticated';
  END IF;
  IF to_regclass('public.loyalty_accounts') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.loyalty_accounts TO authenticated';
  END IF;
  IF to_regclass('public.subscription_benefits') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.subscription_benefits TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_benefits TO authenticated';
  END IF;
  IF to_regclass('public.gift_cards') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.gift_cards TO authenticated';
  END IF;
  IF to_regclass('public.review_replies') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.review_replies TO authenticated';
  END IF;
  IF to_regclass('public.incident_reports') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.incident_reports TO authenticated';
  END IF;
  IF to_regclass('public.compensations') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.compensations TO authenticated';
  END IF;
  IF to_regclass('public.reservation_tables') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.reservation_tables TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_tables TO authenticated';
  END IF;
  IF to_regclass('public.reservation_slots') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.reservation_slots TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_slots TO authenticated';
  END IF;
  IF to_regclass('public.reservation_status_history') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.reservation_status_history TO authenticated';
  END IF;
  IF to_regclass('public.event_store') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.event_store TO authenticated';
  END IF;
  IF to_regclass('public.feature_store') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.feature_store TO authenticated';
  END IF;
  IF to_regclass('public.recommendation_logs') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.recommendation_logs TO authenticated';
  END IF;
  IF to_regclass('public.ml_predictions') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.ml_predictions TO authenticated';
  END IF;
  IF to_regclass('public.fraud_signals') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.fraud_signals TO authenticated';
  END IF;
END
$$;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
