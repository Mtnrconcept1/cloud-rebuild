-- Commercial demo accounts must never read or mutate the production
-- transaction model. The browser/domain guards are defence in depth; this
-- migration makes the account mapping authoritative at the database layer.

BEGIN;

-- Internal predicate used by privileged trigger/RPC code. It fails closed for
-- every durable signal of a managed commercial identity: role, mapping (active
-- or inactive), or Auth account type. Extra roles must never reopen production.
CREATE OR REPLACE FUNCTION public.commercial_demo_user_is_restricted(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_roles AS commercial_role
        WHERE commercial_role.user_id = p_user_id
          AND commercial_role.role = 'commercial'::public.app_role
      )
      OR EXISTS (
        SELECT 1
        FROM public.commercial_demo_accounts AS account
        WHERE account.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM auth.users AS managed_user
        WHERE managed_user.id = p_user_id
          AND lower(btrim(COALESCE(
            managed_user.raw_app_meta_data ->> 'account_type',
            ''
          ))) = 'commercial_demo'
      )
    )
$$;

REVOKE ALL
  ON FUNCTION public.commercial_demo_user_is_restricted(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- A disabled mapping is a security tombstone, not an ordinary row that may be
-- deleted or reassigned. Deactivation remains possible through is_active.
CREATE OR REPLACE FUNCTION public.protect_commercial_demo_account_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'COMMERCIAL_DEMO_ACCOUNT_TOMBSTONE_REQUIRED: deactivate the mapping instead of deleting it'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.demo_restaurant_id IS DISTINCT FROM OLD.demo_restaurant_id THEN
    RAISE EXCEPTION
      'COMMERCIAL_DEMO_ACCOUNT_IDENTITY_IMMUTABLE: create a new managed account instead'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL
  ON FUNCTION public.protect_commercial_demo_account_boundary()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS protect_commercial_demo_account_boundary
  ON public.commercial_demo_accounts;
CREATE TRIGGER protect_commercial_demo_account_boundary
  BEFORE UPDATE OR DELETE ON public.commercial_demo_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_commercial_demo_account_boundary();

-- RLS-safe, caller-scoped helpers. They expose only the caller's own boolean
-- status and mapped demo restaurant; they cannot enumerate another account.
CREATE OR REPLACE FUNCTION public.commercial_demo_current_user_is_restricted()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.commercial_demo_user_is_restricted(auth.uid())
$$;

REVOKE ALL
  ON FUNCTION public.commercial_demo_current_user_is_restricted()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.commercial_demo_current_user_is_restricted()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_demo_current_restaurant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT account.demo_restaurant_id
  FROM public.commercial_demo_accounts AS account
  JOIN public.restaurants AS demo_restaurant
    ON demo_restaurant.id = account.demo_restaurant_id
   AND demo_restaurant.is_demo IS TRUE
  WHERE account.user_id = auth.uid()
    AND account.is_active
    AND public.commercial_demo_user_is_restricted(account.user_id)
  LIMIT 1
$$;

REVOKE ALL
  ON FUNCTION public.commercial_demo_current_restaurant_id()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.commercial_demo_current_restaurant_id()
  TO authenticated;

-- These three helpers are already referenced by restrictive policies on the
-- wider restaurant graph (offers, formulas, branches, posts, finance, AI,
-- etc.). Make that entire graph inherit the commercial scope. Missing parent
-- rows now fail closed instead of the previous COALESCE(..., true) fallback.
CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN public.commercial_demo_current_user_is_restricted() THEN
        demo_candidate.is_demo IS TRUE
        AND demo_candidate.id = public.commercial_demo_current_restaurant_id()
      ELSE
        demo_candidate.is_demo IS FALSE
        OR demo_candidate.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roles AS admin_role
          WHERE admin_role.user_id = auth.uid()
            AND admin_role.role = 'admin'::public.app_role
        )
    END
    FROM public.restaurants AS demo_candidate
    WHERE demo_candidate.id = p_restaurant_id
  ), false)
$$;

