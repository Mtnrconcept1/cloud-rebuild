ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_wallets" ON public.user_wallets FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_profiles" ON public.user_profiles FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_addresses" ON public.user_addresses FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_payment_methods" ON public.user_payment_methods FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_devices" ON public.user_devices FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_preferences" ON public.user_preferences FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_notification_settings" ON public.user_notification_settings FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for wallet_transactions" ON public.wallet_transactions FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_referrals" ON public.user_referrals FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_subscription_plans" ON public.user_subscription_plans FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for user_subscriptions" ON public.user_subscriptions FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_branches" ON public.restaurant_branches FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_hours" ON public.restaurant_hours FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_service_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_service_areas" ON public.restaurant_service_areas FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_delivery_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_delivery_rules" ON public.restaurant_delivery_rules FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_payout_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_payout_settings" ON public.restaurant_payout_settings FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_documents" ON public.restaurant_documents FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_staff" ON public.restaurant_staff FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_settings" ON public.restaurant_settings FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for categories" ON public.categories FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for menu_categories" ON public.menu_categories FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dishes" ON public.dishes FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dish_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dish_variants" ON public.dish_variants FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dish_modifier_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dish_modifier_groups" ON public.dish_modifier_groups FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dish_modifier_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dish_modifier_options" ON public.dish_modifier_options FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dish_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dish_images" ON public.dish_images FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dish_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dish_tags" ON public.dish_tags FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.allergens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for allergens" ON public.allergens FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dish_allergens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dish_allergens" ON public.dish_allergens FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.dish_availability_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for dish_availability_windows" ON public.dish_availability_windows FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for inventory_items" ON public.inventory_items FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for inventory_movements" ON public.inventory_movements FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.cuisines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for cuisines" ON public.cuisines FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.restaurant_cuisines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for restaurant_cuisines" ON public.restaurant_cuisines FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for collections" ON public.collections FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.collection_restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for collection_restaurants" ON public.collection_restaurants FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for search_logs" ON public.search_logs FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for impressions" ON public.impressions FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for clicks" ON public.clicks FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for carts" ON public.carts FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for cart_items" ON public.cart_items FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.cart_item_modifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for cart_item_modifiers" ON public.cart_item_modifiers FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_items" ON public.order_items FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_item_modifiers" ON public.order_item_modifiers FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_addresses" ON public.order_addresses FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_status_history" ON public.order_status_history FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_fees" ON public.order_fees FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_taxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_taxes" ON public.order_taxes FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_notes" ON public.order_notes FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_events" ON public.order_events FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_issues" ON public.order_issues FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Require auth for order_refunds" ON public.order_refunds FOR ALL USING (auth.role() = 'authenticated');

DO $$
BEGIN
  IF to_regclass('public.delivery_batches') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.delivery_batches ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for delivery_batches" ON public.delivery_batches FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.delivery_routes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for delivery_routes" ON public.delivery_routes FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.proof_of_delivery') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.proof_of_delivery ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for proof_of_delivery" ON public.proof_of_delivery FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.payment_intents') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for payment_intents" ON public.payment_intents FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.payout_batches') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for payout_batches" ON public.payout_batches FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.payouts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for payouts" ON public.payouts FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for invoices" ON public.invoices FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.credit_notes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for credit_notes" ON public.credit_notes FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.loyalty_tiers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for loyalty_tiers" ON public.loyalty_tiers FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.loyalty_accounts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for loyalty_accounts" ON public.loyalty_accounts FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.subscription_benefits') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.subscription_benefits ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for subscription_benefits" ON public.subscription_benefits FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.gift_cards') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for gift_cards" ON public.gift_cards FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.review_replies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for review_replies" ON public.review_replies FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.incident_reports') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for incident_reports" ON public.incident_reports FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.compensations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.compensations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for compensations" ON public.compensations FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.reservation_tables') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for reservation_tables" ON public.reservation_tables FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.reservation_slots') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.reservation_slots ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for reservation_slots" ON public.reservation_slots FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.reservation_status_history') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.reservation_status_history ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for reservation_status_history" ON public.reservation_status_history FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.event_store') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.event_store ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for event_store" ON public.event_store FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.feature_store') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.feature_store ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for feature_store" ON public.feature_store FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.recommendation_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.recommendation_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for recommendation_logs" ON public.recommendation_logs FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.ml_predictions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ml_predictions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for ml_predictions" ON public.ml_predictions FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;

  IF to_regclass('public.fraud_signals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Require auth for fraud_signals" ON public.fraud_signals FOR ALL USING (auth.role() = ''authenticated'')';
  END IF;
END
$$;


