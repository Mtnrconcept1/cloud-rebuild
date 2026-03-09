
-- Convert all RESTRICTIVE RLS policies to PERMISSIVE
-- Drop and recreate policies as PERMISSIVE (PostgreSQL default)

-- ORDERS
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
CREATE POLICY "Users can view their own orders" ON orders FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Restaurant owners can view orders" ON orders;
CREATE POLICY "Restaurant owners can view orders" ON orders FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = orders.restaurant_id AND restaurants.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create orders" ON orders;
CREATE POLICY "Users can create orders" ON orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Restaurant owners can update orders" ON orders;
CREATE POLICY "Restaurant owners can update orders" ON orders FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = orders.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RESERVATIONS
DROP POLICY IF EXISTS "Users can view their own reservations" ON reservations;
CREATE POLICY "Users can view their own reservations" ON reservations FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Restaurant owners can view reservations" ON reservations;
CREATE POLICY "Restaurant owners can view reservations" ON reservations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = reservations.restaurant_id AND restaurants.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create reservations" ON reservations;
CREATE POLICY "Users can create reservations" ON reservations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can cancel their reservations" ON reservations;
CREATE POLICY "Users can cancel their reservations" ON reservations FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Restaurant owners can update reservations" ON reservations;
CREATE POLICY "Restaurant owners can update reservations" ON reservations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = reservations.restaurant_id AND restaurants.owner_id = auth.uid()));

-- REVIEWS
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
CREATE POLICY "Anyone can view reviews" ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create reviews" ON reviews;
CREATE POLICY "Users can create reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON reviews;
CREATE POLICY "Users can update their own reviews" ON reviews FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reviews" ON reviews;
CREATE POLICY "Users can delete their own reviews" ON reviews FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can delete reviews" ON reviews;
CREATE POLICY "Admins can delete reviews" ON reviews FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- PROFILES
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RESTAURANTS
DROP POLICY IF EXISTS "Anyone can view active restaurants" ON restaurants;
CREATE POLICY "Anyone can view active restaurants" ON restaurants FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Owners can manage their restaurants" ON restaurants;
CREATE POLICY "Owners can manage their restaurants" ON restaurants FOR ALL TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can manage all restaurants" ON restaurants;
CREATE POLICY "Admins can manage all restaurants" ON restaurants FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- ORDER_ITEMS
DROP POLICY IF EXISTS "Users can view their own order items" ON order_items;
CREATE POLICY "Users can view their own order items" ON order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

DROP POLICY IF EXISTS "Restaurant owners can view order items" ON order_items;
CREATE POLICY "Restaurant owners can view order items" ON order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders JOIN restaurants ON restaurants.id = orders.restaurant_id WHERE orders.id = order_items.order_id AND restaurants.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create order items" ON order_items;
CREATE POLICY "Users can create order items" ON order_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

-- DELIVERY_TRACKING
DROP POLICY IF EXISTS "Users can view their delivery tracking" ON delivery_tracking;
CREATE POLICY "Users can view their delivery tracking" ON delivery_tracking FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = delivery_tracking.order_id AND orders.user_id = auth.uid()));

DROP POLICY IF EXISTS "Restaurant owners can manage delivery tracking" ON delivery_tracking;
CREATE POLICY "Restaurant owners can manage delivery tracking" ON delivery_tracking FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM orders JOIN restaurants ON restaurants.id = orders.restaurant_id WHERE orders.id = delivery_tracking.order_id AND restaurants.owner_id = auth.uid()));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
CREATE POLICY "Users can view their notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can update their notifications" ON notifications;
CREATE POLICY "Users can update their notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- MENU_ITEMS
DROP POLICY IF EXISTS "Anyone can view available menu items" ON menu_items;
CREATE POLICY "Anyone can view available menu items" ON menu_items FOR SELECT USING (is_available = true);

DROP POLICY IF EXISTS "Restaurant owners can manage menu items" ON menu_items;
CREATE POLICY "Restaurant owners can manage menu items" ON menu_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = menu_items.restaurant_id AND restaurants.owner_id = auth.uid()));