REVOKE ALL
  ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_branch(
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT public.can_view_commercial_demo_restaurant(branch.restaurant_id)
    FROM public.restaurant_branches AS branch
    WHERE branch.id = p_branch_id
  ), false)
$$;

REVOKE ALL
  ON FUNCTION public.can_view_commercial_demo_branch(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.can_view_commercial_demo_branch(uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_post(
  p_post_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT public.can_view_commercial_demo_restaurant(post.restaurant_id)
    FROM public.social_posts AS post
    WHERE post.id = p_post_id
  ), false)
$$;

REVOKE ALL
  ON FUNCTION public.can_view_commercial_demo_post(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.can_view_commercial_demo_post(uuid)
  TO anon, authenticated, service_role;

-- A commercial account gets one additional permissive path to its mapped demo
-- restaurant. The restrictive policies then remove every other restaurant and
-- menu row, even when another broad/public SELECT policy also matches.
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_demo_select_mapped_restaurant
  ON public.restaurants;
CREATE POLICY commercial_demo_select_mapped_restaurant
  ON public.restaurants
  FOR SELECT
  TO authenticated
  USING (
    public.commercial_demo_current_user_is_restricted()
    AND id = public.commercial_demo_current_restaurant_id()
  );

DROP POLICY IF EXISTS scope_production_restaurants_for_commercial_demo_accounts
  ON public.restaurants;
CREATE POLICY scope_production_restaurants_for_commercial_demo_accounts
  ON public.restaurants
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.commercial_demo_current_user_is_restricted()
    OR id = public.commercial_demo_current_restaurant_id()
  );

DROP POLICY IF EXISTS block_commercial_demo_restaurant_insert
  ON public.restaurants;
CREATE POLICY block_commercial_demo_restaurant_insert
  ON public.restaurants
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.commercial_demo_current_user_is_restricted());

DROP POLICY IF EXISTS block_commercial_demo_restaurant_update
  ON public.restaurants;
CREATE POLICY block_commercial_demo_restaurant_update
  ON public.restaurants
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.commercial_demo_current_user_is_restricted())
  WITH CHECK (NOT public.commercial_demo_current_user_is_restricted());

DROP POLICY IF EXISTS block_commercial_demo_restaurant_delete
  ON public.restaurants;
CREATE POLICY block_commercial_demo_restaurant_delete
  ON public.restaurants
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.commercial_demo_current_user_is_restricted());

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_demo_select_mapped_menu_items
  ON public.menu_items;
CREATE POLICY commercial_demo_select_mapped_menu_items
  ON public.menu_items
  FOR SELECT
  TO authenticated
  USING (
    public.commercial_demo_current_user_is_restricted()
    AND restaurant_id = public.commercial_demo_current_restaurant_id()
  );

DROP POLICY IF EXISTS scope_production_menu_items_for_commercial_demo_accounts
  ON public.menu_items;
CREATE POLICY scope_production_menu_items_for_commercial_demo_accounts
  ON public.menu_items
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.commercial_demo_current_user_is_restricted()
    OR restaurant_id = public.commercial_demo_current_restaurant_id()
  );

DROP POLICY IF EXISTS block_commercial_demo_menu_item_insert
  ON public.menu_items;
CREATE POLICY block_commercial_demo_menu_item_insert
  ON public.menu_items
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.commercial_demo_current_user_is_restricted());

DROP POLICY IF EXISTS block_commercial_demo_menu_item_update
  ON public.menu_items;
CREATE POLICY block_commercial_demo_menu_item_update
  ON public.menu_items
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.commercial_demo_current_user_is_restricted())
  WITH CHECK (NOT public.commercial_demo_current_user_is_restricted());

DROP POLICY IF EXISTS block_commercial_demo_menu_item_delete
  ON public.menu_items;
CREATE POLICY block_commercial_demo_menu_item_delete
  ON public.menu_items
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.commercial_demo_current_user_is_restricted());

