CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.has_role(auth.uid(), 'admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.auth_owns_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_owns_courier(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.couriers c
    WHERE c.id = p_courier_id
      AND c.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_order_delivery(p_order_id uuid)
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
      FROM public.orders o
      WHERE o.id = p_order_id
        AND o.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = p_order_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_attempts da
      JOIN public.dispatch_jobs dj ON dj.id = da.dispatch_job_id
      JOIN public.couriers c ON c.id = da.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_order_delivery(p_order_id uuid)
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
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = p_order_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_courier(p_courier_id uuid)
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
      FROM public.couriers c
      WHERE c.id = p_courier_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.courier_id = p_courier_id
        AND (
          o.user_id = auth.uid()
          OR r.owner_id = auth.uid()
        )
        AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_dispatch_job(p_dispatch_job_id uuid)
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
      FROM public.dispatch_jobs dj
      WHERE dj.id = p_dispatch_job_id
        AND public.auth_can_view_order_delivery(dj.order_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_dispatch_job(p_dispatch_job_id uuid)
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
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.id = p_dispatch_job_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.id = p_dispatch_job_id
        AND c.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.auth_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_owns_restaurant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_owns_courier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_courier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_dispatch_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_dispatch_job(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owns_restaurant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owns_courier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_courier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_dispatch_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_dispatch_job(uuid) TO authenticated;

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Couriers manage own profile" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_select" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_insert" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_update" ON public.couriers;
DROP POLICY IF EXISTS "couriers_admin_all" ON public.couriers;
DROP POLICY IF EXISTS "couriers_client_active_order" ON public.couriers;

CREATE POLICY "couriers_select_safe" ON public.couriers
  FOR SELECT TO authenticated
  USING (public.auth_can_view_courier(id));

CREATE POLICY "couriers_insert_self" ON public.couriers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.auth_is_admin());

CREATE POLICY "couriers_update_self" ON public.couriers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.auth_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.auth_is_admin());

ALTER TABLE public.courier_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_shifts_own" ON public.courier_shifts;
DROP POLICY IF EXISTS "courier_shifts_admin" ON public.courier_shifts;
DROP POLICY IF EXISTS "Couriers manage own courier_shifts" ON public.courier_shifts;

CREATE POLICY "courier_shifts_select_safe" ON public.courier_shifts
  FOR SELECT TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

CREATE POLICY "courier_shifts_write_safe" ON public.courier_shifts
  FOR ALL TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_locations_own_insert" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_own_select" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_client_active" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_admin" ON public.courier_locations;
DROP POLICY IF EXISTS "Couriers manage own courier_locations" ON public.courier_locations;

CREATE POLICY "courier_locations_select_safe" ON public.courier_locations
  FOR SELECT TO authenticated
  USING (public.auth_can_view_courier(courier_id));

CREATE POLICY "courier_locations_insert_safe" ON public.courier_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatch_jobs_courier_select" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_courier_update" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_client_select" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_admin" ON public.dispatch_jobs;

CREATE POLICY "dispatch_jobs_select_safe" ON public.dispatch_jobs
  FOR SELECT TO authenticated
  USING (public.auth_can_view_dispatch_job(id));

CREATE POLICY "dispatch_jobs_update_safe" ON public.dispatch_jobs
  FOR UPDATE TO authenticated
  USING (public.auth_can_manage_dispatch_job(id))
  WITH CHECK (public.auth_can_manage_dispatch_job(id));

CREATE POLICY "dispatch_jobs_admin_safe" ON public.dispatch_jobs
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER TABLE public.dispatch_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatch_attempts_courier" ON public.dispatch_attempts;
DROP POLICY IF EXISTS "dispatch_attempts_admin" ON public.dispatch_attempts;

CREATE POLICY "dispatch_attempts_courier_safe" ON public.dispatch_attempts
  FOR ALL TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.courier_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_earnings_own" ON public.courier_earnings;
DROP POLICY IF EXISTS "courier_earnings_admin" ON public.courier_earnings;
DROP POLICY IF EXISTS "Couriers manage own courier_earnings" ON public.courier_earnings;

CREATE POLICY "courier_earnings_select_safe" ON public.courier_earnings
  FOR SELECT TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

CREATE POLICY "courier_earnings_admin_safe" ON public.courier_earnings
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their delivery tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "Restaurant owners can manage delivery tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "delivery_tracking_courier_select" ON public.delivery_tracking;

CREATE POLICY "delivery_tracking_select_safe" ON public.delivery_tracking
  FOR SELECT TO authenticated
  USING (public.auth_can_view_order_delivery(order_id));

CREATE POLICY "delivery_tracking_manage_safe" ON public.delivery_tracking
  FOR ALL TO authenticated
  USING (public.auth_can_manage_order_delivery(order_id))
  WITH CHECK (public.auth_can_manage_order_delivery(order_id));

CREATE OR REPLACE FUNCTION public.get_customer_orders_dashboard()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  restaurant jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'address', r.address,
      'city', r.city
    ) AS restaurant,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_orders_dashboard(p_restaurant_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  customer jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_admin() AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Acces refuse au restaurant %', p_restaurant_id;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'full_name', p.full_name,
      'phone', p.phone
    ) AS customer,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE o.restaurant_id = p_restaurant_id
  ORDER BY o.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_orders_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_restaurant_orders_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_orders_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_orders_dashboard(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
