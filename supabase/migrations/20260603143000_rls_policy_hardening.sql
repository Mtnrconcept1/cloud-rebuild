CREATE OR REPLACE FUNCTION public.auth_can_access_branch(p_branch_id uuid)
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
      FROM public.restaurant_branches rb
      WHERE rb.id = p_branch_id
        AND public.auth_owns_restaurant(rb.restaurant_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_reservation_slot(p_table_id uuid, p_reservation_id uuid)
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
      FROM public.reservation_tables rt
      JOIN public.restaurant_branches rb ON rb.id = rt.branch_id
      JOIN public.reservations rv ON rv.id = p_reservation_id
      WHERE rt.id = p_table_id
        AND rv.restaurant_id = rb.restaurant_id
        AND public.auth_owns_restaurant(rb.restaurant_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_reservation_slot(p_table_id uuid, p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_can_manage_reservation_slot(p_table_id, p_reservation_id)
    OR EXISTS (
      SELECT 1
      FROM public.reservations rv
      WHERE rv.id = p_reservation_id
        AND rv.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_table_layout_override(p_branch_id uuid, p_reservation_table_id uuid)
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
      FROM public.restaurant_branches rb
      JOIN public.reservation_tables rt ON rt.branch_id = rb.id
      WHERE rb.id = p_branch_id
        AND rt.id = p_reservation_table_id
        AND public.auth_owns_restaurant(rb.restaurant_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_access_order(p_order_id uuid)
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
        AND (
          o.user_id = auth.uid()
          OR public.auth_owns_restaurant(o.restaurant_id)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_can_access_branch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_reservation_slot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_reservation_slot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_table_layout_override(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_access_order(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_can_access_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_reservation_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_reservation_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_table_layout_override(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_order(uuid) TO authenticated;

ALTER TABLE public.restaurant_cuisines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for restaurant_cuisines" ON public.restaurant_cuisines;
DROP POLICY IF EXISTS "restaurant_cuisines_public_select" ON public.restaurant_cuisines;
DROP POLICY IF EXISTS "restaurant_cuisines_owner_insert" ON public.restaurant_cuisines;
DROP POLICY IF EXISTS "restaurant_cuisines_owner_delete" ON public.restaurant_cuisines;

CREATE POLICY "restaurant_cuisines_public_select"
  ON public.restaurant_cuisines
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "restaurant_cuisines_owner_insert"
  ON public.restaurant_cuisines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id));

CREATE POLICY "restaurant_cuisines_owner_delete"
  ON public.restaurant_cuisines
  FOR DELETE
  TO authenticated
  USING (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id));

REVOKE INSERT, UPDATE, DELETE ON public.restaurant_cuisines FROM authenticated;
GRANT SELECT ON public.restaurant_cuisines TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.restaurant_set_cuisines(p_restaurant_id uuid, p_cuisine_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id is required';
  END IF;

  IF NOT public.auth_is_admin() AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Access denied for restaurant %', p_restaurant_id;
  END IF;

  DELETE FROM public.restaurant_cuisines
  WHERE restaurant_id = p_restaurant_id;

  INSERT INTO public.restaurant_cuisines (restaurant_id, cuisine_id)
  SELECT p_restaurant_id, cuisine_id
  FROM (
    SELECT DISTINCT unnest(COALESCE(p_cuisine_ids, '{}'::uuid[])) AS cuisine_id
  ) selected
  WHERE cuisine_id IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_set_cuisines(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_set_cuisines(uuid, uuid[]) TO authenticated;

ALTER TABLE public.restaurant_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for restaurant_branches" ON public.restaurant_branches;
DROP POLICY IF EXISTS "restaurant_branches_owner_admin_select" ON public.restaurant_branches;
DROP POLICY IF EXISTS "restaurant_branches_owner_admin_insert" ON public.restaurant_branches;
DROP POLICY IF EXISTS "restaurant_branches_owner_admin_update" ON public.restaurant_branches;
DROP POLICY IF EXISTS "restaurant_branches_owner_admin_delete" ON public.restaurant_branches;

CREATE POLICY "restaurant_branches_owner_admin_select"
  ON public.restaurant_branches
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id));

CREATE POLICY "restaurant_branches_owner_admin_insert"
  ON public.restaurant_branches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id));

CREATE POLICY "restaurant_branches_owner_admin_update"
  ON public.restaurant_branches
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id))
  WITH CHECK (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id));

CREATE POLICY "restaurant_branches_owner_admin_delete"
  ON public.restaurant_branches
  FOR DELETE
  TO authenticated
  USING (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id));