-- Authenticated commercial accounts get no direct access to any production
-- cart/order/reservation/payment/subscription row. All simulated state lives in
-- commercial_demo_* and is exposed through the dedicated snapshot/RPC layer.
DO $commercial_demo_transaction_rls$
DECLARE
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'carts',
    'cart_items',
    'cart_item_modifiers',
    'orders',
    'order_items',
    'order_item_modifiers',
    'order_addresses',
    'order_events',
    'order_fees',
    'order_issues',
    'order_notes',
    'order_refunds',
    'order_status_history',
    'order_taxes',
    'order_groups',
    'group_members',
    'group_member_orders',
    'reservations',
    'reservation_slots',
    'reservation_status_history',
    'payments',
    'payment_intents',
    'payment_transactions',
    'stripe_checkout_sessions',
    'financial_ledger',
    'platform_revenue_entries',
    'platform_cost_entries',
    'restaurant_invoices',
    'restaurant_invoice_line_items',
    'restaurant_credit_ledger',
    'restaurant_credit_purchases',
    'restaurant_subscriptions',
    'subscriptions',
    'invoices',
    'invoice_line_items',
    'credit_notes',
    'delivery_tracking',
    'dispatch_jobs',
    'commercial_commissions',
    'commercial_compensation_adjustments',
    'user_payment_methods',
    'tok_one_subscriptions',
    'user_subscriptions',
    'user_meal_subscription_settings',
    'chef_table_checkout_holds'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table_name)) IS NULL THEN
      RAISE WARNING 'Commercial demo isolation skipped missing table public.%', v_table_name;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);
    EXECUTE format(
      'DROP POLICY IF EXISTS block_production_access_for_commercial_demo_accounts ON public.%I',
      v_table_name
    );
    EXECUTE format(
      'CREATE POLICY block_production_access_for_commercial_demo_accounts '
      || 'ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (NOT public.commercial_demo_current_user_is_restricted()) '
      || 'WITH CHECK (NOT public.commercial_demo_current_user_is_restricted())',
      v_table_name
    );
  END LOOP;
END
$commercial_demo_transaction_rls$;

