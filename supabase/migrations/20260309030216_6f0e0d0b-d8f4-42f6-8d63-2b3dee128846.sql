
-- ============================================
-- 1. Drop dangerous set_test_role function
-- ============================================
DROP FUNCTION IF EXISTS public.set_test_role(text);
DROP FUNCTION IF EXISTS public.set_test_role(app_role);

-- ============================================
-- 2. Redeploy ALL triggers (consolidated)
-- ============================================

-- Audit triggers on orders
DROP TRIGGER IF EXISTS trg_audit_orders ON orders;
CREATE TRIGGER trg_audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_audit();

-- Audit triggers on reservations
DROP TRIGGER IF EXISTS trg_audit_reservations ON reservations;
CREATE TRIGGER trg_audit_reservations
  AFTER INSERT OR UPDATE OR DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION log_audit();

-- Order status notification trigger
DROP TRIGGER IF EXISTS trg_order_status_notification ON orders;
CREATE TRIGGER trg_order_status_notification
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_order_status_notification();

-- Review stats recompute trigger
DROP TRIGGER IF EXISTS trg_recompute_review_stats ON reviews;
CREATE TRIGGER trg_recompute_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION trigger_recompute_review_stats();

-- Loyalty: credit points on order
DROP TRIGGER IF EXISTS trg_credit_order_loyalty ON orders;
CREATE TRIGGER trg_credit_order_loyalty
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION credit_order_loyalty_points();

-- Loyalty: credit points on reservation
DROP TRIGGER IF EXISTS trg_credit_reservation_loyalty ON reservations;
CREATE TRIGGER trg_credit_reservation_loyalty
  AFTER INSERT ON reservations
  FOR EACH ROW EXECUTE FUNCTION credit_reservation_loyalty_points();

-- Loyalty: auto-update tier
DROP TRIGGER IF EXISTS trg_update_loyalty_tier ON profiles;
CREATE TRIGGER trg_update_loyalty_tier
  BEFORE UPDATE OF loyalty_points ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_loyalty_tier();

-- Updated_at triggers
DROP TRIGGER IF EXISTS trg_updated_at_orders ON orders;
CREATE TRIGGER trg_updated_at_orders
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_updated_at_restaurants ON restaurants;
CREATE TRIGGER trg_updated_at_restaurants
  BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. Convert critical RESTRICTIVE policies to PERMISSIVE
-- ============================================

-- ORDERS: SELECT policies
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Restaurant owners can view orders" ON orders;
CREATE POLICY "Restaurant owners can view orders" ON orders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = orders.restaurant_id AND restaurants.owner_id = auth.uid()));

-- ORDERS: UPDATE policy
DROP POLICY IF EXISTS "Restaurant owners can update orders" ON orders;
CREATE POLICY "Restaurant owners can update orders" ON orders
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = orders.restaurant_id AND restaurants.owner_id = auth.uid()));

-- ORDERS: INSERT policy
DROP POLICY IF EXISTS "Users can create orders" ON orders;
CREATE POLICY "Users can create orders" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ORDER_ITEMS: SELECT policies
DROP POLICY IF EXISTS "Users can view their own order items" ON order_items;
CREATE POLICY "Users can view their own order items" ON order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

DROP POLICY IF EXISTS "Restaurant owners can view order items" ON order_items;
CREATE POLICY "Restaurant owners can view order items" ON order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders JOIN restaurants ON restaurants.id = orders.restaurant_id WHERE orders.id = order_items.order_id AND restaurants.owner_id = auth.uid()));

-- ORDER_ITEMS: INSERT policy
DROP POLICY IF EXISTS "Users can create order items" ON order_items;
CREATE POLICY "Users can create order items" ON order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

-- RESERVATIONS: SELECT policies
DROP POLICY IF EXISTS "Users can view their own reservations" ON reservations;
CREATE POLICY "Users can view their own reservations" ON reservations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Restaurant owners can view reservations" ON reservations;
CREATE POLICY "Restaurant owners can view reservations" ON reservations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = reservations.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RESERVATIONS: UPDATE policies
DROP POLICY IF EXISTS "Users can cancel their reservations" ON reservations;
CREATE POLICY "Users can cancel their reservations" ON reservations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Restaurant owners can update reservations" ON reservations;
CREATE POLICY "Restaurant owners can update reservations" ON reservations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = reservations.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RESERVATIONS: INSERT policy
DROP POLICY IF EXISTS "Users can create reservations" ON reservations;
CREATE POLICY "Users can create reservations" ON reservations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- REVIEWS: policies
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
CREATE POLICY "Anyone can view reviews" ON reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create reviews" ON reviews;
CREATE POLICY "Users can create reviews" ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON reviews;
CREATE POLICY "Users can update their own reviews" ON reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reviews" ON reviews;
CREATE POLICY "Users can delete their own reviews" ON reviews
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can delete reviews" ON reviews;
CREATE POLICY "Admins can delete reviews" ON reviews
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- DELIVERY_TRACKING: SELECT policies
DROP POLICY IF EXISTS "Users can view their delivery tracking" ON delivery_tracking;
CREATE POLICY "Users can view their delivery tracking" ON delivery_tracking
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = delivery_tracking.order_id AND orders.user_id = auth.uid()));

DROP POLICY IF EXISTS "Restaurant owners can manage delivery tracking" ON delivery_tracking;
CREATE POLICY "Restaurant owners can manage delivery tracking" ON delivery_tracking
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM orders JOIN restaurants ON restaurants.id = orders.restaurant_id WHERE orders.id = delivery_tracking.order_id AND restaurants.owner_id = auth.uid()));

-- RESTAURANTS: policies
DROP POLICY IF EXISTS "Anyone can view active restaurants" ON restaurants;
CREATE POLICY "Anyone can view active restaurants" ON restaurants
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Owners can manage their restaurants" ON restaurants;
CREATE POLICY "Owners can manage their restaurants" ON restaurants
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can manage all restaurants" ON restaurants;
CREATE POLICY "Admins can manage all restaurants" ON restaurants
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- NOTIFICATIONS: policies
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
CREATE POLICY "Users can view their notifications" ON notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can update their notifications" ON notifications;
CREATE POLICY "Users can update their notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- PROFILES: policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
