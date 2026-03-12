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
        'pickup_lat', dj.pickup_lat,
        'pickup_lng', dj.pickup_lng,
        'dropoff_lat', dj.dropoff_lat,
        'dropoff_lng', dj.dropoff_lng,
        'route_geometry', dj.route_geometry,
        'distance_meters', dj.distance_meters,
        'estimated_duration_minutes', dj.estimated_duration_minutes,
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
        'pickup_lat', dj.pickup_lat,
        'pickup_lng', dj.pickup_lng,
        'dropoff_lat', dj.dropoff_lat,
        'dropoff_lng', dj.dropoff_lng,
        'route_geometry', dj.route_geometry,
        'distance_meters', dj.distance_meters,
        'estimated_duration_minutes', dj.estimated_duration_minutes,
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