-- This trigger is the service-role backstop. It checks both OLD and NEW, the
-- authenticated actor when present, direct subject columns, metadata subjects,
-- and subjects reachable through transaction parents. Thus a webhook/Edge
-- Function cannot accidentally write a production payment for a commercial
-- demo identity merely because service_role bypasses RLS.
CREATE OR REPLACE FUNCTION public.block_commercial_demo_account_production_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb[] := ARRAY[]::jsonb[];
  v_row jsonb;
  v_key text;
  v_raw_id text;
  v_subject_user_id uuid;
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF public.commercial_demo_user_is_restricted(auth.uid()) THEN
    RAISE EXCEPTION
      'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_rows := array_append(v_rows, to_jsonb(OLD));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_rows := array_append(v_rows, to_jsonb(NEW));
  END IF;

  FOREACH v_row IN ARRAY v_rows
  LOOP
    -- Service-role writes do not carry auth.uid(). Reject production rows that
    -- target a demo restaurant even when the payload has no user subject.
    v_raw_id := NULLIF(v_row ->> 'restaurant_id', '');
    IF v_raw_id ~* v_uuid_pattern
      AND public.restaurant_is_demo(v_raw_id::uuid) THEN
      RAISE EXCEPTION
        'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
        USING ERRCODE = '42501';
    END IF;

    -- Direct subjects used by current production tables.
    FOREACH v_key IN ARRAY ARRAY[
      'user_id',
      'customer_id',
      'creator_id',
      'purchased_by',
      'changed_by',
      'reporter_id',
      'author_id'
    ]
    LOOP
      v_raw_id := NULLIF(v_row ->> v_key, '');
      IF v_raw_id ~* v_uuid_pattern
        AND public.commercial_demo_user_is_restricted(v_raw_id::uuid) THEN
        RAISE EXCEPTION
          'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
          USING ERRCODE = '42501';
      END IF;
    END LOOP;

    -- Service-role payloads sometimes carry the subject only in metadata.
    IF jsonb_typeof(v_row -> 'metadata') = 'object' THEN
      FOREACH v_key IN ARRAY ARRAY[
        'user_id',
        'customer_id',
        'commercial_user_id',
        '_internal_user_id'
      ]
      LOOP
        v_raw_id := NULLIF((v_row -> 'metadata') ->> v_key, '');
        IF v_raw_id ~* v_uuid_pattern
          AND public.commercial_demo_user_is_restricted(v_raw_id::uuid) THEN
          RAISE EXCEPTION
            'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
            USING ERRCODE = '42501';
        END IF;
      END LOOP;
    END IF;

    -- Resolve child rows back to the user owning the production transaction.
    v_raw_id := NULLIF(v_row ->> 'order_id', '');
    IF v_raw_id ~* v_uuid_pattern THEN
      SELECT production_order.user_id
      INTO v_subject_user_id
      FROM public.orders AS production_order
      WHERE production_order.id = v_raw_id::uuid;

      IF public.commercial_demo_user_is_restricted(v_subject_user_id) THEN
        RAISE EXCEPTION
          'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_raw_id := NULLIF(v_row ->> 'order_item_id', '');
    IF v_raw_id ~* v_uuid_pattern THEN
      SELECT production_order.user_id
      INTO v_subject_user_id
      FROM public.order_items AS production_item
      JOIN public.orders AS production_order
        ON production_order.id = production_item.order_id
      WHERE production_item.id = v_raw_id::uuid;

      IF public.commercial_demo_user_is_restricted(v_subject_user_id) THEN
        RAISE EXCEPTION
          'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_raw_id := NULLIF(v_row ->> 'reservation_id', '');
    IF v_raw_id ~* v_uuid_pattern THEN
      SELECT production_reservation.user_id
      INTO v_subject_user_id
      FROM public.reservations AS production_reservation
      WHERE production_reservation.id = v_raw_id::uuid;

      IF public.commercial_demo_user_is_restricted(v_subject_user_id) THEN
        RAISE EXCEPTION
          'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_raw_id := NULLIF(v_row ->> 'group_id', '');
    IF v_raw_id ~* v_uuid_pattern THEN
      SELECT production_group.creator_id
      INTO v_subject_user_id
      FROM public.order_groups AS production_group
      WHERE production_group.id = v_raw_id::uuid;

      IF public.commercial_demo_user_is_restricted(v_subject_user_id) THEN
        RAISE EXCEPTION
          'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_raw_id := NULLIF(v_row ->> 'cart_id', '');
    IF v_raw_id ~* v_uuid_pattern THEN
      SELECT production_cart.user_id
      INTO v_subject_user_id
      FROM public.carts AS production_cart
      WHERE production_cart.id = v_raw_id::uuid;

      IF public.commercial_demo_user_is_restricted(v_subject_user_id) THEN
        RAISE EXCEPTION
          'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_raw_id := NULLIF(v_row ->> 'cart_item_id', '');
    IF v_raw_id ~* v_uuid_pattern THEN
      SELECT production_cart.user_id
      INTO v_subject_user_id
      FROM public.cart_items AS production_item
      JOIN public.carts AS production_cart
        ON production_cart.id = production_item.cart_id
      WHERE production_item.id = v_raw_id::uuid;

      IF public.commercial_demo_user_is_restricted(v_subject_user_id) THEN
        RAISE EXCEPTION
          'COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED: use commercial_demo_* RPCs'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

REVOKE ALL
  ON FUNCTION public.block_commercial_demo_account_production_transaction()
  FROM PUBLIC, anon, authenticated, service_role;

