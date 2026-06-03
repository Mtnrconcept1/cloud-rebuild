-- Replace legacy "any authenticated user" policies with row-scoped policies.
-- This migration intentionally runs after the targeted RLS hardening migration.

CREATE OR REPLACE FUNCTION public.auth_can_access_cart(p_cart_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = p_cart_id
        AND c.user_id = (SELECT auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_access_cart_item(p_cart_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.cart_items ci
      WHERE ci.id = p_cart_item_id
        AND public.auth_can_access_cart(ci.cart_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_menu_category(p_menu_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.menu_categories mc
      WHERE mc.id = p_menu_category_id
        AND public.auth_can_access_branch(mc.branch_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_dish(p_dish_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.dishes d
      WHERE d.id = p_dish_id
        AND public.auth_can_manage_menu_category(d.menu_category_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_dish_modifier_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.dish_modifier_groups dmg
      WHERE dmg.id = p_group_id
        AND public.auth_can_manage_dish(dmg.dish_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_inventory_item(p_inventory_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.inventory_items ii
      WHERE ii.id = p_inventory_item_id
        AND public.auth_can_access_branch(ii.branch_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_access_order_item(p_order_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.id = p_order_item_id
        AND public.auth_can_access_order(oi.order_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_access_reservation_record(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.reservations rv
      WHERE rv.id = p_reservation_id
        AND (
          rv.user_id = (SELECT auth.uid())
          OR public.auth_owns_restaurant(rv.restaurant_id)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_access_legacy_invoice(
  p_recipient_type text,
  p_recipient_id uuid,
  p_order_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR (p_order_id IS NOT NULL AND public.auth_can_access_order(p_order_id))
    OR (
      lower(COALESCE(p_recipient_type, '')) = 'user'
      AND p_recipient_id = (SELECT auth.uid())
    )
    OR (
      lower(COALESCE(p_recipient_type, '')) = 'restaurant'
      AND public.auth_owns_restaurant(p_recipient_id)
    )
    OR (
      lower(COALESCE(p_recipient_type, '')) = 'courier'
      AND public.auth_owns_courier(p_recipient_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_access_credit_note(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = p_invoice_id
        AND public.auth_can_access_legacy_invoice(i.recipient_type, i.recipient_id, i.order_id)
    );
$$;

REVOKE ALL ON FUNCTION public.auth_can_access_cart(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_access_cart_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_menu_category(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_dish(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_dish_modifier_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_inventory_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_access_order_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_access_reservation_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_access_legacy_invoice(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_access_credit_note(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_can_access_cart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_cart_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_menu_category(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_dish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_dish_modifier_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_inventory_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_order_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_reservation_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_legacy_invoice(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_credit_note(uuid) TO authenticated;

DO $$
DECLARE
  t text;
  legacy_require_auth_tables text[] := ARRAY[
    'user_wallets',
    'user_profiles',
    'user_addresses',
    'user_payment_methods',
    'user_devices',
    'user_preferences',
    'user_notification_settings',
    'wallet_transactions',
    'user_referrals',
    'user_subscription_plans',
    'user_subscriptions',
    'restaurant_branches',
    'restaurant_hours',
    'restaurant_service_areas',
    'restaurant_delivery_rules',
    'restaurant_payout_settings',
    'restaurant_documents',
    'restaurant_staff',
    'restaurant_settings',
    'categories',
    'menu_categories',
    'dishes',
    'dish_variants',
    'dish_modifier_groups',
    'dish_modifier_options',
    'dish_images',
    'dish_tags',
    'allergens',
    'dish_allergens',
    'dish_availability_windows',
    'inventory_items',
    'inventory_movements',
    'cuisines',
    'restaurant_cuisines',
    'collections',
    'collection_restaurants',
    'search_logs',
    'impressions',
    'clicks',
    'carts',
    'cart_items',
    'cart_item_modifiers',
    'order_items',
    'order_item_modifiers',
    'order_addresses',
    'order_status_history',
    'order_fees',
    'order_taxes',
    'order_notes',
    'order_events',
    'order_issues',
    'order_refunds',
    'delivery_batches',
    'delivery_routes',
    'proof_of_delivery',
    'payment_intents',
    'payout_batches',
    'payouts',
    'invoices',
    'credit_notes',
    'loyalty_tiers',
    'loyalty_accounts',
    'subscription_benefits',
    'gift_cards',
    'review_replies',
    'incident_reports',
    'compensations',
    'reservation_tables',
    'reservation_slots',
    'reservation_table_layout_overrides',
    'reservation_status_history',
    'event_store',
    'feature_store',
    'recommendation_logs',
    'ml_predictions',
    'fraud_signals'
  ];
BEGIN
  FOREACH t IN ARRAY legacy_require_auth_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Require auth for ' || t, t);
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  t text;
  user_crud_tables text[] := ARRAY[
    'user_profiles',
    'user_addresses',
    'user_payment_methods',
    'user_devices',
    'user_preferences',
    'user_notification_settings'
  ];
BEGIN
  FOREACH t IN ARRAY user_crud_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users manage own ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_select', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_delete', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin())', t || '_owner_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) OR public.auth_is_admin())', t || '_owner_insert', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR public.auth_is_admin())', t || '_owner_update', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin())', t || '_owner_delete', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  t text;
  user_read_tables text[] := ARRAY[
    'user_wallets',
    'user_subscriptions',
    'loyalty_accounts',
    'compensations',
    'recommendation_logs',
    'fraud_signals'
  ];
BEGIN
  FOREACH t IN ARRAY user_read_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users manage own ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin())', t || '_owner_select', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "wallets_own" ON public.user_wallets;
DROP POLICY IF EXISTS "wallets_admin" ON public.user_wallets;
DROP POLICY IF EXISTS "Users view own wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_transactions_owner_select" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_owner_select"
  ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_wallets uw
      WHERE uw.id = wallet_id
        AND uw.user_id = (SELECT auth.uid())
    )
  );
GRANT SELECT ON public.wallet_transactions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM authenticated;

DROP POLICY IF EXISTS "Users manage own user_referrals" ON public.user_referrals;
DROP POLICY IF EXISTS "user_referrals_owner_select" ON public.user_referrals;
DROP POLICY IF EXISTS "user_referrals_owner_insert" ON public.user_referrals;
CREATE POLICY "user_referrals_owner_select"
  ON public.user_referrals
  FOR SELECT TO authenticated
  USING (
    referrer_id = (SELECT auth.uid())
    OR referred_id = (SELECT auth.uid())
    OR public.auth_is_admin()
  );
CREATE POLICY "user_referrals_owner_insert"
  ON public.user_referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_id = (SELECT auth.uid()) OR public.auth_is_admin());
GRANT SELECT, INSERT ON public.user_referrals TO authenticated;
REVOKE UPDATE, DELETE ON public.user_referrals FROM authenticated;

DROP POLICY IF EXISTS "Users manage own gift_cards" ON public.gift_cards;
DROP POLICY IF EXISTS "gift_cards_owner_select" ON public.gift_cards;
CREATE POLICY "gift_cards_owner_select"
  ON public.gift_cards
  FOR SELECT TO authenticated
  USING (purchaser_id = (SELECT auth.uid()) OR public.auth_is_admin());
GRANT SELECT ON public.gift_cards TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.gift_cards FROM authenticated;

DO $$
DECLARE
  t text;
  public_admin_tables text[] := ARRAY[
    'categories',
    'cuisines',
    'collections',
    'collection_restaurants',
    'allergens',
    'loyalty_tiers',
    'user_subscription_plans',
    'subscription_benefits'
  ];
BEGIN
  FOREACH t IN ARRAY public_admin_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Public read for ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_select', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_delete', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_public_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.auth_is_admin())', t || '_admin_insert', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin())', t || '_admin_update', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.auth_is_admin())', t || '_admin_delete', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  t text;
  private_restaurant_tables text[] := ARRAY[
    'restaurant_documents',
    'restaurant_staff',
    'restaurant_settings'
  ];
BEGIN
  FOREACH t IN ARRAY private_restaurant_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_select', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_delete', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())', t || '_owner_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())', t || '_owner_insert', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin()) WITH CHECK (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())', t || '_owner_update', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())', t || '_owner_delete', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "restaurant_payout_settings_owner_select" ON public.restaurant_payout_settings;
CREATE POLICY "restaurant_payout_settings_owner_select"
  ON public.restaurant_payout_settings
  FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());
GRANT SELECT ON public.restaurant_payout_settings TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_payout_settings FROM authenticated;

DO $$
DECLARE
  t text;
  branch_catalog_tables text[] := ARRAY[
    'restaurant_hours',
    'restaurant_service_areas',
    'restaurant_delivery_rules',
    'menu_categories'
  ];
BEGIN
  FOREACH t IN ARRAY branch_catalog_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Public read for ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_select', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_delete', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_public_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.auth_can_access_branch(branch_id))', t || '_owner_insert', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.auth_can_access_branch(branch_id)) WITH CHECK (public.auth_can_access_branch(branch_id))', t || '_owner_update', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.auth_can_access_branch(branch_id))', t || '_owner_delete', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "dishes_owner_insert" ON public.dishes;
DROP POLICY IF EXISTS "dishes_owner_update" ON public.dishes;
DROP POLICY IF EXISTS "dishes_owner_delete" ON public.dishes;
CREATE POLICY "dishes_owner_insert" ON public.dishes FOR INSERT TO authenticated WITH CHECK (public.auth_can_manage_menu_category(menu_category_id));
CREATE POLICY "dishes_owner_update" ON public.dishes FOR UPDATE TO authenticated USING (public.auth_can_manage_dish(id)) WITH CHECK (public.auth_can_manage_menu_category(menu_category_id));
CREATE POLICY "dishes_owner_delete" ON public.dishes FOR DELETE TO authenticated USING (public.auth_can_manage_dish(id));
GRANT SELECT ON public.dishes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dishes TO authenticated;

DO $$
DECLARE
  t text;
  dish_tables text[] := ARRAY[
    'dish_variants',
    'dish_modifier_groups',
    'dish_images',
    'dish_tags',
    'dish_allergens',
    'dish_availability_windows'
  ];
BEGIN
  FOREACH t IN ARRAY dish_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Public read for ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_select', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_delete', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_public_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.auth_can_manage_dish(dish_id))', t || '_owner_insert', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.auth_can_manage_dish(dish_id)) WITH CHECK (public.auth_can_manage_dish(dish_id))', t || '_owner_update', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.auth_can_manage_dish(dish_id))', t || '_owner_delete', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "dish_modifier_options_public_select" ON public.dish_modifier_options;
DROP POLICY IF EXISTS "dish_modifier_options_owner_insert" ON public.dish_modifier_options;
DROP POLICY IF EXISTS "dish_modifier_options_owner_update" ON public.dish_modifier_options;
DROP POLICY IF EXISTS "dish_modifier_options_owner_delete" ON public.dish_modifier_options;
CREATE POLICY "dish_modifier_options_public_select" ON public.dish_modifier_options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dish_modifier_options_owner_insert" ON public.dish_modifier_options FOR INSERT TO authenticated WITH CHECK (public.auth_can_manage_dish_modifier_group(group_id));
CREATE POLICY "dish_modifier_options_owner_update" ON public.dish_modifier_options FOR UPDATE TO authenticated USING (public.auth_can_manage_dish_modifier_group(group_id)) WITH CHECK (public.auth_can_manage_dish_modifier_group(group_id));
CREATE POLICY "dish_modifier_options_owner_delete" ON public.dish_modifier_options FOR DELETE TO authenticated USING (public.auth_can_manage_dish_modifier_group(group_id));
GRANT SELECT ON public.dish_modifier_options TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dish_modifier_options TO authenticated;

DROP POLICY IF EXISTS "inventory_items_owner_select" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_owner_insert" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_owner_update" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_owner_delete" ON public.inventory_items;
CREATE POLICY "inventory_items_owner_select" ON public.inventory_items FOR SELECT TO authenticated USING (public.auth_can_access_branch(branch_id));
CREATE POLICY "inventory_items_owner_insert" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (public.auth_can_access_branch(branch_id));
CREATE POLICY "inventory_items_owner_update" ON public.inventory_items FOR UPDATE TO authenticated USING (public.auth_can_access_branch(branch_id)) WITH CHECK (public.auth_can_access_branch(branch_id));
CREATE POLICY "inventory_items_owner_delete" ON public.inventory_items FOR DELETE TO authenticated USING (public.auth_can_access_branch(branch_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
REVOKE ALL ON public.inventory_items FROM anon;

DROP POLICY IF EXISTS "inventory_movements_owner_select" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_owner_insert" ON public.inventory_movements;
CREATE POLICY "inventory_movements_owner_select" ON public.inventory_movements FOR SELECT TO authenticated USING (public.auth_can_manage_inventory_item(inventory_item_id));
CREATE POLICY "inventory_movements_owner_insert" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (public.auth_can_manage_inventory_item(inventory_item_id));
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
REVOKE UPDATE, DELETE ON public.inventory_movements FROM authenticated;
REVOKE ALL ON public.inventory_movements FROM anon;

DROP POLICY IF EXISTS "Users manage own carts" ON public.carts;
DROP POLICY IF EXISTS "carts_owner_select" ON public.carts;
DROP POLICY IF EXISTS "carts_owner_insert" ON public.carts;
DROP POLICY IF EXISTS "carts_owner_update" ON public.carts;
DROP POLICY IF EXISTS "carts_owner_delete" ON public.carts;
CREATE POLICY "carts_owner_select" ON public.carts FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());
CREATE POLICY "carts_owner_insert" ON public.carts FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) OR public.auth_is_admin());
CREATE POLICY "carts_owner_update" ON public.carts FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin()) WITH CHECK (user_id = (SELECT auth.uid()) OR public.auth_is_admin());
CREATE POLICY "carts_owner_delete" ON public.carts FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;

DROP POLICY IF EXISTS "Users manage own cart_items" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_owner_select" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_owner_insert" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_owner_update" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_owner_delete" ON public.cart_items;
CREATE POLICY "cart_items_owner_select" ON public.cart_items FOR SELECT TO authenticated USING (public.auth_can_access_cart(cart_id));
CREATE POLICY "cart_items_owner_insert" ON public.cart_items FOR INSERT TO authenticated WITH CHECK (public.auth_can_access_cart(cart_id));
CREATE POLICY "cart_items_owner_update" ON public.cart_items FOR UPDATE TO authenticated USING (public.auth_can_access_cart(cart_id)) WITH CHECK (public.auth_can_access_cart(cart_id));
CREATE POLICY "cart_items_owner_delete" ON public.cart_items FOR DELETE TO authenticated USING (public.auth_can_access_cart(cart_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;

DROP POLICY IF EXISTS "cart_item_modifiers_owner_select" ON public.cart_item_modifiers;
DROP POLICY IF EXISTS "cart_item_modifiers_owner_insert" ON public.cart_item_modifiers;
DROP POLICY IF EXISTS "cart_item_modifiers_owner_update" ON public.cart_item_modifiers;
DROP POLICY IF EXISTS "cart_item_modifiers_owner_delete" ON public.cart_item_modifiers;
CREATE POLICY "cart_item_modifiers_owner_select" ON public.cart_item_modifiers FOR SELECT TO authenticated USING (public.auth_can_access_cart_item(cart_item_id));
CREATE POLICY "cart_item_modifiers_owner_insert" ON public.cart_item_modifiers FOR INSERT TO authenticated WITH CHECK (public.auth_can_access_cart_item(cart_item_id));
CREATE POLICY "cart_item_modifiers_owner_update" ON public.cart_item_modifiers FOR UPDATE TO authenticated USING (public.auth_can_access_cart_item(cart_item_id)) WITH CHECK (public.auth_can_access_cart_item(cart_item_id));
CREATE POLICY "cart_item_modifiers_owner_delete" ON public.cart_item_modifiers FOR DELETE TO authenticated USING (public.auth_can_access_cart_item(cart_item_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_item_modifiers TO authenticated;

DO $$
DECLARE
  t text;
  order_child_tables text[] := ARRAY[
    'order_addresses',
    'order_status_history',
    'order_fees',
    'order_taxes',
    'order_notes',
    'order_issues',
    'order_refunds'
  ];
BEGIN
  FOREACH t IN ARRAY order_child_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_participant_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.auth_can_access_order(order_id))', t || '_participant_select', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "order_items_participant_select" ON public.order_items;
CREATE POLICY "order_items_participant_select" ON public.order_items FOR SELECT TO authenticated USING (public.auth_can_access_order(order_id));
GRANT SELECT ON public.order_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;

DROP POLICY IF EXISTS "order_item_modifiers_participant_select" ON public.order_item_modifiers;
CREATE POLICY "order_item_modifiers_participant_select"
  ON public.order_item_modifiers
  FOR SELECT TO authenticated
  USING (public.auth_can_access_order_item(order_item_id));
GRANT SELECT ON public.order_item_modifiers TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_item_modifiers FROM authenticated;

DROP POLICY IF EXISTS "reservation_status_history_participant_select" ON public.reservation_status_history;
CREATE POLICY "reservation_status_history_participant_select"
  ON public.reservation_status_history
  FOR SELECT TO authenticated
  USING (public.auth_can_access_reservation_record(reservation_id));
GRANT SELECT ON public.reservation_status_history TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reservation_status_history FROM authenticated;

DROP POLICY IF EXISTS "delivery_batches_courier_select" ON public.delivery_batches;
CREATE POLICY "delivery_batches_courier_select"
  ON public.delivery_batches
  FOR SELECT TO authenticated
  USING (public.auth_is_admin() OR public.auth_owns_courier(courier_id));
GRANT SELECT ON public.delivery_batches TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.delivery_batches FROM authenticated;

DROP POLICY IF EXISTS "delivery_routes_participant_select" ON public.delivery_routes;
CREATE POLICY "delivery_routes_participant_select"
  ON public.delivery_routes
  FOR SELECT TO authenticated
  USING (public.auth_can_view_dispatch_job(dispatch_job_id));
GRANT SELECT ON public.delivery_routes TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.delivery_routes FROM authenticated;

DROP POLICY IF EXISTS "payout_batches_admin_select" ON public.payout_batches;
CREATE POLICY "payout_batches_admin_select"
  ON public.payout_batches
  FOR SELECT TO authenticated
  USING (public.auth_is_admin());
GRANT SELECT ON public.payout_batches TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payout_batches FROM authenticated;

DROP POLICY IF EXISTS "payouts_recipient_select" ON public.payouts;
CREATE POLICY "payouts_recipient_select"
  ON public.payouts
  FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR (recipient_type = 'restaurant' AND public.auth_owns_restaurant(recipient_id))
    OR (recipient_type = 'courier' AND public.auth_owns_courier(recipient_id))
  );
GRANT SELECT ON public.payouts TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payouts FROM authenticated;

DROP POLICY IF EXISTS "invoices_recipient_select" ON public.invoices;
CREATE POLICY "invoices_recipient_select"
  ON public.invoices
  FOR SELECT TO authenticated
  USING (public.auth_can_access_legacy_invoice(recipient_type, recipient_id, order_id));
GRANT SELECT ON public.invoices TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM authenticated;

DROP POLICY IF EXISTS "credit_notes_recipient_select" ON public.credit_notes;
CREATE POLICY "credit_notes_recipient_select"
  ON public.credit_notes
  FOR SELECT TO authenticated
  USING (public.auth_can_access_credit_note(invoice_id));
GRANT SELECT ON public.credit_notes TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_notes FROM authenticated;

DROP POLICY IF EXISTS "incident_reports_owner_select" ON public.incident_reports;
DROP POLICY IF EXISTS "incident_reports_owner_insert" ON public.incident_reports;
DROP POLICY IF EXISTS "incident_reports_admin_update" ON public.incident_reports;
CREATE POLICY "incident_reports_owner_select" ON public.incident_reports FOR SELECT TO authenticated USING (reporter_id = (SELECT auth.uid()) OR public.auth_is_admin());
CREATE POLICY "incident_reports_owner_insert" ON public.incident_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = (SELECT auth.uid()) OR public.auth_is_admin());
CREATE POLICY "incident_reports_admin_update" ON public.incident_reports FOR UPDATE TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
GRANT SELECT, INSERT, UPDATE ON public.incident_reports TO authenticated;
REVOKE DELETE ON public.incident_reports FROM authenticated;

DO $$
DECLARE
  t text;
  admin_read_tables text[] := ARRAY[
    'event_store',
    'feature_store',
    'ml_predictions'
  ];
BEGIN
  FOREACH t IN ARRAY admin_read_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Restrict read on analytics', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow anyone to insert ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can view their own ' || t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_select', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.auth_is_admin())', t || '_admin_select', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;

DROP POLICY IF EXISTS "Authenticated can insert emails" ON public.email_queue;
REVOKE INSERT, UPDATE, DELETE ON public.email_queue FROM authenticated;

NOTIFY pgrst, 'reload schema';
