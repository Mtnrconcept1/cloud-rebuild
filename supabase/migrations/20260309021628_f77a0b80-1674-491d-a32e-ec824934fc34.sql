
-- 1. Table audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb DEFAULT '{}'::jsonb,
  new_data jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.audit_log FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert audit logs" ON public.audit_log FOR INSERT WITH CHECK (true);

-- 2. Table email_queue
CREATE TABLE IF NOT EXISTS public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body_html text,
  body_text text,
  status text DEFAULT 'queued',
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view email queue" ON public.email_queue FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 3. Audit trigger function
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

-- Attach audit triggers on sensitive tables
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_reservations AFTER INSERT OR UPDATE OR DELETE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_restaurants AFTER INSERT OR UPDATE OR DELETE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- 4. validate_and_create_reservation function
CREATE OR REPLACE FUNCTION public.validate_and_create_reservation(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text DEFAULT 'classique',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_existing integer;
  v_max_covers integer;
  v_opening_hours jsonb;
  v_service_key text;
  v_hour integer;
  v_dup_count integer;
  v_reservation_id uuid;
BEGIN
  -- Check for duplicate reservation (same user, restaurant, date, time)
  SELECT count(*) INTO v_dup_count
  FROM reservations
  WHERE user_id = auth.uid()
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'no_show');
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Vous avez déjà une réservation à cette date et heure.';
  END IF;

  -- Determine service period from time
  v_hour := EXTRACT(HOUR FROM p_time);
  IF v_hour < 15 THEN
    v_service_key := 'lunch';
  ELSE
    v_service_key := 'dinner';
  END IF;

  -- Get restaurant capacity from opening_hours
  SELECT opening_hours INTO v_opening_hours FROM restaurants WHERE id = p_restaurant_id;
  v_max_covers := COALESCE((v_opening_hours -> v_service_key ->> 'max_covers')::integer, 50);

  -- Count existing covers for this restaurant/date/service
  SELECT COALESCE(sum(party_size), 0) INTO v_existing
  FROM reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND status NOT IN ('cancelled', 'no_show')
    AND CASE
      WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM time) < 15
      ELSE EXTRACT(HOUR FROM time) >= 15
    END;

  IF v_existing + p_party_size > v_max_covers THEN
    RAISE EXCEPTION 'Capacité dépassée pour ce service. Places restantes : %', GREATEST(v_max_covers - v_existing, 0);
  END IF;

  -- Create the reservation
  INSERT INTO reservations (user_id, restaurant_id, date, time, party_size, feature, metadata, notes)
  VALUES (auth.uid(), p_restaurant_id, p_date, p_time, p_party_size, p_feature, p_metadata, p_notes)
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END; $$;

-- 5. cancel_reservation function with cancellation policy
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_reservation reservations%ROWTYPE;
  v_min_hours integer := 2; -- Minimum 2 hours before
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Réservation introuvable.';
  END IF;
  IF v_reservation.status IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Cette réservation est déjà annulée.';
  END IF;
  -- Check cancellation deadline
  IF (v_reservation.date + v_reservation.time) - INTERVAL '1 hour' * v_min_hours < now() THEN
    RAISE EXCEPTION 'Annulation impossible : le délai minimum de % heures n''est pas respecté.', v_min_hours;
  END IF;
  UPDATE reservations SET status = 'cancelled' WHERE id = p_reservation_id;
  RETURN true;
END; $$;

-- 6. Mark no-show function (to be called by scheduled edge function)
CREATE OR REPLACE FUNCTION public.mark_noshow_reservations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_count integer;
BEGIN
  UPDATE reservations SET status = 'no_show'
  WHERE status = 'pending'
    AND (date + time) < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- 7. Idempotency key on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text UNIQUE;

-- 8. RLS: public SELECT on restaurant_media
CREATE POLICY "Anyone can view restaurant media" ON public.restaurant_media FOR SELECT USING (true);

-- 9. Enhanced create_order_with_items with server-side price verification
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  restaurant_id_param uuid,
  delivery_address_param text,
  total_amount_param numeric,
  delivery_fee_param numeric DEFAULT 0,
  notes_param text DEFAULT NULL,
  items_param json DEFAULT NULL,
  metadata_param json DEFAULT NULL,
  checkout_id_param uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  new_order_id uuid;
  item json;
  v_real_price numeric;
  v_is_available boolean;
  v_verified_total numeric := 0;
  v_idempotency text;
BEGIN
  -- Generate idempotency key from checkout_id
  v_idempotency := COALESCE(checkout_id_param::text, gen_random_uuid()::text);

  -- Check idempotency
  SELECT id INTO new_order_id FROM orders WHERE idempotency_key = v_idempotency;
  IF FOUND THEN
    RETURN new_order_id;
  END IF;

  -- Verify each item price server-side
  IF items_param IS NOT NULL THEN
    FOR item IN SELECT * FROM json_array_elements(items_param)
    LOOP
      SELECT price, is_available INTO v_real_price, v_is_available
      FROM menu_items
      WHERE id = (item->>'menu_item_id')::uuid AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Article introuvable : %', item->>'menu_item_id';
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Article indisponible : %', item->>'menu_item_id';
      END IF;
      IF abs(v_real_price - (item->>'unit_price')::numeric) > 0.01 THEN
        RAISE EXCEPTION 'Prix incorrect pour l''article %. Prix attendu : %', item->>'menu_item_id', v_real_price;
      END IF;

      v_verified_total := v_verified_total + v_real_price * COALESCE((item->>'quantity')::integer, 1);
    END LOOP;
  END IF;

  INSERT INTO orders (user_id, restaurant_id, delivery_address, total_amount, delivery_fee, notes, metadata, checkout_id, idempotency_key, original_total)
  VALUES (auth.uid(), restaurant_id_param, delivery_address_param, total_amount_param, delivery_fee_param, notes_param, COALESCE(metadata_param::jsonb, '{}'::jsonb), checkout_id_param, v_idempotency, v_verified_total + delivery_fee_param)
  RETURNING id INTO new_order_id;

  IF items_param IS NOT NULL THEN
    FOR item IN SELECT * FROM json_array_elements(items_param)
    LOOP
      INSERT INTO order_items (order_id, menu_item_id, restaurant_id, quantity, unit_price, total_price, metadata)
      VALUES (
        new_order_id,
        (item->>'menu_item_id')::uuid,
        (item->>'restaurant_id')::uuid,
        COALESCE((item->>'quantity')::integer, 1),
        (item->>'unit_price')::numeric,
        (item->>'total_price')::numeric,
        COALESCE((item->>'metadata')::jsonb, '{}'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN new_order_id;
END; $$;