-- FAVORITES
DROP POLICY IF EXISTS "Users can view their favorites" ON favorites;
CREATE POLICY "Users can view their favorites" ON favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add favorites" ON favorites;
CREATE POLICY "Users can add favorites" ON favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove favorites" ON favorites;
CREATE POLICY "Users can remove favorites" ON favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- FEATURE_FLAGS
DROP POLICY IF EXISTS "Feature flags are viewable by everyone" ON feature_flags;
CREATE POLICY "Feature flags are viewable by everyone" ON feature_flags FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage feature flags" ON feature_flags;
CREATE POLICY "Admins can manage feature flags" ON feature_flags FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- AUDIT_LOG
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_log;
CREATE POLICY "Admins can view audit logs" ON audit_log FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON audit_log;
CREATE POLICY "Authenticated can insert audit logs" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- AD_CAMPAIGNS
DROP POLICY IF EXISTS "Anyone can read active campaigns" ON ad_campaigns;
CREATE POLICY "Anyone can read active campaigns" ON ad_campaigns FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "Restaurant owners can manage ad campaigns" ON ad_campaigns;
CREATE POLICY "Restaurant owners can manage ad campaigns" ON ad_campaigns FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = ad_campaigns.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage ad campaigns" ON ad_campaigns;
CREATE POLICY "Admins can manage ad campaigns" ON ad_campaigns FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- ANTI_WASTE_OFFERS
DROP POLICY IF EXISTS "Anyone can view active offers" ON anti_waste_offers;
CREATE POLICY "Anyone can view active offers" ON anti_waste_offers FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Restaurant owners can manage offers" ON anti_waste_offers;
CREATE POLICY "Restaurant owners can manage offers" ON anti_waste_offers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = anti_waste_offers.restaurant_id AND restaurants.owner_id = auth.uid()));

-- FLASH_SALES
DROP POLICY IF EXISTS "Anyone can view active flash sales" ON flash_sales;
CREATE POLICY "Anyone can view active flash sales" ON flash_sales FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Restaurant owners can manage flash sales" ON flash_sales;
CREATE POLICY "Restaurant owners can manage flash sales" ON flash_sales FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = flash_sales.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage flash sales" ON flash_sales;
CREATE POLICY "Admins can manage flash sales" ON flash_sales FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- MEAL_FORMULAS
DROP POLICY IF EXISTS "Anyone can view active formulas" ON meal_formulas;
CREATE POLICY "Anyone can view active formulas" ON meal_formulas FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Restaurant owners can manage formulas" ON meal_formulas;
CREATE POLICY "Restaurant owners can manage formulas" ON meal_formulas FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = meal_formulas.restaurant_id AND restaurants.owner_id = auth.uid()));

-- MEAL_FORMULA_CATEGORIES
DROP POLICY IF EXISTS "Anyone can view formula categories" ON meal_formula_categories;
CREATE POLICY "Anyone can view formula categories" ON meal_formula_categories FOR SELECT USING (EXISTS (SELECT 1 FROM meal_formulas WHERE meal_formulas.id = meal_formula_categories.formula_id AND meal_formulas.is_active = true));

DROP POLICY IF EXISTS "Restaurant owners can manage formula categories" ON meal_formula_categories;
CREATE POLICY "Restaurant owners can manage formula categories" ON meal_formula_categories FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM meal_formulas JOIN restaurants ON restaurants.id = meal_formulas.restaurant_id WHERE meal_formulas.id = meal_formula_categories.formula_id AND restaurants.owner_id = auth.uid()));

-- REMAINING TABLES (device_tokens, notification_preferences, notification_subscriptions, etc.)
DROP POLICY IF EXISTS "Users can manage their device tokens" ON device_tokens;
CREATE POLICY "Users can manage their device tokens" ON device_tokens FOR ALL TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their notification preferences" ON notification_preferences;
CREATE POLICY "Users can manage their notification preferences" ON notification_preferences FOR ALL TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their subscriptions" ON notification_subscriptions;
CREATE POLICY "Users can manage their subscriptions" ON notification_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their notification deliveries" ON notification_deliveries;
CREATE POLICY "Users can view their notification deliveries" ON notification_deliveries FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM notifications n WHERE n.id = notification_deliveries.notification_id AND n.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own loyalty transactions" ON loyalty_transactions;
CREATE POLICY "Users can view their own loyalty transactions" ON loyalty_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own gifts" ON gift_points;
CREATE POLICY "Users can view their own gifts" ON gift_points FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Authenticated users can send gifts" ON gift_points;
CREATE POLICY "Authenticated users can send gifts" ON gift_points FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Anyone can view active groups" ON order_groups;
CREATE POLICY "Anyone can view active groups" ON order_groups FOR SELECT USING (is_active = true AND expires_at > now());

