ALTER TABLE public.order_groups
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS min_discount_percentage numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_discount_percentage numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS discount_step_percentage numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS final_discount_percentage numeric;

UPDATE public.order_groups
SET
  scheduled_at = COALESCE(scheduled_at, expires_at),
  lock_at = COALESCE(lock_at, expires_at),
  status = CASE
    WHEN is_active IS FALSE THEN 'closed'
    WHEN expires_at <= now() THEN 'locked'
    ELSE status
  END
WHERE scheduled_at IS NULL OR lock_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_groups_status_check'
      AND conrelid = 'public.order_groups'::regclass
  ) THEN
    ALTER TABLE public.order_groups
      ADD CONSTRAINT order_groups_status_check
      CHECK (status IN ('open', 'locked', 'payment_pending', 'processing', 'completed', 'closed', 'cancelled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.group_member_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.order_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  final_discount_percentage numeric NOT NULL DEFAULT 0,
  final_discount_amount numeric NOT NULL DEFAULT 0,
  final_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  payment_status text NOT NULL DEFAULT 'not_started',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  payment_due_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id),
  CONSTRAINT group_member_orders_status_check CHECK (status IN ('draft', 'joined', 'locked', 'payment_pending', 'paid', 'cancelled', 'expired')),
  CONSTRAINT group_member_orders_payment_status_check CHECK (payment_status IN ('not_started', 'pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS order_groups_status_lock_idx
  ON public.order_groups(status, lock_at, scheduled_at)
  WHERE status IN ('open', 'locked', 'payment_pending', 'processing');

CREATE INDEX IF NOT EXISTS order_groups_public_active_idx
  ON public.order_groups(is_active, status, lock_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS group_member_orders_group_status_idx
  ON public.group_member_orders(group_id, status, payment_status);

CREATE INDEX IF NOT EXISTS group_member_orders_user_created_idx
  ON public.group_member_orders(user_id, created_at DESC);

ALTER TABLE public.group_member_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_member_orders_select_related" ON public.group_member_orders;
CREATE POLICY "group_member_orders_select_related"
  ON public.group_member_orders
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "group_member_orders_insert_own" ON public.group_member_orders;
CREATE POLICY "group_member_orders_insert_own"
  ON public.group_member_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "group_member_orders_update_own_draft" ON public.group_member_orders;
CREATE POLICY "group_member_orders_update_own_draft"
  ON public.group_member_orders
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  );

CREATE OR REPLACE FUNCTION public.calculate_match_group_discount(p_member_count integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(30, GREATEST(5, 5 + (GREATEST(COALESCE(p_member_count, 1), 1) - 1) * 5))::numeric;
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
AS $$
  SELECT LEAST(
    GREATEST(COALESCE(p_max_discount, 30), COALESCE(p_min_discount, 5)),
    GREATEST(
      COALESCE(p_min_discount, 5),
      COALESCE(p_min_discount, 5) + (GREATEST(COALESCE(p_member_count, 1), 1) - 1) * GREATEST(COALESCE(p_step_discount, 5), 0)
    )
  )::numeric;
$$;

CREATE OR REPLACE FUNCTION public.touch_group_member_order_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_group_member_order_updated_at ON public.group_member_orders;
CREATE TRIGGER touch_group_member_order_updated_at
BEFORE UPDATE ON public.group_member_orders
FOR EACH ROW
EXECUTE FUNCTION public.touch_group_member_order_updated_at();

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
    AND payment_status NOT IN ('cancelled', 'failed', 'refunded');

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
  v_member_count integer;
  v_discount numeric;
  v_final_discount_amount numeric;
  v_final_total numeric;
  v_member_order_id uuid;
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
    RAISE EXCEPTION 'Ce groupe est ferme. Vous ne pouvez plus commander dedans.';
  END IF;

  SELECT count(*)::integer
  INTO v_member_count
  FROM public.group_member_orders
  WHERE group_id = p_group_id
    AND user_id <> v_user_id
    AND status IN ('joined', 'locked', 'payment_pending', 'paid')
    AND payment_status NOT IN ('cancelled', 'failed', 'refunded');

  IF v_member_count >= COALESCE(v_group.max_members, 6) THEN
    RAISE EXCEPTION 'Groupe complet';
  END IF;

  v_member_count := v_member_count + 1;
  v_discount := public.calculate_match_group_discount(
    v_member_count,
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
    COALESCE(p_metadata, '{}'::jsonb),
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
    metadata = EXCLUDED.metadata,
    payment_due_at = EXCLUDED.payment_due_at,
    cancelled_at = NULL,
    updated_at = now()
  RETURNING id INTO v_member_order_id;

  PERFORM public.refresh_match_group_discount(p_group_id);

  RETURN v_member_order_id;
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
      AND payment_status NOT IN ('cancelled', 'failed', 'refunded');

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
      status = CASE WHEN v_member_count > 0 THEN 'payment_pending' ELSE 'expired' END,
      final_discount_percentage = v_discount,
      final_discount_amount = round(subtotal * (v_discount / 100), 2),
      final_total = round(subtotal - (subtotal * (v_discount / 100)), 2),
      locked_at = now(),
      payment_due_at = now()
    WHERE group_id = v_group.id
      AND status = 'joined'
      AND payment_status NOT IN ('cancelled', 'failed', 'refunded');

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
    AND gmo.payment_status NOT IN ('cancelled', 'failed', 'refunded')
  WHERE og.is_active = true
    AND og.status = 'open'
    AND COALESCE(og.lock_at, og.expires_at) > now()
  GROUP BY og.id, r.id
  ORDER BY COALESCE(og.lock_at, og.expires_at) ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_match_group_member_order(uuid, jsonb, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_match_group_member_order(uuid, jsonb, numeric, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.close_due_match_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_due_match_groups() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_match_group_public_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_group_public_feed() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
