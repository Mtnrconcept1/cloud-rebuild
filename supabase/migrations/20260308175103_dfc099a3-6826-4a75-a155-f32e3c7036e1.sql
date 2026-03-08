
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anti_waste_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chef_table_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_formula_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solidarity_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_recommendations ENABLE ROW LEVEL SECURITY;

-- has_role function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for restaurants
CREATE POLICY "Anyone can view active restaurants" ON public.restaurants FOR SELECT USING (is_active = true);
CREATE POLICY "Owners can manage their restaurants" ON public.restaurants FOR ALL TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Admins can manage all restaurants" ON public.restaurants FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for menu_items
CREATE POLICY "Anyone can view available menu items" ON public.menu_items FOR SELECT USING (is_available = true);
CREATE POLICY "Restaurant owners can manage menu items" ON public.menu_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = menu_items.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for orders
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Restaurant owners can view orders" ON public.orders FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = orders.restaurant_id AND restaurants.owner_id = auth.uid()));
CREATE POLICY "Restaurant owners can update orders" ON public.orders FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = orders.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for order_items
CREATE POLICY "Users can create order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Users can view their own order items" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Restaurant owners can view order items" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders JOIN restaurants ON restaurants.id = orders.restaurant_id WHERE orders.id = order_items.order_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for reviews
CREATE POLICY "Anyone can view reviews" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reviews" ON public.reviews FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reviews" ON public.reviews FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can delete reviews" ON public.reviews FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for favorites
CREATE POLICY "Users can view their favorites" ON public.favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can add favorites" ON public.favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove favorites" ON public.favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for reservations
CREATE POLICY "Users can create reservations" ON public.reservations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own reservations" ON public.reservations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can cancel their reservations" ON public.reservations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Restaurant owners can view reservations" ON public.reservations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = reservations.restaurant_id AND restaurants.owner_id = auth.uid()));
CREATE POLICY "Restaurant owners can update reservations" ON public.reservations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = reservations.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for delivery_tracking
CREATE POLICY "Users can view their delivery tracking" ON public.delivery_tracking FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = delivery_tracking.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Restaurant owners can manage delivery tracking" ON public.delivery_tracking FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM orders JOIN restaurants ON restaurants.id = orders.restaurant_id WHERE orders.id = delivery_tracking.order_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for device_tokens
CREATE POLICY "Users can manage their device tokens" ON public.device_tokens FOR ALL TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for feature_flags
CREATE POLICY "Feature flags are viewable by everyone" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "Admins can manage feature flags" ON public.feature_flags FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for anti_waste_offers
CREATE POLICY "Anyone can view active offers" ON public.anti_waste_offers FOR SELECT USING (is_active = true);
CREATE POLICY "Restaurant owners can manage offers" ON public.anti_waste_offers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = anti_waste_offers.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for flash_sales
CREATE POLICY "Anyone can view active flash sales" ON public.flash_sales FOR SELECT USING (is_active = true);
CREATE POLICY "Restaurant owners can manage flash sales" ON public.flash_sales FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = flash_sales.restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY "Admins can manage flash sales" ON public.flash_sales FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for chef_table_drops
CREATE POLICY "Public drops are viewable by everyone" ON public.chef_table_drops FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage drops" ON public.chef_table_drops FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for gift_points
CREATE POLICY "Authenticated users can send gifts" ON public.gift_points FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can view their own gifts" ON public.gift_points FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- RLS Policies for order_groups
CREATE POLICY "Anyone can view active groups" ON public.order_groups FOR SELECT USING (is_active = true AND expires_at > now());
CREATE POLICY "Users can create groups" ON public.order_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

-- RLS Policies for group_members
CREATE POLICY "Anyone can view group members" ON public.group_members FOR SELECT USING (true);
CREATE POLICY "Users can join groups" ON public.group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- RLS Policies for loyalty_transactions
CREATE POLICY "Users can view their own loyalty transactions" ON public.loyalty_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for meal_formulas
CREATE POLICY "Anyone can view active formulas" ON public.meal_formulas FOR SELECT USING (is_active = true);
CREATE POLICY "Restaurant owners can manage formulas" ON public.meal_formulas FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = meal_formulas.restaurant_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for meal_formula_categories
CREATE POLICY "Anyone can view formula categories" ON public.meal_formula_categories FOR SELECT USING (EXISTS (SELECT 1 FROM meal_formulas WHERE meal_formulas.id = meal_formula_categories.formula_id AND meal_formulas.is_active = true));
CREATE POLICY "Restaurant owners can manage formula categories" ON public.meal_formula_categories FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM meal_formulas JOIN restaurants ON restaurants.id = meal_formulas.restaurant_id WHERE meal_formulas.id = meal_formula_categories.formula_id AND restaurants.owner_id = auth.uid()));

-- RLS Policies for notifications
CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- RLS Policies for notification_campaigns
CREATE POLICY "Admins can manage campaigns" ON public.notification_campaigns FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for notification_deliveries
CREATE POLICY "Users can view their notification deliveries" ON public.notification_deliveries FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM notifications n WHERE n.id = notification_deliveries.notification_id AND n.user_id = auth.uid()));

-- RLS Policies for notification_preferences
CREATE POLICY "Users can manage their notification preferences" ON public.notification_preferences FOR ALL TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for notification_subscriptions
CREATE POLICY "Users can manage their subscriptions" ON public.notification_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for solidarity_donations
CREATE POLICY "Anyone can view solidarity donations" ON public.solidarity_donations FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create donations" ON public.solidarity_donations FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

-- RLS Policies for user_analytics
CREATE POLICY "Users can insert their own analytics" ON public.user_analytics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own analytics" ON public.user_analytics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all analytics" ON public.user_analytics FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for user_preferences
CREATE POLICY "Users can manage their preferences" ON public.user_preferences FOR ALL TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can manage their subscriptions" ON public.user_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for ad_campaigns
CREATE POLICY "Anyone can read active campaigns" ON public.ad_campaigns FOR SELECT USING (status = 'active');
CREATE POLICY "Restaurant owners can manage ad campaigns" ON public.ad_campaigns FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = ad_campaigns.restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY "Admins can manage ad campaigns" ON public.ad_campaigns FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for restaurant_daily_kpis
CREATE POLICY "Restaurant owners can manage daily kpis" ON public.restaurant_daily_kpis FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_daily_kpis.restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY "Admins can manage daily kpis" ON public.restaurant_daily_kpis FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for restaurant_invoices
CREATE POLICY "Restaurant owners can manage invoices" ON public.restaurant_invoices FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_invoices.restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY "Admins can manage invoices" ON public.restaurant_invoices FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for restaurant_media
CREATE POLICY "Restaurant owners can manage media" ON public.restaurant_media FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_media.restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY "Admins can manage media" ON public.restaurant_media FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for restaurant_promotions
CREATE POLICY "Restaurant owners can manage promotions" ON public.restaurant_promotions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_promotions.restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY "Admins can manage promotions" ON public.restaurant_promotions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for restaurant_recommendations
CREATE POLICY "Restaurant owners can manage recommendations" ON public.restaurant_recommendations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_recommendations.restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY "Admins can manage recommendations" ON public.restaurant_recommendations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