DROP POLICY IF EXISTS "Users can create groups" ON order_groups;
CREATE POLICY "Users can create groups" ON order_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Anyone can view group members" ON group_members;
CREATE POLICY "Anyone can view group members" ON group_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can join groups" ON group_members;
CREATE POLICY "Users can join groups" ON group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- NOTIFICATION_CAMPAIGNS
DROP POLICY IF EXISTS "Admins can manage campaigns" ON notification_campaigns;
CREATE POLICY "Admins can manage campaigns" ON notification_campaigns FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- CHEF_TABLE_DROPS
DROP POLICY IF EXISTS "Public drops are viewable by everyone" ON chef_table_drops;
CREATE POLICY "Public drops are viewable by everyone" ON chef_table_drops FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage drops" ON chef_table_drops;
CREATE POLICY "Admins can manage drops" ON chef_table_drops FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- EMAIL_QUEUE
DROP POLICY IF EXISTS "Admins can view email queue" ON email_queue;
CREATE POLICY "Admins can view email queue" ON email_queue FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can insert emails" ON email_queue;
CREATE POLICY "Authenticated can insert emails" ON email_queue FOR INSERT TO authenticated WITH CHECK (true);

-- RESTAURANT_MEDIA
DROP POLICY IF EXISTS "Anyone can view restaurant media" ON restaurant_media;
CREATE POLICY "Anyone can view restaurant media" ON restaurant_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Restaurant owners can manage media" ON restaurant_media;
CREATE POLICY "Restaurant owners can manage media" ON restaurant_media FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_media.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage media" ON restaurant_media;
CREATE POLICY "Admins can manage media" ON restaurant_media FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RESTAURANT_PROMOTIONS
DROP POLICY IF EXISTS "Restaurant owners can manage promotions" ON restaurant_promotions;
CREATE POLICY "Restaurant owners can manage promotions" ON restaurant_promotions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_promotions.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage promotions" ON restaurant_promotions;
CREATE POLICY "Admins can manage promotions" ON restaurant_promotions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RESTAURANT_RECOMMENDATIONS
DROP POLICY IF EXISTS "Restaurant owners can manage recommendations" ON restaurant_recommendations;
CREATE POLICY "Restaurant owners can manage recommendations" ON restaurant_recommendations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_recommendations.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage recommendations" ON restaurant_recommendations;
CREATE POLICY "Admins can manage recommendations" ON restaurant_recommendations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RESTAURANT_DAILY_KPIS
DROP POLICY IF EXISTS "Restaurant owners can manage daily kpis" ON restaurant_daily_kpis;
CREATE POLICY "Restaurant owners can manage daily kpis" ON restaurant_daily_kpis FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_daily_kpis.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage daily kpis" ON restaurant_daily_kpis;
CREATE POLICY "Admins can manage daily kpis" ON restaurant_daily_kpis FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RESTAURANT_INVOICES
DROP POLICY IF EXISTS "Restaurant owners can manage invoices" ON restaurant_invoices;
CREATE POLICY "Restaurant owners can manage invoices" ON restaurant_invoices FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_invoices.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage invoices" ON restaurant_invoices;
CREATE POLICY "Admins can manage invoices" ON restaurant_invoices FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RESTAURANT_INVOICE_SETTINGS
DROP POLICY IF EXISTS "Restaurant owners can manage invoice settings" ON restaurant_invoice_settings;
CREATE POLICY "Restaurant owners can manage invoice settings" ON restaurant_invoice_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_invoice_settings.restaurant_id AND r.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage invoice settings" ON restaurant_invoice_settings;
CREATE POLICY "Admins can manage invoice settings" ON restaurant_invoice_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Also recreate triggers that were missing
CREATE OR REPLACE TRIGGER trg_credit_order_loyalty
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION credit_order_loyalty_points();

CREATE OR REPLACE TRIGGER trg_credit_reservation_loyalty
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION credit_reservation_loyalty_points();

CREATE OR REPLACE TRIGGER trg_update_loyalty_tier
  BEFORE UPDATE OF loyalty_points ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_loyalty_tier();

CREATE OR REPLACE TRIGGER trg_audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_reservations
  AFTER INSERT OR UPDATE OR DELETE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_restaurants
  AFTER INSERT OR UPDATE OR DELETE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_order_status_notification
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_order_status_notification();

CREATE OR REPLACE TRIGGER trg_recompute_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recompute_review_stats();

CREATE OR REPLACE TRIGGER trg_updated_at_orders
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_updated_at_restaurants
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
