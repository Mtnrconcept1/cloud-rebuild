-- Minimal isolated PostgreSQL fixture for audited objects, not a database backup.
-- Relevant column shapes/policies/functions derive from inspected production metadata.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('admin','client','restaurateur');
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 = 'c0000000-0000-4000-8000-000000000003'::uuid AND $2 = 'admin'::public.app_role $$;
CREATE FUNCTION public.commercial_demo_current_user_is_restricted() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.restaurants(id uuid PRIMARY KEY,owner_id uuid,is_demo boolean,is_active boolean,status text);
CREATE TABLE public.menu_items(id uuid PRIMARY KEY,restaurant_id uuid REFERENCES restaurants(id),is_available boolean);
CREATE TABLE public.orders(id uuid PRIMARY KEY,user_id uuid,restaurant_id uuid,total_amount numeric,delivery_fee numeric,metadata jsonb,order_number text,status text,updated_at timestamptz);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,loyalty_points integer);
CREATE TABLE public.promo_codes(id uuid PRIMARY KEY,is_active boolean,valid_from timestamptz,valid_until timestamptz,restaurant_id uuid,per_user_limit integer,max_uses integer,current_uses integer,is_first_order_only boolean,min_order_amount numeric,type text,value numeric,max_discount numeric);
CREATE TABLE public.promo_code_uses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,promo_code_id uuid REFERENCES promo_codes(id),order_id uuid REFERENCES orders(id),discount_applied numeric);
CREATE UNIQUE INDEX idx_promo_code_uses_order_once ON promo_code_uses(promo_code_id,user_id,order_id) WHERE order_id IS NOT NULL;
CREATE TABLE public.loyalty_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,order_id uuid,amount integer,transaction_type text,description text);
CREATE UNIQUE INDEX loyalty_order_once ON loyalty_transactions(user_id,order_id,transaction_type) WHERE order_id IS NOT NULL AND transaction_type='redeem';
CREATE TABLE public.rate_limit_buckets(function_name text,subject text,request_count integer,window_start timestamptz,last_hit_at timestamptz,PRIMARY KEY(function_name,subject));
CREATE TABLE public.print_orders(id uuid PRIMARY KEY);
CREATE TABLE public.print_fulfillment_jobs(id uuid PRIMARY KEY,print_order_id uuid REFERENCES print_orders(id));
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
CREATE POLICY "Users manage own promo_code_uses" ON promo_code_uses FOR ALL USING(auth.uid()=user_id);
CREATE POLICY promo_uses_own ON promo_code_uses FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY promo_uses_admin ON promo_code_uses FOR ALL TO authenticated USING(has_role((SELECT auth.uid()),'admin'));
CREATE POLICY "Anyone can view available menu items" ON menu_items FOR SELECT USING(is_available=true);
CREATE POLICY menu_items_public_select ON menu_items FOR SELECT USING(true);
CREATE POLICY menu_items_owner_all ON menu_items FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM restaurants r WHERE r.id=menu_items.restaurant_id AND r.owner_id=auth.uid()));
CREATE FUNCTION public.test_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION: %',label; END IF; END$$;
CREATE OR REPLACE FUNCTION public.apply_checkout_benefits(p_user_id uuid, p_order_id uuid, p_points_to_redeem integer DEFAULT 0, p_promo_code_id uuid DEFAULT NULL::uuid, p_discount_applied numeric DEFAULT 0, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_order_record public.orders%ROWTYPE;
  v_order_metadata jsonb;
  v_current_points integer := 0;
  v_points_applied integer := 0;
  v_existing_promo_use public.promo_code_uses%ROWTYPE;
  v_existing_uses integer := 0;
  v_non_failed_orders integer := 0;
  v_promo public.promo_codes%ROWTYPE;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_promo_discount numeric := 0;
BEGIN
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'user_id et order_id requis';
  END IF;

  IF NOT v_is_service_role THEN
    IF v_actor_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_user_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  SELECT *
  INTO v_order_record
  FROM public.orders
  WHERE id = p_order_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  v_order_metadata := COALESCE(v_order_record.metadata, '{}'::jsonb);

  IF COALESCE(p_points_to_redeem, 0) > 0 THEN
    SELECT COALESCE(abs(amount), 0)
    INTO v_points_applied
    FROM public.loyalty_transactions
    WHERE user_id = p_user_id
      AND order_id = p_order_id
      AND transaction_type = 'redeem'
    LIMIT 1;

    IF COALESCE(v_points_applied, 0) = 0 THEN
      SELECT loyalty_points
      INTO v_current_points
      FROM public.profiles
      WHERE user_id = p_user_id
      FOR UPDATE;

      IF COALESCE(v_current_points, 0) < p_points_to_redeem THEN
        RAISE EXCEPTION 'Points de fidelite insuffisants';
      END IF;

      INSERT INTO public.loyalty_transactions (
        user_id,
        order_id,
        amount,
        transaction_type,
        description
      )
      VALUES (
        p_user_id,
        p_order_id,
        -p_points_to_redeem,
        'redeem',
        COALESCE(p_description, format('Paiement commande %s', COALESCE(v_order_record.order_number, p_order_id::text)))
      )
      ON CONFLICT (user_id, order_id, transaction_type)
      WHERE order_id IS NOT NULL AND transaction_type = 'redeem'
      DO NOTHING
      RETURNING abs(amount) INTO v_points_applied;

      IF COALESCE(v_points_applied, 0) > 0 THEN
        UPDATE public.profiles
        SET loyalty_points = loyalty_points - v_points_applied
        WHERE user_id = p_user_id;
      ELSE
        SELECT COALESCE(abs(amount), 0)
        INTO v_points_applied
        FROM public.loyalty_transactions
        WHERE user_id = p_user_id
          AND order_id = p_order_id
          AND transaction_type = 'redeem'
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF p_promo_code_id IS NOT NULL THEN
    SELECT *
    INTO v_existing_promo_use
    FROM public.promo_code_uses
    WHERE promo_code_id = p_promo_code_id
      AND user_id = p_user_id
      AND order_id = p_order_id
    LIMIT 1;

    IF FOUND THEN
      v_promo_discount := COALESCE(v_existing_promo_use.discount_applied, 0);
    ELSE
      SELECT *
      INTO v_promo
      FROM public.promo_codes
      WHERE id = p_promo_code_id
        AND is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Code promo introuvable';
      END IF;

      IF v_promo.valid_from IS NOT NULL AND v_promo.valid_from > now() THEN
        RAISE EXCEPTION 'Ce code promo n''est pas encore actif';
      END IF;

      IF v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now() THEN
        RAISE EXCEPTION 'Ce code promo a expire';
      END IF;

      IF v_promo.restaurant_id IS NOT NULL AND v_promo.restaurant_id IS DISTINCT FROM v_order_record.restaurant_id THEN
        RAISE EXCEPTION 'Ce code promo n''est pas valable pour ce restaurant';
      END IF;

      SELECT count(*)
      INTO v_existing_uses
      FROM public.promo_code_uses
      WHERE promo_code_id = p_promo_code_id
        AND user_id = p_user_id;

      IF v_promo.per_user_limit IS NOT NULL AND v_existing_uses >= v_promo.per_user_limit THEN
        RAISE EXCEPTION 'Ce code promo a deja ete utilise';
      END IF;

      IF v_promo.max_uses IS NOT NULL AND COALESCE(v_promo.current_uses, 0) >= v_promo.max_uses THEN
        RAISE EXCEPTION 'Ce code promo a atteint sa limite d''utilisation';
      END IF;

      SELECT count(*)
      INTO v_non_failed_orders
      FROM public.orders
      WHERE user_id = p_user_id
        AND id <> p_order_id
        AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending_payment');

      IF COALESCE(v_promo.is_first_order_only, false) AND v_non_failed_orders > 0 THEN
        RAISE EXCEPTION 'Ce code promo est reserve a la premiere commande';
      END IF;

      v_subtotal := GREATEST(
        COALESCE(NULLIF(v_order_metadata ->> 'pre_discount_subtotal', '')::numeric, 0),
        COALESCE(v_order_record.total_amount, 0)
      );
      v_delivery_fee := GREATEST(COALESCE(v_order_record.delivery_fee, 0), 0);

      IF COALESCE(v_promo.min_order_amount, 0) > 0 AND v_subtotal < v_promo.min_order_amount THEN
        RAISE EXCEPTION 'Le montant minimum du code promo n''est pas atteint';
      END IF;

      IF v_promo.type = 'percentage' THEN
        v_promo_discount := round((v_subtotal * COALESCE(v_promo.value, 0) / 100.0)::numeric, 2);
        IF v_promo.max_discount IS NOT NULL THEN
          v_promo_discount := LEAST(v_promo_discount, v_promo.max_discount);
        END IF;
      ELSIF v_promo.type = 'fixed' THEN
        v_promo_discount := LEAST(v_subtotal, COALESCE(v_promo.value, 0));
      ELSIF v_promo.type = 'free_delivery' THEN
        v_promo_discount := v_delivery_fee;
      END IF;

      v_promo_discount := GREATEST(v_promo_discount, COALESCE(p_discount_applied, 0), 0);

      BEGIN
        INSERT INTO public.promo_code_uses (
          promo_code_id,
          user_id,
          order_id,
          discount_applied
        )
        VALUES (
          p_promo_code_id,
          p_user_id,
          p_order_id,
          v_promo_discount
        );

        UPDATE public.promo_codes
        SET current_uses = COALESCE(current_uses, 0) + 1
        WHERE id = p_promo_code_id;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;

      SELECT *
      INTO v_existing_promo_use
      FROM public.promo_code_uses
      WHERE promo_code_id = p_promo_code_id
        AND user_id = p_user_id
        AND order_id = p_order_id
      LIMIT 1;

      v_promo_discount := COALESCE(v_existing_promo_use.discount_applied, v_promo_discount, 0);
    END IF;
  END IF;

  IF COALESCE(v_points_applied, 0) > 0 OR COALESCE(v_promo_discount, 0) > 0 THEN
    UPDATE public.orders
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'points_redeemed', COALESCE(v_points_applied, 0),
      'promo_code_id', p_promo_code_id,
      'promo_code_discount_amount', COALESCE(v_promo_discount, 0)
    ),
        updated_at = now()
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'points_applied', COALESCE(v_points_applied, 0),
    'promo_discount_applied', COALESCE(v_promo_discount, 0)
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(p_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    -- A NULL restaurant means that the row is not scoped to a commercial-demo
    -- restaurant. Other permissive ownership/RBAC policies still decide
    -- whether it is visible.
    WHEN p_restaurant_id IS NULL THEN true
    ELSE COALESCE((
      SELECT restaurant.is_demo IS FALSE
        AND (
          (
            restaurant.is_active IS TRUE
            AND lower(COALESCE(restaurant.status, '')) = 'active'
          )
          OR restaurant.owner_id = (SELECT auth.uid())
          OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        )
      FROM public.restaurants AS restaurant
      WHERE restaurant.id = p_restaurant_id
    ), false)
  END
$function$
;
CREATE OR REPLACE FUNCTION public.rate_limit_consume(p_function_name text, p_subject text, p_max_requests integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current   integer;
  v_window    timestamptz;
  v_now       timestamptz := now();
  v_threshold timestamptz;
BEGIN
  IF p_function_name IS NULL OR p_subject IS NULL THEN
    RAISE EXCEPTION 'rate_limit_consume: function_name and subject must be non-null';
  END IF;
  IF p_max_requests <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'rate_limit_consume: max_requests and window_seconds must be positive';
  END IF;

  v_threshold := v_now - make_interval(secs => p_window_seconds);

  INSERT INTO public.rate_limit_buckets (function_name, subject, request_count, window_start, last_hit_at)
  VALUES (p_function_name, p_subject, 1, v_now, v_now)
  ON CONFLICT (function_name, subject) DO UPDATE
  SET request_count = CASE
        WHEN public.rate_limit_buckets.window_start < v_threshold THEN 1
        ELSE public.rate_limit_buckets.request_count + 1
      END,
      window_start = CASE
        WHEN public.rate_limit_buckets.window_start < v_threshold THEN v_now
        ELSE public.rate_limit_buckets.window_start
      END,
      last_hit_at = v_now
  RETURNING request_count INTO v_current;

  RETURN v_current <= p_max_requests;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION rate_limit_consume(text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rate_limit_consume(text,text,integer,integer) TO authenticated,service_role;
CREATE POLICY hide_commercial_demo_rows ON menu_items AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(can_view_commercial_demo_restaurant(restaurant_id));