REVOKE ALL ON public.restaurant_branches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_branches TO authenticated;

ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for reservation_tables" ON public.reservation_tables;
DROP POLICY IF EXISTS "reservation_tables_owner_admin_select" ON public.reservation_tables;
DROP POLICY IF EXISTS "reservation_tables_owner_admin_insert" ON public.reservation_tables;
DROP POLICY IF EXISTS "reservation_tables_owner_admin_update" ON public.reservation_tables;
DROP POLICY IF EXISTS "reservation_tables_owner_admin_delete" ON public.reservation_tables;

CREATE POLICY "reservation_tables_owner_admin_select"
  ON public.reservation_tables
  FOR SELECT
  TO authenticated
  USING (public.auth_can_access_branch(branch_id));

CREATE POLICY "reservation_tables_owner_admin_insert"
  ON public.reservation_tables
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_can_access_branch(branch_id));

CREATE POLICY "reservation_tables_owner_admin_update"
  ON public.reservation_tables
  FOR UPDATE
  TO authenticated
  USING (public.auth_can_access_branch(branch_id))
  WITH CHECK (public.auth_can_access_branch(branch_id));

CREATE POLICY "reservation_tables_owner_admin_delete"
  ON public.reservation_tables
  FOR DELETE
  TO authenticated
  USING (public.auth_can_access_branch(branch_id));

REVOKE ALL ON public.reservation_tables FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_tables TO authenticated;

ALTER TABLE public.reservation_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for reservation_slots" ON public.reservation_slots;
DROP POLICY IF EXISTS "reservation_slots_related_select" ON public.reservation_slots;
DROP POLICY IF EXISTS "reservation_slots_owner_admin_write" ON public.reservation_slots;

CREATE POLICY "reservation_slots_related_select"
  ON public.reservation_slots
  FOR SELECT
  TO authenticated
  USING (public.auth_can_view_reservation_slot(table_id, reservation_id));

CREATE POLICY "reservation_slots_owner_admin_write"
  ON public.reservation_slots
  FOR ALL
  TO authenticated
  USING (public.auth_can_manage_reservation_slot(table_id, reservation_id))
  WITH CHECK (public.auth_can_manage_reservation_slot(table_id, reservation_id));

REVOKE ALL ON public.reservation_slots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_slots TO authenticated;

ALTER TABLE public.reservation_table_layout_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for reservation_table_layout_overrides" ON public.reservation_table_layout_overrides;
DROP POLICY IF EXISTS "reservation_table_layout_overrides_owner_admin_select" ON public.reservation_table_layout_overrides;
DROP POLICY IF EXISTS "reservation_table_layout_overrides_owner_admin_write" ON public.reservation_table_layout_overrides;

CREATE POLICY "reservation_table_layout_overrides_owner_admin_select"
  ON public.reservation_table_layout_overrides
  FOR SELECT
  TO authenticated
  USING (public.auth_can_manage_table_layout_override(branch_id, reservation_table_id));

CREATE POLICY "reservation_table_layout_overrides_owner_admin_write"
  ON public.reservation_table_layout_overrides
  FOR ALL
  TO authenticated
  USING (public.auth_can_manage_table_layout_override(branch_id, reservation_table_id))
  WITH CHECK (public.auth_can_manage_table_layout_override(branch_id, reservation_table_id));

REVOKE ALL ON public.reservation_table_layout_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_table_layout_overrides TO authenticated;

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for order_events" ON public.order_events;
DROP POLICY IF EXISTS "order_events_related_select" ON public.order_events;
DROP POLICY IF EXISTS "order_events_related_insert" ON public.order_events;

CREATE POLICY "order_events_related_select"
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (public.auth_can_access_order(order_id));

REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM authenticated;
GRANT SELECT ON public.order_events TO authenticated;

CREATE OR REPLACE FUNCTION public.track_order_event(p_order_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id is required';
  END IF;

  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'event_type is required';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.auth_can_access_order(p_order_id) THEN
    RAISE EXCEPTION 'Access denied for order %', p_order_id;
  END IF;

  INSERT INTO public.order_events (order_id, event_type, payload)
  VALUES (p_order_id, p_event_type, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.track_order_event(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_order_event(uuid, text, jsonb) TO authenticated, service_role;

ALTER TABLE public.proof_of_delivery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for proof_of_delivery" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_insert" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_update" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_client_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_restaurant_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_admin_all" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_admin_select" ON public.proof_of_delivery;

CREATE POLICY "proof_of_delivery_courier_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_courier(courier_id));

CREATE POLICY "proof_of_delivery_client_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (public.auth_can_view_dispatch_job(dispatch_job_id));

CREATE POLICY "proof_of_delivery_restaurant_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (public.auth_can_view_dispatch_job(dispatch_job_id));

CREATE POLICY "proof_of_delivery_admin_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.proof_of_delivery FROM authenticated;
GRANT SELECT ON public.proof_of_delivery TO authenticated;

NOTIFY pgrst, 'reload schema';