DO $commercial_demo_transaction_triggers$
DECLARE
  v_table_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'carts',
    'cart_items',
    'cart_item_modifiers',
    'orders',
    'order_items',
    'order_item_modifiers',
    'order_addresses',
    'order_events',
    'order_fees',
    'order_issues',
    'order_notes',
    'order_refunds',
    'order_status_history',
    'order_taxes',
    'order_groups',
    'group_members',
    'group_member_orders',
    'reservations',
    'reservation_slots',
    'reservation_status_history',
    'payments',
    'payment_intents',
    'payment_transactions',
    'stripe_checkout_sessions',
    'financial_ledger',
    'platform_revenue_entries',
    'platform_cost_entries',
    'restaurant_invoices',
    'restaurant_invoice_line_items',
    'restaurant_credit_ledger',
    'restaurant_credit_purchases',
    'restaurant_subscriptions',
    'subscriptions',
    'invoices',
    'invoice_line_items',
    'credit_notes',
    'delivery_tracking',
    'dispatch_jobs',
    'commercial_commissions',
    'commercial_compensation_adjustments',
    'user_payment_methods',
    'tok_one_subscriptions',
    'user_subscriptions',
    'user_meal_subscription_settings',
    'chef_table_checkout_holds'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS block_commercial_demo_account_production_transaction ON public.%I',
      v_table_name
    );
    EXECUTE format(
      'CREATE TRIGGER block_commercial_demo_account_production_transaction '
      || 'BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION '
      || 'public.block_commercial_demo_account_production_transaction()',
      v_table_name
    );
  END LOOP;
END
$commercial_demo_transaction_triggers$;

-- SQL-language SECURITY DEFINER functions cannot receive the PL/pgSQL BEGIN
-- guard below. This non-public assertion is prepended as a first SQL statement
-- to selected catalog/feed RPCs; their original final SELECT remains the
-- function result.
CREATE OR REPLACE FUNCTION public.assert_commercial_demo_production_rpc_allowed()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION
      'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;
END
$$;

REVOKE ALL
  ON FUNCTION public.assert_commercial_demo_production_rpc_allowed()
  FROM PUBLIC, anon, authenticated, service_role;

-- SECURITY DEFINER RPCs bypass table RLS. Add a fail-closed account guard to
-- the known production read/write RPCs without copying their implementation or
-- changing their signatures/ACLs. CREATE OR REPLACE preserves each function's
-- existing grants. The marker makes this block idempotent on a replay.
DO $commercial_demo_rpc_hardening$
DECLARE
  v_proc record;
  v_definition text;
  v_guarded_definition text;
  v_marker constant text := 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED';
  -- pg_get_functiondef preserves the original body's keyword casing. Search
  -- against a lower-cased copy so `begin`, `BEGIN`, and mixed-case bodies all
  -- receive the same guard, while overlaying the untouched definition.
  v_lf_needle constant text := E'\nbegin\n';
  v_crlf_needle constant text := E'\r\nbegin\r\n';
  v_lf_replacement constant text :=
    E'\nBEGIN\n  IF public.commercial_demo_current_user_is_restricted() THEN\n'
    || E'    RAISE EXCEPTION ''COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs''\n'
    || E'      USING ERRCODE = ''42501'';\n  END IF;\n';
  v_crlf_replacement constant text :=
    E'\r\nBEGIN\r\n  IF public.commercial_demo_current_user_is_restricted() THEN\r\n'
    || E'    RAISE EXCEPTION ''COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs''\r\n'
    || E'      USING ERRCODE = ''42501'';\r\n  END IF;\r\n';
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.oid::regprocedure AS identity
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language AS l
      ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND l.lanname = 'plpgsql'
      AND p.proname = ANY (ARRAY[
        'apply_checkout_benefits',
        'apply_reservation_loyalty_points',
        'cancel_order_by_customer',
        'cancel_order_by_restaurant',
        'cancel_reservation_by_customer',
        'cancel_reservation_by_restaurant',
        'create_match_group',
        'create_order_with_items',
        'get_customer_orders_dashboard',
        'get_order_customers',
        'get_payout_invoice_lines',
        'get_reservation_customers',
        'get_reservation_fee_invoice_lines',
        'get_restaurant_orders_dashboard',
        'get_restaurant_payment_history',
        'get_restaurant_performance',
        'get_restaurant_reservation_slot_availability',
        'get_restaurant_subscription_self_service_state',
        'mark_order_seen_by_restaurant',
        'restaurant_actualites_subscription_plan',
        'search_restaurants_catalog',
        'signup_restaurateur_onboarding_payment_ready',
        'track_order_event',
        'update_restaurant_reservation_status_safe',
        'upsert_match_group_member_order',
        'validate_and_create_reservation',
        'validate_and_create_reservation_safe'
      ]::name[])
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_proc.oid);

    IF position(v_marker IN v_definition) > 0 THEN
      CONTINUE;
    END IF;

    IF position(v_lf_needle IN lower(v_definition)) > 0 THEN
      v_guarded_definition := overlay(
        v_definition
        PLACING v_lf_replacement
        FROM position(v_lf_needle IN lower(v_definition))
        FOR char_length(v_lf_needle)
      );
    ELSIF position(v_crlf_needle IN lower(v_definition)) > 0 THEN
      v_guarded_definition := overlay(
        v_definition
        PLACING v_crlf_replacement
        FROM position(v_crlf_needle IN lower(v_definition))
        FOR char_length(v_crlf_needle)
      );
    ELSE
      RAISE WARNING
        'Commercial demo RPC guard not injected into %: top-level BEGIN not found',
        v_proc.identity;
      CONTINUE;
    END IF;

    EXECUTE v_guarded_definition;
  END LOOP;
