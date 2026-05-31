-- Match Groupes production rules:
-- - fixed 30-minute countdown
-- - 0% start, +5% per prepaid participant
-- - 50% max discount, 10 prepaid participants max
-- - clients authorize/prepay immediately; final amount is captured after countdown

ALTER TABLE public.order_groups
  ALTER COLUMN min_discount_percentage SET DEFAULT 0,
  ALTER COLUMN max_discount_percentage SET DEFAULT 50,
  ALTER COLUMN discount_step_percentage SET DEFAULT 5;

UPDATE public.order_groups
SET
  min_discount_percentage = 0,
  max_discount_percentage = 50,
  discount_step_percentage = 5,
  max_members = LEAST(GREATEST(COALESCE(max_members, 10), 2), 10),
  discount_percentage = CASE WHEN status = 'open' THEN LEAST(50, GREATEST(0, COALESCE(discount_percentage, 0))) ELSE discount_percentage END
WHERE status IN ('open', 'locked', 'payment_pending');

CREATE OR REPLACE FUNCTION public.calculate_match_group_discount(p_member_count integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT LEAST(50, GREATEST(0, GREATEST(COALESCE(p_member_count, 0), 0) * 5))::numeric;
$$;

CREATE OR REPLACE FUNCTION public.calculate_match_group_discount(
  p_member_count integer,
  p_min_discount numeric,
  p_max_discount numeric,
  p_step_discount numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT LEAST(
    GREATEST(COALESCE(p_max_discount, 50), COALESCE(p_min_discount, 0)),
    GREATEST(
      COALESCE(p_min_discount, 0),
      GREATEST(COALESCE(p_member_count, 0), 0) * GREATEST(COALESCE(p_step_discount, 5), 0)
    )
  )::numeric;
$$;

CREATE OR REPLACE FUNCTION public.create_match_group(
  p_restaurant_id uuid,
  p_area text,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_max_members integer DEFAULT 10
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_lock_at timestamptz := now() + interval '30 minutes';
  v_time_slot text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.delivery_available, true) = true
  ) THEN
    RAISE EXCEPTION 'Restaurant indisponible';
  END IF;

  v_time_slot := 'Fin ' || to_char(v_lock_at AT TIME ZONE 'Europe/Zurich', 'HH24:MI');

  INSERT INTO public.order_groups (
    restaurant_id,
    creator_id,
    area,
    time_slot,
    max_members,
    discount_percentage,
    expires_at,
    scheduled_at,
    lock_at,
    status,
    is_active,
    min_discount_percentage,
    max_discount_percentage,
    discount_step_percentage
  )
  VALUES (
    p_restaurant_id,
    v_user_id,
    COALESCE(NULLIF(p_area, ''), 'Ma position'),
    v_time_slot,
    10,
    0,
    v_lock_at,
    v_lock_at,
    v_lock_at,
    'open',
    true,
    0,
    50,
    5
  )
  RETURNING id INTO v_group_id;

  RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_match_group_discount(p_group_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.order_groups%ROWTYPE;
  v_member_count integer;
  v_discount numeric;
BEGIN
  SELECT * INTO v_group
  FROM public.order_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'Groupe introuvable';
  END IF;

  SELECT count(*)::integer
  INTO v_member_count
  FROM public.group_member_orders
  WHERE group_id = p_group_id
    AND status IN ('joined', 'locked', 'payment_pending', 'paid')
    AND payment_status IN ('authorized', 'captured');

  v_discount := public.calculate_match_group_discount(
    v_member_count,
    v_group.min_discount_percentage,
    v_group.max_discount_percentage,
    v_group.discount_step_percentage
  );

  IF v_group.status = 'open' THEN
    UPDATE public.order_groups
    SET discount_percentage = v_discount
    WHERE id = p_group_id;
  END IF;

  RETURN v_discount;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_match_group_member_order(
  p_group_id uuid,
  p_items jsonb,
  p_subtotal numeric,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group public.order_groups%ROWTYPE;
  v_reserved_count integer;
  v_authorized_count integer;
  v_discount numeric;
  v_final_discount_amount numeric;
  v_final_total numeric;
  v_member_order_id uuid;
  v_existing_payment_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_group
  FROM public.order_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'Groupe introuvable';
  END IF;

  IF v_group.status <> 'open' OR v_group.is_active IS DISTINCT FROM true OR COALESCE(v_group.lock_at, v_group.expires_at) <= now() THEN
    RAISE EXCEPTION 'Ce groupe est fermé. Vous ne pouvez plus commander dedans.';
  END IF;

  SELECT payment_status INTO v_existing_payment_status
  FROM public.group_member_orders
  WHERE group_id = p_group_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF v_existing_payment_status IN ('authorized', 'captured') THEN
    RAISE EXCEPTION 'Cette commande est déjà prépayée et envoyée au restaurant.';
  END IF;

  SELECT count(*)::integer
  INTO v_reserved_count
  FROM public.group_member_orders
  WHERE group_id = p_group_id
    AND user_id <> v_user_id
    AND status IN ('joined', 'locked', 'payment_pending', 'paid')
    AND payment_status IN ('pending', 'authorized', 'captured');

  IF v_reserved_count >= 10 THEN
    RAISE EXCEPTION 'Groupe complet';
  END IF;

  SELECT count(*)::integer
  INTO v_authorized_count
  FROM public.group_member_orders
  WHERE group_id = p_group_id
    AND status IN ('joined', 'locked', 'payment_pending', 'paid')
    AND payment_status IN ('authorized', 'captured');

  v_discount := public.calculate_match_group_discount(
    v_authorized_count,
    v_group.min_discount_percentage,
    v_group.max_discount_percentage,
    v_group.discount_step_percentage
  );
  v_final_discount_amount := round(GREATEST(COALESCE(p_subtotal, 0), 0) * (v_discount / 100), 2);
  v_final_total := round(GREATEST(COALESCE(p_subtotal, 0), 0) - v_final_discount_amount, 2);

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (p_group_id, v_user_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.group_member_orders (
    group_id,
    user_id,
    restaurant_id,
    items,
    subtotal,
    final_discount_percentage,
    final_discount_amount,
    final_total,
    status,
    payment_status,
    metadata,
    payment_due_at
  )
  VALUES (
    p_group_id,
    v_user_id,
    v_group.restaurant_id,
    COALESCE(p_items, '[]'::jsonb),
    round(GREATEST(COALESCE(p_subtotal, 0), 0), 2),
    v_discount,
    v_final_discount_amount,
    v_final_total,
    'joined',
    'not_started',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('prepayment_required', true),
    COALESCE(v_group.lock_at, v_group.expires_at)
  )
  ON CONFLICT (group_id, user_id) DO UPDATE
  SET
    items = EXCLUDED.items,
    subtotal = EXCLUDED.subtotal,
    final_discount_percentage = EXCLUDED.final_discount_percentage,
    final_discount_amount = EXCLUDED.final_discount_amount,
    final_total = EXCLUDED.final_total,
    status = 'joined',
    payment_status = 'not_started',
    stripe_checkout_session_id = NULL,
    stripe_payment_intent_id = NULL,
    authorization_amount = NULL,
    authorized_at = NULL,
    metadata = EXCLUDED.metadata,
    payment_due_at = EXCLUDED.payment_due_at,
    cancelled_at = NULL,
    updated_at = now()
  RETURNING id INTO v_member_order_id;

  PERFORM public.refresh_match_group_discount(p_group_id);

  RETURN v_member_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_match_group_member_authorized(
  p_member_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_authorized_amount numeric,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  UPDATE public.group_member_orders
  SET
    status = 'joined',
    payment_status = 'authorized',
    stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_checkout_session_id),
    stripe_payment_intent_id = p_payment_intent_id,
    authorization_amount = p_authorized_amount,
    authorized_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
      || COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'sent_to_restaurant_at', now(),
        'restaurant_preorder_status', 'received_after_prepayment'
      ),
    last_payment_error = NULL,
    updated_at = now()
  WHERE id = p_member_order_id
    AND stripe_checkout_session_id = p_checkout_session_id
  RETURNING group_id INTO v_group_id;

  IF v_group_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM public.refresh_match_group_discount(v_group_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_due_match_groups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group record;
  v_member_count integer;
  v_discount numeric;
  v_closed_count integer := 0;
BEGIN
  FOR v_group IN
    SELECT *
    FROM public.order_groups
    WHERE status = 'open'
      AND is_active = true
      AND COALESCE(lock_at, expires_at) <= now()
    FOR UPDATE
  LOOP
    SELECT count(*)::integer INTO v_member_count
    FROM public.group_member_orders
    WHERE group_id = v_group.id
      AND status = 'joined'
      AND payment_status = 'authorized';

    v_discount := public.calculate_match_group_discount(
      v_member_count,
      v_group.min_discount_percentage,
      v_group.max_discount_percentage,
      v_group.discount_step_percentage
    );

    UPDATE public.order_groups
    SET
      status = CASE WHEN v_member_count > 0 THEN 'payment_pending' ELSE 'closed' END,
      is_active = false,
      closed_at = now(),
      final_discount_percentage = v_discount,
      discount_percentage = v_discount
    WHERE id = v_group.id;

    UPDATE public.group_member_orders
    SET
      status = 'payment_pending',
      final_discount_percentage = v_discount,
      final_discount_amount = round(subtotal * (v_discount / 100), 2),
      final_total = round(subtotal - (subtotal * (v_discount / 100)), 2),
      locked_at = now(),
      payment_due_at = now(),
      updated_at = now()
    WHERE group_id = v_group.id
      AND status = 'joined'
      AND payment_status = 'authorized';

    UPDATE public.group_member_orders
    SET
      status = 'expired',
      payment_status = CASE WHEN payment_status = 'pending' THEN 'cancelled' ELSE payment_status END,
      locked_at = now(),
      payment_due_at = now(),
      updated_at = now()
    WHERE group_id = v_group.id
      AND status = 'joined'
      AND payment_status <> 'authorized';

    v_closed_count := v_closed_count + 1;
  END LOOP;

  RETURN v_closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_match_group_public_feed()
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  creator_id uuid,
  area text,
  time_slot text,
  max_members integer,
  discount_percentage numeric,
  final_discount_percentage numeric,
  status text,
  is_active boolean,
  expires_at timestamptz,
  scheduled_at timestamptz,
  lock_at timestamptz,
  member_count integer,
  restaurant jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    og.id,
    og.restaurant_id,
    og.creator_id,
    og.area,
    og.time_slot,
    og.max_members,
    og.discount_percentage,
    og.final_discount_percentage,
    og.status,
    og.is_active,
    og.expires_at,
    og.scheduled_at,
    COALESCE(og.lock_at, og.expires_at) AS lock_at,
    COALESCE(count(gmo.id), 0)::integer AS member_count,
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'cuisine_type', r.cuisine_type,
      'image_url', r.image_url,
      'city', r.city
    ) AS restaurant
  FROM public.order_groups og
  JOIN public.restaurants r ON r.id = og.restaurant_id
  LEFT JOIN public.group_member_orders gmo
    ON gmo.group_id = og.id
    AND gmo.status IN ('joined', 'locked', 'payment_pending', 'paid')
    AND gmo.payment_status IN ('authorized', 'captured')
  WHERE og.is_active = true
    AND og.status = 'open'
    AND COALESCE(og.lock_at, og.expires_at) > now()
  GROUP BY og.id, r.id
  ORDER BY COALESCE(og.lock_at, og.expires_at) ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.create_match_group(uuid, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_match_group(uuid, text, timestamptz, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_match_group_member_order(uuid, jsonb, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_match_group_member_order(uuid, jsonb, numeric, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_match_group_member_authorized(uuid, text, text, numeric, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.close_due_match_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_due_match_groups() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_match_group_public_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_group_public_feed() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