END
$commercial_demo_rpc_hardening$;

DO $commercial_demo_sql_rpc_hardening$
DECLARE
  v_proc record;
  v_definition text;
  v_guarded_definition text;
  v_marker constant text := 'assert_commercial_demo_production_rpc_allowed';
  v_lf_needle constant text := E'AS $function$\n';
  v_crlf_needle constant text := E'AS $function$\r\n';
  v_lf_replacement constant text :=
    E'AS $function$\n  SELECT public.assert_commercial_demo_production_rpc_allowed();\n';
  v_crlf_replacement constant text :=
    E'AS $function$\r\n  SELECT public.assert_commercial_demo_production_rpc_allowed();\r\n';
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.oid::regprocedure AS identity
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language AS l
      ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND l.lanname = 'sql'
      AND p.proname = ANY (ARRAY[
        'apply_checkout_benefits',
        'apply_reservation_loyalty_points',
        'cancel_order_by_customer',
        'cancel_order_by_restaurant',
        'cancel_reservation_by_customer',
        'cancel_reservation_by_restaurant',
        'create_match_group',
        'create_order_with_items',
        'get_customer_orders_dashboard',
        'get_match_group_public_feed',
        'get_order_customers',
        'get_payout_invoice_lines',
        'get_reservation_customers',
        'get_reservation_fee_invoice_lines',
        'get_restaurant_orders_dashboard',
        'get_restaurant_payment_history',
        'get_restaurant_performance',
        'get_restaurant_reservation_slot_availability',
        'get_restaurant_subscription_self_service_state',
        'get_social_feed_premium_banners',
        'mark_order_seen_by_restaurant',
        'restaurant_actualites_subscription_plan',
        'search_restaurants_catalog',
        'signup_restaurateur_onboarding_payment_ready',
        'track_order_event',
        'update_restaurant_reservation_status_safe',
        'upsert_match_group_member_order',
        'validate_and_create_reservation',
        'validate_and_create_reservation_safe'
      ]::name[])
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_proc.oid);

    IF position(v_marker IN v_definition) > 0 THEN
      CONTINUE;
    END IF;

    IF position(v_lf_needle IN v_definition) > 0 THEN
      v_guarded_definition := overlay(
        v_definition
        PLACING v_lf_replacement
        FROM position(v_lf_needle IN v_definition)
        FOR char_length(v_lf_needle)
      );
    ELSIF position(v_crlf_needle IN v_definition) > 0 THEN
      v_guarded_definition := overlay(
        v_definition
        PLACING v_crlf_replacement
        FROM position(v_crlf_needle IN v_definition)
        FOR char_length(v_crlf_needle)
      );
    ELSE
      RAISE WARNING
        'Commercial demo SQL RPC guard not injected into %: body delimiter not found',
        v_proc.identity;
      CONTINUE;
    END IF;

    EXECUTE v_guarded_definition;
  END LOOP;
END
$commercial_demo_sql_rpc_hardening$;

-- These helpers reveal or calculate production payment state and have no
-- browser call site. Keep them service-role only instead of relying on RLS
-- beneath SECURITY DEFINER.
DO $commercial_demo_sensitive_rpc_revoke$
BEGIN
  IF to_regprocedure('public.restaurant_stripe_connect_ready(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.restaurant_stripe_connect_ready(uuid) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.restaurant_stripe_connect_ready(uuid) TO service_role';
  END IF;

  IF to_regprocedure('public.compute_restaurant_reservation_fees(uuid,date,date)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid,date,date) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid,date,date) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid,date,date) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid,date,date) TO service_role';
  END IF;
END
$commercial_demo_sensitive_rpc_revoke$;

-- Do not silently deploy when a protected authenticated SECURITY DEFINER RPC
-- used an unexpected language/body shape and could not receive the guard.
DO $commercial_demo_rpc_guard_assertion$
DECLARE
  v_proc record;
  v_definition text;
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.oid::regprocedure AS identity
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname = ANY (ARRAY[
        'apply_checkout_benefits',
        'apply_reservation_loyalty_points',
        'cancel_order_by_customer',
        'cancel_order_by_restaurant',
        'cancel_reservation_by_customer',
        'cancel_reservation_by_restaurant',
        'create_match_group',
        'create_order_with_items',
        'get_customer_orders_dashboard',
        'get_match_group_public_feed',
        'get_order_customers',
        'get_payout_invoice_lines',
        'get_reservation_customers',
        'get_reservation_fee_invoice_lines',
        'get_restaurant_orders_dashboard',
        'get_restaurant_payment_history',
        'get_restaurant_performance',
        'get_restaurant_reservation_slot_availability',
        'get_restaurant_subscription_self_service_state',
        'get_social_feed_premium_banners',
        'mark_order_seen_by_restaurant',
        'restaurant_actualites_subscription_plan',
        'search_restaurants_catalog',
        'signup_restaurateur_onboarding_payment_ready',
        'track_order_event',
        'update_restaurant_reservation_status_safe',
        'upsert_match_group_member_order',
        'validate_and_create_reservation',
        'validate_and_create_reservation_safe'
      ]::name[])
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_proc.oid);
    IF position('COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED' IN v_definition) = 0
       AND position('assert_commercial_demo_production_rpc_allowed' IN v_definition) = 0 THEN
      RAISE EXCEPTION
        'COMMERCIAL_DEMO_RPC_GUARD_MISSING: % remains executable by authenticated',
        v_proc.identity
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END
$commercial_demo_rpc_guard_assertion$;

COMMENT ON FUNCTION public.commercial_demo_user_is_restricted(uuid) IS
  'Internal fail-closed predicate for any commercial role, durable mapping, or commercial_demo Auth identity.';
COMMENT ON FUNCTION public.commercial_demo_current_user_is_restricted() IS
  'Caller-scoped RLS predicate; returns only whether auth.uid() is a managed commercial identity.';
COMMENT ON FUNCTION public.commercial_demo_current_restaurant_id() IS
  'Returns only the authenticated commercial demo account own mapped demo restaurant id.';
COMMENT ON FUNCTION public.can_view_commercial_demo_restaurant(uuid) IS
  'Fail-closed restaurant graph scope: commercial users see only their mapped demo restaurant; other users retain the public/owner/admin behavior.';
COMMENT ON FUNCTION public.can_view_commercial_demo_branch(uuid) IS
  'Fail-closed branch scope derived from can_view_commercial_demo_restaurant.';
COMMENT ON FUNCTION public.can_view_commercial_demo_post(uuid) IS
  'Fail-closed social post scope derived from can_view_commercial_demo_restaurant.';
COMMENT ON FUNCTION public.block_commercial_demo_account_production_transaction() IS
  'Blocks authenticated and service-role production transaction mutations attributable to managed commercial identities or demo restaurants.';
COMMENT ON FUNCTION public.assert_commercial_demo_production_rpc_allowed() IS
  'Internal assertion prepended to SQL SECURITY DEFINER production RPCs for commercial demo isolation.';

COMMIT;
